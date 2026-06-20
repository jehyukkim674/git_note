use std::fs;
use std::path::{Path, PathBuf};
use serde::Serialize;
use crate::git_core::error::GitError;

/// 노트 트리의 한 노드(파일 또는 디렉토리).
#[derive(Debug, Serialize, PartialEq)]
pub struct TreeNode {
    pub name: String,
    /// root 기준 상대경로(항상 `/` 구분자).
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<TreeNode>,
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn invalid_path() -> GitError {
    GitError::Io(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        "invalid path",
    ))
}

/// `..` 경로 탈출을 막고 root 하위 절대경로를 만든다.
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, GitError> {
    let rel_path = Path::new(rel);
    let has_parent = rel_path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir));
    if has_parent || rel_path.is_absolute() {
        return Err(invalid_path());
    }
    Ok(root.join(rel_path))
}

/// root 하위의 노트 트리(.md 파일과 디렉토리)를 돌려준다. 숨김(.git 등)은 제외.
pub fn list_tree(root: &Path) -> Result<Vec<TreeNode>, GitError> {
    build_children(root, root)
}

fn build_children(root: &Path, dir: &Path) -> Result<Vec<TreeNode>, GitError> {
    let mut entries: Vec<TreeNode> = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if is_hidden(&name) {
            continue;
        }
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let ft = entry.file_type()?;
        if ft.is_dir() {
            let children = build_children(root, &path)?;
            entries.push(TreeNode {
                name,
                path: rel,
                is_dir: true,
                children,
            });
        } else if name.ends_with(".md") {
            entries.push(TreeNode {
                name,
                path: rel,
                is_dir: false,
                children: vec![],
            });
        }
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

/// 노트 내용을 읽는다.
pub fn read_note(root: &Path, rel: &str) -> Result<String, GitError> {
    let full = safe_join(root, rel)?;
    Ok(fs::read_to_string(full)?)
}

/// 노트를 쓴다(상위 디렉토리 자동 생성).
pub fn write_note(root: &Path, rel: &str, content: &str) -> Result<(), GitError> {
    let full = safe_join(root, rel)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(full, content)?;
    Ok(())
}

/// 노트를 삭제한다.
pub fn delete_note(root: &Path, rel: &str) -> Result<(), GitError> {
    let full = safe_join(root, rel)?;
    fs::remove_file(full)?;
    Ok(())
}

/// 검색 결과 한 건.
#[derive(Debug, Serialize, PartialEq)]
pub struct SearchHit {
    pub path: String,
    /// 1-기반 줄 번호. 파일명(제목) 매칭이면 0.
    pub line: usize,
    pub snippet: String,
}

const SNIPPET_MAX: usize = 120;

/// 제목(파일명)과 본문에서 query(대소문자 무시)를 검색한다.
pub fn search(root: &Path, query: &str) -> Result<Vec<SearchHit>, GitError> {
    let mut hits = Vec::new();
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(hits);
    }
    search_dir(root, root, &q, &mut hits)?;
    Ok(hits)
}

fn search_dir(
    root: &Path,
    dir: &Path,
    q: &str,
    hits: &mut Vec<SearchHit>,
) -> Result<(), GitError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if is_hidden(&name) {
            continue;
        }
        let path = entry.path();
        let ft = entry.file_type()?;
        if ft.is_dir() {
            search_dir(root, &path, q, hits)?;
            continue;
        }
        if !name.ends_with(".md") {
            continue;
        }
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        // 제목(파일명) 매칭
        if name.to_lowercase().contains(q) {
            hits.push(SearchHit {
                path: rel.clone(),
                line: 0,
                snippet: name.trim_end_matches(".md").to_string(),
            });
        }
        // 본문 매칭
        let content = fs::read_to_string(&path)?;
        for (idx, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(q) {
                let snippet: String = line.trim().chars().take(SNIPPET_MAX).collect();
                hits.push(SearchHit {
                    path: rel.clone(),
                    line: idx + 1,
                    snippet,
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = temp_root();
        write_note(dir.path(), "a/b.md", "# hi").unwrap();
        let got = read_note(dir.path(), "a/b.md").unwrap();
        assert_eq!(got, "# hi");
    }

    #[test]
    fn list_tree_nests_and_filters() {
        let dir = temp_root();
        write_note(dir.path(), "root.md", "x").unwrap();
        write_note(dir.path(), "folder/child.md", "y").unwrap();
        fs::write(dir.path().join("ignore.txt"), "z").unwrap();
        fs::create_dir_all(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git/config"), "c").unwrap();

        let tree = list_tree(dir.path()).unwrap();
        // 디렉토리가 먼저(folder), 그 다음 파일(root.md)
        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].name, "folder");
        assert!(tree[0].is_dir);
        assert_eq!(tree[0].children.len(), 1);
        assert_eq!(tree[0].children[0].path, "folder/child.md");
        assert_eq!(tree[1].name, "root.md");
        assert!(!tree[1].is_dir);
        // ignore.txt와 .git은 제외됨
    }

    #[test]
    fn delete_removes_file() {
        let dir = temp_root();
        write_note(dir.path(), "gone.md", "x").unwrap();
        delete_note(dir.path(), "gone.md").unwrap();
        assert!(!dir.path().join("gone.md").exists());
    }

    #[test]
    fn safe_join_rejects_traversal() {
        let dir = temp_root();
        assert!(read_note(dir.path(), "../secret").is_err());
        assert!(write_note(dir.path(), "../evil.md", "x").is_err());
    }

    #[test]
    fn search_matches_body_with_line_numbers() {
        let dir = temp_root();
        write_note(dir.path(), "a.md", "first line\nhello world\nlast").unwrap();
        let hits = search(dir.path(), "WORLD").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "a.md");
        assert_eq!(hits[0].line, 2);
        assert_eq!(hits[0].snippet, "hello world");
    }

    #[test]
    fn search_matches_title_with_line_zero() {
        let dir = temp_root();
        write_note(dir.path(), "shopping.md", "milk").unwrap();
        let hits = search(dir.path(), "shop").unwrap();
        assert!(hits.iter().any(|h| h.line == 0 && h.snippet == "shopping"));
    }

    #[test]
    fn search_empty_query_returns_nothing() {
        let dir = temp_root();
        write_note(dir.path(), "a.md", "content").unwrap();
        assert!(search(dir.path(), "   ").unwrap().is_empty());
    }
}
