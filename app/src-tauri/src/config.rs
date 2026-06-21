use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

/// 영속되는 앱 설정.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// 로컬 보관함(clone된 저장소) 경로.
    pub vault_path: Option<String>,
    /// 동기화 대상 GitHub 저장소 URL(HTTPS).
    pub repo_url: Option<String>,
    /// 동기화 브랜치.
    pub branch: String,
    pub author_name: String,
    pub author_email: String,
    /// GitHub OAuth App client_id(공개값). device flow에 사용.
    pub github_client_id: Option<String>,
    /// Google OAuth 데스크톱 클라이언트 ID(루프백 플로우).
    #[serde(default)]
    pub google_client_id: Option<String>,
    /// Google OAuth 데스크톱 클라이언트 시크릿.
    #[serde(default)]
    pub google_client_secret: Option<String>,
    /// 동기화한 Drive 폴더 ID(연결 후 저장).
    #[serde(default)]
    pub drive_folder_id: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            vault_path: None,
            repo_url: None,
            branch: "main".to_string(),
            author_name: "git_note".to_string(),
            author_email: "git_note@example.com".to_string(),
            github_client_id: None,
            google_client_id: None,
            google_client_secret: None,
            drive_folder_id: None,
        }
    }
}

impl AppConfig {
    pub fn load(path: &PathBuf) -> Self {
        match fs::read_to_string(path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self, path: &PathBuf) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self).expect("serialize config");
        fs::write(path, json)
    }
}

/// Tauri managed state.
pub struct AppState {
    pub config_path: PathBuf,
    pub default_vault: PathBuf,
    pub config: Mutex<AppConfig>,
}
