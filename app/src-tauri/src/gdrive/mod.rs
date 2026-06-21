// Google Drive 동기화: 데스크톱 루프백 OAuth + Drive REST.
// git 대신 개인 구글 드라이브의 폴더와 보관함(.md)을 양방향 동기화한다.
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;

const SERVICE: &str = "git_note";
const ACCOUNT: &str = "google_refresh_token";
const FOLDER_NAME: &str = "git_note";
const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";

#[derive(Debug, serde::Serialize)]
pub struct DriveSyncResult {
    pub pulled: usize,
    pub pushed: usize,
}

#[derive(serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(serde::Deserialize)]
struct DriveFile {
    id: String,
    name: String,
    #[serde(rename = "modifiedTime")]
    modified_time: Option<String>,
}

#[derive(serde::Deserialize)]
struct FileList {
    files: Vec<DriveFile>,
}

fn store_refresh(token: &str) -> Result<(), String> {
    keyring::Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| e.to_string())?
        .set_password(token)
        .map_err(|e| e.to_string())
}

pub fn get_refresh() -> Option<String> {
    keyring::Entry::new(SERVICE, ACCOUNT).ok()?.get_password().ok()
}

pub fn logout() {
    if let Ok(e) = keyring::Entry::new(SERVICE, ACCOUNT) {
        let _ = e.delete_credential();
    }
}

pub fn is_connected() -> bool {
    get_refresh().is_some()
}

/// 루프백 OAuth로 사용자를 인증하고 refresh token을 저장한다.
/// 브라우저를 열고, 127.0.0.1 임시 포트로 리디렉션 코드를 수신한다.
pub async fn connect(client_id: &str, client_secret: &str) -> Result<(), String> {
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|e| format!("로컬 포트 바인드 실패: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        urlencode(client_id),
        urlencode(&redirect),
        urlencode(SCOPE)
    );
    // 브라우저 열기(실패해도 무시).
    open_browser(&auth_url);

    // 한 번의 리디렉션 요청에서 code 추출(블로킹).
    let code = accept_code(&listener)?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let tok: TokenResponse = resp.json().await.map_err(|e| e.to_string())?;
    let refresh = tok
        .refresh_token
        .ok_or_else(|| "refresh token이 반환되지 않았습니다(동의 화면에서 오프라인 접근 허용 필요).".to_string())?;
    store_refresh(&refresh)?;
    Ok(())
}

/// refresh token으로 access token을 발급한다.
async fn access_token(client_id: &str, client_secret: &str) -> Result<String, String> {
    let refresh = get_refresh().ok_or_else(|| "구글 드라이브에 연결되어 있지 않습니다.".to_string())?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh.as_str()),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let tok: TokenResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(tok.access_token)
}

/// 동기화 폴더를 찾거나 만든다. 폴더 ID를 돌려준다.
async fn ensure_folder(at: &str, existing: Option<&str>) -> Result<String, String> {
    let client = reqwest::Client::new();
    if let Some(id) = existing {
        // 존재 확인(삭제됐으면 새로 만든다).
        let ok = client
            .get(format!("https://www.googleapis.com/drive/v3/files/{id}?fields=id,trashed"))
            .bearer_auth(at)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if ok {
            return Ok(id.to_string());
        }
    }
    let q = format!(
        "name='{FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    );
    let list: FileList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .query(&[("q", q.as_str()), ("fields", "files(id,name)")])
        .bearer_auth(at)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(f) = list.files.into_iter().next() {
        return Ok(f.id);
    }
    // 생성.
    let body = serde_json::json!({
        "name": FOLDER_NAME,
        "mimeType": "application/vnd.google-apps.folder"
    });
    let created: DriveFile = client
        .post("https://www.googleapis.com/drive/v3/files")
        .query(&[("fields", "id,name")])
        .bearer_auth(at)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(created.id)
}

async fn list_folder(at: &str, folder_id: &str) -> Result<Vec<DriveFile>, String> {
    let client = reqwest::Client::new();
    let q = format!("'{folder_id}' in parents and trashed=false");
    let list: FileList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .query(&[
            ("q", q.as_str()),
            ("fields", "files(id,name,modifiedTime)"),
            ("pageSize", "1000"),
        ])
        .bearer_auth(at)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(list.files)
}

async fn download(at: &str, file_id: &str) -> Result<String, String> {
    reqwest::Client::new()
        .get(format!("https://www.googleapis.com/drive/v3/files/{file_id}"))
        .query(&[("alt", "media")])
        .bearer_auth(at)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())
}

async fn create_file(at: &str, folder_id: &str, name: &str, content: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "name": name, "parents": [folder_id], "mimeType": "text/markdown" });
    let created: DriveFile = client
        .post("https://www.googleapis.com/drive/v3/files")
        .query(&[("fields", "id")])
        .bearer_auth(at)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    update_content(at, &created.id, content).await
}

