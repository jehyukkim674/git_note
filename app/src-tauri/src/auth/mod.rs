use serde::{Deserialize, Serialize};

const SERVICE: &str = "git_note";
const ACCOUNT: &str = "github_token";

/// device flow 시작 응답.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

/// 토큰 폴링 상태.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "status", content = "detail")]
pub enum PollStatus {
    Pending,
    SlowDown,
    Authorized,
    Denied,
    Expired,
    Error(String),
}

/// GitHub access_token 응답(JSON)을 상태로 분류한다. (순수 함수 — 테스트 대상)
pub fn classify_token_response(json: &serde_json::Value) -> PollStatus {
    if json.get("access_token").and_then(|v| v.as_str()).is_some() {
        return PollStatus::Authorized;
    }
    match json.get("error").and_then(|v| v.as_str()) {
        Some("authorization_pending") => PollStatus::Pending,
        Some("slow_down") => PollStatus::SlowDown,
        Some("access_denied") => PollStatus::Denied,
        Some("expired_token") => PollStatus::Expired,
        Some(other) => PollStatus::Error(other.to_string()),
        None => PollStatus::Error("unknown response".to_string()),
    }
}

/// GitHub 사용자 정보(커밋 작성자 자동 설정용).
#[derive(Debug, PartialEq)]
pub struct GitHubUser {
    pub login: String,
    pub email: Option<String>,
}

/// /user 응답 JSON을 파싱한다(순수 함수 — 테스트 대상).
pub fn parse_user(json: &serde_json::Value) -> Option<GitHubUser> {
    let login = json.get("login")?.as_str()?.to_string();
    let email = json
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Some(GitHubUser { login, email })
}

/// 인증된 사용자 정보를 가져온다.
pub async fn fetch_user(token: &str) -> Result<GitHubUser, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/user")
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "git_note")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    parse_user(&json).ok_or_else(|| "사용자 정보를 파싱할 수 없습니다".to_string())
}

/// device flow를 시작한다.
pub async fn start_device_flow(client_id: &str) -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", "repo")])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.json::<DeviceCodeResponse>()
        .await
        .map_err(|e| e.to_string())
}

/// 토큰을 한 번 폴링한다. Authorized면 토큰을 함께 돌려준다.
pub async fn poll_once(
    client_id: &str,
    device_code: &str,
) -> Result<(PollStatus, Option<String>), String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let status = classify_token_response(&json);
    let token = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Ok((status, token))
}

/// 토큰을 OS 보안 저장소에 저장한다.
pub fn store_token(token: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

/// 저장된 토큰을 읽는다(없으면 None).
pub fn get_token() -> Option<String> {
    keyring::Entry::new(SERVICE, ACCOUNT)
        .ok()?
        .get_password()
        .ok()
}

/// 저장된 토큰을 삭제한다.
pub fn delete_token() -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn classify_authorized() {
        let j = json!({ "access_token": "gho_xxx", "token_type": "bearer" });
        assert_eq!(classify_token_response(&j), PollStatus::Authorized);
    }

    #[test]
    fn classify_pending_and_slowdown() {
        assert_eq!(
            classify_token_response(&json!({ "error": "authorization_pending" })),
            PollStatus::Pending
        );
        assert_eq!(
            classify_token_response(&json!({ "error": "slow_down" })),
            PollStatus::SlowDown
        );
    }

    #[test]
    fn classify_denied_and_expired() {
        assert_eq!(
            classify_token_response(&json!({ "error": "access_denied" })),
            PollStatus::Denied
        );
        assert_eq!(
            classify_token_response(&json!({ "error": "expired_token" })),
            PollStatus::Expired
        );
    }

    #[test]
    fn classify_unknown_is_error() {
        assert!(matches!(
            classify_token_response(&json!({ "error": "weird" })),
            PollStatus::Error(_)
        ));
    }

    #[test]
    fn parse_user_extracts_login_and_email() {
        let j = json!({ "login": "octocat", "email": "o@example.com" });
        assert_eq!(
            parse_user(&j),
            Some(GitHubUser {
                login: "octocat".into(),
                email: Some("o@example.com".into())
            })
        );
    }

    #[test]
    fn parse_user_handles_null_email() {
        let j = json!({ "login": "octocat", "email": null });
        assert_eq!(
            parse_user(&j),
            Some(GitHubUser { login: "octocat".into(), email: None })
        );
    }

    #[test]
    fn parse_user_none_without_login() {
        assert_eq!(parse_user(&json!({ "id": 1 })), None);
    }
}
