use std::fs;
use std::path::PathBuf;
use tauri::State;
use crate::auth;
use crate::config::{AppConfig, AppState};
use crate::git_core::repo;
use crate::vault;

/// 설정 또는 환경변수에서 GitHub client_id를 얻는다.
fn client_id(state: &AppState) -> Result<String, String> {
    if let Ok(v) = std::env::var("GITHUB_CLIENT_ID") {
        if !v.is_empty() {
            return Ok(v);
        }
    }
    state
        .config
        .lock()
        .unwrap()
        .github_client_id
        .clone()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "GitHub client_id가 설정되지 않았습니다. 설정에서 OAuth App client_id를 입력하세요."
                .to_string()
        })
}

/// 설정된 보관함 루트 경로를 돌려준다.
fn vault_root(state: &AppState) -> Result<PathBuf, String> {
    let cfg = state.config.lock().unwrap();
    cfg.vault_path
        .clone()
        .map(PathBuf::from)
        .ok_or_else(|| "no vault configured".to_string())
}

/// 현재 설정을 돌려준다.
#[tauri::command]
pub fn get_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

/// 보관함이 없으면 기본 로컬 경로로 만들고(빈 경우 환영 노트 생성), 설정을 저장한다.
#[tauri::command]
pub fn ensure_vault(state: State<AppState>) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    if cfg.vault_path.is_none() {
        cfg.vault_path = Some(state.default_vault.to_string_lossy().to_string());
    }
    let root = PathBuf::from(cfg.vault_path.clone().unwrap());
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let is_empty = fs::read_dir(&root)
        .map(|mut d| d.next().is_none())
        .unwrap_or(false);
    if is_empty {
        let _ = fs::write(
            root.join("welcome.md"),
            "# git_note\n\n환영합니다. 첫 메모입니다.\n",
        );
    }

    cfg.save(&state.config_path).map_err(|e| e.to_string())?;
    Ok(cfg.clone())
}

/// 노트 트리를 돌려준다.
#[tauri::command]
pub fn list_tree(state: State<AppState>) -> Result<Vec<vault::TreeNode>, String> {
    let root = vault_root(&state)?;
    vault::list_tree(&root).map_err(|e| e.to_string())
}

/// 노트 내용을 읽는다.
#[tauri::command]
pub fn read_note(state: State<AppState>, rel: String) -> Result<String, String> {
    let root = vault_root(&state)?;
    vault::read_note(&root, &rel).map_err(|e| e.to_string())
}

/// 노트를 저장한다.
#[tauri::command]
pub fn write_note(state: State<AppState>, rel: String, content: String) -> Result<(), String> {
    let root = vault_root(&state)?;
    vault::write_note(&root, &rel, &content).map_err(|e| e.to_string())
}

/// 노트를 삭제한다.
#[tauri::command]
pub fn delete_note(state: State<AppState>, rel: String) -> Result<(), String> {
    let root = vault_root(&state)?;
    vault::delete_note(&root, &rel).map_err(|e| e.to_string())
}

/// 제목/본문 전체 검색.
#[tauri::command]
pub fn search_notes(state: State<AppState>, query: String) -> Result<Vec<vault::SearchHit>, String> {
    let root = vault_root(&state)?;
    vault::search(&root, &query).map_err(|e| e.to_string())
}

/// GitHub OAuth App client_id를 저장한다.
#[tauri::command]
pub fn set_github_client_id(state: State<AppState>, client_id: String) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.github_client_id = Some(client_id);
    cfg.save(&state.config_path).map_err(|e| e.to_string())
}

/// device flow를 시작한다(user_code/verification_uri 반환).
#[tauri::command]
pub async fn github_start_device_flow(
    state: State<'_, AppState>,
) -> Result<auth::DeviceCodeResponse, String> {
    let cid = client_id(&state)?;
    auth::start_device_flow(&cid).await
}

/// 토큰을 한 번 폴링한다. Authorized면 토큰을 키체인에 저장.
#[tauri::command]
pub async fn github_poll(
    state: State<'_, AppState>,
    device_code: String,
) -> Result<auth::PollStatus, String> {
    let cid = client_id(&state)?;
    let (status, token) = auth::poll_once(&cid, &device_code).await?;
    if status == auth::PollStatus::Authorized {
        if let Some(tok) = token {
            auth::store_token(&tok)?;
        }
    }
    Ok(status)
}

/// 로그인(토큰 보유) 여부.
#[tauri::command]
pub fn github_logged_in() -> bool {
    auth::get_token().is_some()
}

/// 로그아웃(토큰 삭제).
#[tauri::command]
pub fn github_logout() -> Result<(), String> {
    auth::delete_token()
}

/// 이미지/첨부를 assets/에 저장하고 상대경로를 돌려준다.
#[tauri::command]
pub fn save_asset(
    state: State<AppState>,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let root = vault_root(&state)?;
    vault::save_asset(&root, &filename, &bytes).map_err(|e| e.to_string())
}

/// 저장소를 clone 한다. 성공 시 clone된 경로를 문자열로 돌려준다.
#[tauri::command]
pub fn clone_repo(url: String, into: String, token: Option<String>) -> Result<String, String> {
    let path = PathBuf::from(&into);
    repo::clone_repo(&url, &path, token)
        .map(|_| into)
        .map_err(|e| e.to_string())
}

/// 저장소의 변경 파일 목록을 돌려준다.
#[tauri::command]
pub fn changed_paths(repo_path: String) -> Result<Vec<String>, String> {
    let r = repo::open_repo(&PathBuf::from(&repo_path)).map_err(|e| e.to_string())?;
    repo::changed_paths(&r).map_err(|e| e.to_string())
}
