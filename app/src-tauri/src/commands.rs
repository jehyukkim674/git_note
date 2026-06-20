use std::fs;
use std::path::PathBuf;
use tauri::State;
use crate::auth;
use crate::config::{AppConfig, AppState};
use crate::git_core::repo;
use crate::sync;
use crate::vault;

struct SyncCtx {
    root: PathBuf,
    branch: String,
    name: String,
    email: String,
    token: Option<String>,
}

fn sync_ctx(state: &AppState) -> Result<SyncCtx, String> {
    let cfg = state.config.lock().unwrap();
    let root = cfg
        .vault_path
        .clone()
        .ok_or_else(|| "no vault configured".to_string())?;
    Ok(SyncCtx {
        root: PathBuf::from(root),
        branch: cfg.branch.clone(),
        name: cfg.author_name.clone(),
        email: cfg.author_email.clone(),
        token: auth::get_token(),
    })
}

/// 보관함이 비어있거나 welcome.md만 있으면 true.
fn effectively_empty(root: &PathBuf) -> bool {
    match fs::read_dir(root) {
        Err(_) => true,
        Ok(rd) => {
            let names: Vec<String> = rd
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            names.is_empty() || names.iter().all(|n| n == "welcome.md")
        }
    }
}

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

/// 커밋 작성자 정보를 저장한다.
#[tauri::command]
pub fn set_author(state: State<AppState>, name: String, email: String) -> Result<(), String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.author_name = name;
    cfg.author_email = email;
    cfg.save(&state.config_path).map_err(|e| e.to_string())
}

/// GitHub 저장소를 보관함에 연결한다(필요 시 clone). 블로킹 → 별도 스레드.
#[tauri::command(async)]
pub fn connect_repo(
    state: State<AppState>,
    repo_url: String,
    branch: String,
) -> Result<AppConfig, String> {
    let token = auth::get_token();
    let root_path = {
        let cfg = state.config.lock().unwrap();
        let root = cfg
            .vault_path
            .clone()
            .unwrap_or_else(|| state.default_vault.to_string_lossy().to_string());
        PathBuf::from(root)
    };

    if !root_path.join(".git").exists() {
        if !effectively_empty(&root_path) {
            return Err(
                "보관함이 비어있지 않습니다. 기존 노트를 옮기거나 빈 폴더에 연결하세요.".to_string(),
            );
        }
        let _ = fs::remove_dir_all(&root_path);
        repo::clone_repo(&repo_url, &root_path, token).map_err(|e| e.to_string())?;
    }

    let mut cfg = state.config.lock().unwrap();
    cfg.vault_path = Some(root_path.to_string_lossy().to_string());
    cfg.repo_url = Some(repo_url);
    cfg.branch = branch;
    cfg.save(&state.config_path).map_err(|e| e.to_string())?;
    Ok(cfg.clone())
}

/// 원격에서 pull. 블로킹 → 별도 스레드.
#[tauri::command(async)]
pub fn sync_pull(state: State<AppState>) -> Result<sync::SyncResult, String> {
    let c = sync_ctx(&state)?;
    sync::pull_repo(&c.root, &c.branch, &c.name, &c.email, c.token)
}

/// 변경을 커밋하고 push. 블로킹 → 별도 스레드.
#[tauri::command(async)]
pub fn sync_push(state: State<AppState>, message: String) -> Result<sync::SyncResult, String> {
    let c = sync_ctx(&state)?;
    sync::commit_and_push(&c.root, &c.branch, &c.name, &c.email, c.token, &message)
}

/// GitHub 최신 릴리스로 업데이트 가능 여부를 확인한다(안드로이드/공통).
#[tauri::command]
pub async fn check_update_github(owner_repo: String) -> Result<crate::update::UpdateCheck, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    crate::update::check_github_release(&owner_repo, &current).await
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