async fn update_content(at: &str, file_id: &str, content: &str) -> Result<(), String> {
    reqwest::Client::new()
        .patch(format!("https://www.googleapis.com/upload/drive/v3/files/{file_id}"))
        .query(&[("uploadType", "media")])
        .bearer_auth(at)
        .header("Content-Type", "text/markdown")
        .body(content.to_string())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 보관함(.md)과 Drive 폴더를 양방향 동기화한다(수정시각이 더 최신인 쪽 우선).
pub async fn sync(
    root: &Path,
    client_id: &str,
    client_secret: &str,
    folder_id: Option<&str>,
) -> Result<(DriveSyncResult, String), String> {
    let at = access_token(client_id, client_secret).await?;
    let folder = ensure_folder(&at, folder_id).await?;
    let remote = list_folder(&at, &folder).await?;

    let mut pulled = 0usize;
    let mut pushed = 0usize;

    // 로컬 파일 수집(.md만, 최상위 + 하위 폴더는 경로를 파일명에 인코딩하지 않고 단순화: 최상위만 v1).
    let local = local_md_files(root)?;

    // 원격 → 로컬
    for rf in &remote {
        if !rf.name.ends_with(".md") {
            continue;
        }
        let local_path = root.join(&rf.name);
        let remote_ms = rf.modified_time.as_deref().and_then(parse_rfc3339_ms).unwrap_or(0);
        let local_ms = local
            .iter()
            .find(|(n, _)| n == &rf.name)
            .map(|(_, ms)| *ms)
            .unwrap_or(0);
        if !local_path.exists() || remote_ms > local_ms {
            let content = download(&at, &rf.id).await?;
            if let Some(p) = local_path.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            std::fs::write(&local_path, content).map_err(|e| e.to_string())?;
            pulled += 1;
        }
    }

    // 로컬 → 원격
    for (name, local_ms) in &local {
        let content = std::fs::read_to_string(root.join(name)).map_err(|e| e.to_string())?;
        match remote.iter().find(|r| &r.name == name) {
            Some(rf) => {
                let remote_ms = rf.modified_time.as_deref().and_then(parse_rfc3339_ms).unwrap_or(0);
                if *local_ms > remote_ms {
                    update_content(&at, &rf.id, &content).await?;
                    pushed += 1;
                }
            }
            None => {
                create_file(&at, &folder, name, &content).await?;
                pushed += 1;
            }
        }
    }

    Ok((DriveSyncResult { pulled, pushed }, folder))
}

/// 최상위 .md 파일 목록과 수정시각(ms)을 돌려준다(v1: 최상위만).
fn local_md_files(root: &Path) -> Result<Vec<(String, u64)>, String> {
    let mut out = Vec::new();
    let rd = match std::fs::read_dir(root) {
        Ok(rd) => rd,
        Err(_) => return Ok(out),
    };
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".md") {
            continue;
        }
        let ms = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push((name, ms));
    }
    Ok(out)
}

/// RFC3339 시각을 epoch ms로(대략, 초 단위까지). 파싱 실패 시 None.
fn parse_rfc3339_ms(s: &str) -> Option<u64> {
    // 형식: 2026-06-21T12:34:56.789Z
    let bytes = s.as_bytes();
    if s.len() < 19 {
        return None;
    }
    let num = |a: usize, b: usize| -> Option<i64> {
        std::str::from_utf8(&bytes[a..b]).ok()?.parse().ok()
    };
    let y = num(0, 4)?;
    let mo = num(5, 7)?;
    let d = num(8, 10)?;
    let h = num(11, 13)?;
    let mi = num(14, 16)?;
    let se = num(17, 19)?;
    // 간단한 그레고리력 → epoch days 계산.
    let days = days_from_civil(y, mo, d);
    let secs = days * 86400 + h * 3600 + mi * 60 + se;
    Some((secs.max(0) as u64) * 1000)
}

/// Howard Hinnant's days_from_civil (UTC 가정).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn open_browser(url: &str) {
    use std::process::Command;
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(url).spawn();
    #[cfg(target_os = "windows")]
    let _ = Command::new("cmd").args(["/C", "start", "", url]).spawn();
    #[cfg(target_os = "linux")]
    let _ = Command::new("xdg-open").arg(url).spawn();
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 루프백 리스너에서 한 요청을 받아 ?code= 값을 추출한다.
fn accept_code(listener: &TcpListener) -> Result<String, String> {
    let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let first = req.lines().next().unwrap_or("");
    // "GET /?code=XXXX&scope=... HTTP/1.1"
    let code = first
        .split_whitespace()
        .nth(1)
        .and_then(|path| path.split('?').nth(1))
        .and_then(|qs| {
            qs.split('&').find_map(|kv| {
                let mut it = kv.splitn(2, '=');
                if it.next() == Some("code") {
                    it.next().map(|v| v.to_string())
                } else {
                    None
                }
            })
        });
    let body = "<html><body style='font-family:sans-serif;background:#1e1e1e;color:#d4d4d4;text-align:center;padding-top:80px'><h2>git_note 연결 완료</h2><p>이 창을 닫고 앱으로 돌아가세요.</p></body></html>";
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
    code.ok_or_else(|| "리디렉션에서 인증 코드를 받지 못했습니다.".to_string())
}
