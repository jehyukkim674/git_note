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
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            vault_path: None,
            repo_url: None,
            branch: "main".to_string(),
            author_name: "git_note".to_string(),
            author_email: "git_note@example.com".to_string(),
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
