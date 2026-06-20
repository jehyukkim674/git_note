use std::path::PathBuf;
use crate::git_core::repo;

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
