use serde::Serialize;

/// "v1.2.3" 또는 "1.2.3" → (1,2,3).
fn parse_version(s: &str) -> Option<(u64, u64, u64)> {
    let s = s.trim().trim_start_matches(['v', 'V']);
    let mut parts = s.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    // patch에 "-beta" 등 접미사가 붙을 수 있어 숫자 앞부분만 파싱
    let patch_raw = parts.next().unwrap_or("0");
    let patch_num: String = patch_raw.chars().take_while(|c| c.is_ascii_digit()).collect();
    let patch = patch_num.parse().unwrap_or(0);
    Some((major, minor, patch))
}

/// candidate가 current보다 높은 버전이면 true.
pub fn is_newer(current: &str, candidate: &str) -> bool {
    match (parse_version(current), parse_version(candidate)) {
        (Some(c), Some(n)) => n > c,
        _ => false,
    }
}

/// 릴리스 확인 결과(프론트로 전달).
#[derive(Debug, Serialize, PartialEq)]
pub struct UpdateCheck {
    pub current: String,
    pub latest_tag: String,
    pub newer: bool,
    pub html_url: String,
    pub apk_url: Option<String>,
}

/// GitHub 최신 릴리스를 조회해 업데이트 가능 여부를 판단한다.
/// owner_repo 예: "octocat/notes".
pub async fn check_github_release(
    owner_repo: &str,
    current_version: &str,
) -> Result<UpdateCheck, String> {
    let url = format!("https://api.github.com/repos/{owner_repo}/releases/latest");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "git_note")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let latest_tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or("릴리스 tag_name 없음")?
        .to_string();
    let html_url = json
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let apk_url = json
        .get("assets")
        .and_then(|v| v.as_array())
        .and_then(|assets| {
            assets.iter().find_map(|a| {
                let name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if name.ends_with(".apk") {
                    a.get("browser_download_url")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                } else {
                    None
                }
            })
        });

    let newer = is_newer(current_version, &latest_tag);
    Ok(UpdateCheck {
        current: current_version.to_string(),
        latest_tag,
        newer,
        html_url,
        apk_url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_detects_higher_versions() {
        assert!(is_newer("1.0.0", "1.0.1"));
        assert!(is_newer("1.0.0", "1.1.0"));
        assert!(is_newer("1.0.0", "2.0.0"));
        assert!(is_newer("v1.2.3", "v1.2.4"));
    }

    #[test]
    fn newer_false_for_same_or_older() {
        assert!(!is_newer("1.0.0", "1.0.0"));
        assert!(!is_newer("2.0.0", "1.9.9"));
        assert!(!is_newer("1.2.0", "1.1.9"));
    }

    #[test]
    fn parses_tag_with_suffix() {
        assert!(is_newer("1.0.0", "1.0.1-beta"));
        assert!(!is_newer("1.0.1", "1.0.1-beta"));
    }
}
