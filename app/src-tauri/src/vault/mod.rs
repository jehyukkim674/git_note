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
    /// 마지막 수정 시각(UNIX epoch 초). 알 수 없으면 0.
    pub modified: u64,
    pub children: Vec<TreeNode>,
}

fn mtime_secs(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
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
        let modified = entry.metadata().map(|m| mtime_secs(&m)).unwrap_or(0);
        if ft.is_dir() {
            let children = build_children(root, &path)?;
            entries.push(TreeNode {
                name,
                path: rel,
                is_dir: true,
                modified,
                children,
            });
        } else if name.ends_with(".md") {
            entries.push(TreeNode {
                name,
                path: rel,
                is_dir: false,
                modified,
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

/// 폴더를 생성한다(상위 포함). git은 빈 폴더를 추적하지 않으므로 `.gitkeep`을 둔다.
pub fn create_folder(root: &Path, rel: &str) -> Result<(), GitError> {
    let full = safe_join(root, rel)?;
    fs::create_dir_all(&full)?;
    let keep = full.join(".gitkeep");
    if !keep.exists() {
        fs::write(keep, b"")?;
    }
    Ok(())
}

/// 렌더된 HTML 본문을 같은 위치의 `.html` 파일로 내보낸다. 내보낸 상대경로를 돌려준다.
pub fn export_html(root: &Path, rel: &str, body_html: &str) -> Result<String, GitError> {
    let src = safe_join(root, rel)?;
    if !src.exists() {
        return Err(invalid_path());
    }
    let html_rel = if let Some(stem) = rel.strip_suffix(".md") {
        format!("{stem}.html")
    } else {
        format!("{rel}.html")
    };
    let dst = safe_join(root, &html_rel)?;
    let title = Path::new(rel)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let doc = format!(
        "<!doctype html>\n<html lang=\"ko\"><head><meta charset=\"utf-8\">\
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\
<title>{title}</title></head>\n<body>\n{body_html}\n</body></html>\n"
    );
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&dst, doc)?;
    Ok(html_rel)
}

/// 노트를 이동/이름변경한다(대상 상위 디렉토리 자동 생성).
pub fn rename_note(root: &Path, from: &str, to: &str) -> Result<(), GitError> {
    let src = safe_join(root, from)?;
    let dst = safe_join(root, to)?;
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(src, dst)?;
    Ok(())
}

/// 파일명에서 경로/위험 문자를 제거한다.
fn sanitize_filename(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "file".to_string()
    } else {
        cleaned
    }
}

/// 이미지/첨부를 `assets/`에 저장하고 root 기준 상대경로를 돌려준다.
/// 같은 이름이 있으면 `-1`, `-2` … 접미사로 충돌을 피한다.
pub fn save_asset(root: &Path, filename: &str, bytes: &[u8]) -> Result<String, GitError> {
    let name = sanitize_filename(filename);
    let assets = root.join("assets");
    fs::create_dir_all(&assets)?;

    let mut target = assets.join(&name);
    if target.exists() {
        let path = Path::new(&name);
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        let ext = path
            .extension()
            .map(|s| format!(".{}", s.to_string_lossy()))
            .unwrap_or_default();
        let mut n = 1;
        loop {
            let candidate = assets.join(format!("{stem}-{n}{ext}"));
            if !candidate.exists() {
                target = candidate;
                break;
            }
            n += 1;
        }
    }

    fs::write(&target, bytes)?;
    let file = target.file_name().unwrap().to_string_lossy().to_string();
    Ok(format!("assets/{file}"))
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

/// `name` 노트를 [[위키링크]]로 참조하는 노트들의 경로를 돌려준다.
pub fn backlinks(root: &Path, name: &str) -> Result<Vec<String>, GitError> {
    let base = name.trim_end_matches(".md");
    let needle_exact = format!("[[{base}]]");
    let needle_alias = format!("[[{base}|");
    let mut out = Vec::new();
    backlinks_dir(root, root, &needle_exact, &needle_alias, &mut out)?;
    out.sort();
    Ok(out)
}

fn backlinks_dir(
    root: &Path,
    dir: &Path,
    needle_exact: &str,
    needle_alias: &str,
    out: &mut Vec<String>,
) -> Result<(), GitError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if is_hidden(&name) {
            continue;
        }
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            backlinks_dir(root, &path, needle_exact, needle_alias, out)?;
            continue;
        }
        if !name.ends_with(".md") {
            continue;
        }
        let content = fs::read_to_string(&path)?;
        if content.contains(needle_exact) || content.contains(needle_alias) {
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            out.push(rel);
        }
    }
    Ok(())
}

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
    fn rename_moves_file_and_creates_dirs() {
        let dir = temp_root();
        write_note(dir.path(), "old.md", "body").unwrap();
        rename_note(dir.path(), "old.md", "sub/new.md").unwrap();
        assert!(!dir.path().join("old.md").exists());
        assert_eq!(read_note(dir.path(), "sub/new.md").unwrap(), "body");
    }

    #[test]
    fn rename_rejects_traversal() {
        let dir = temp_root();
        write_note(dir.path(), "a.md", "x").unwrap();
        assert!(rename_note(dir.path(), "a.md", "../escape.md").is_err());
    }

    #[test]
    fn export_html_writes_sibling_file() {
        let dir = temp_root();
        write_note(dir.path(), "doc.md", "# t").unwrap();
        let out = export_html(dir.path(), "doc.md", "<h1>t</h1>").unwrap();
        assert_eq!(out, "doc.html");
        let html = read_note(dir.path(), "doc.html").unwrap();
        assert!(html.contains("<h1>t</h1>"));
        assert!(html.contains("<title>doc</title>"));
    }

    #[test]
    fn export_html_errors_when_source_missing() {
        let dir = temp_root();
        assert!(export_html(dir.path(), "nope.md", "<p>x</p>").is_err());
    }

    #[test]
    fn list_tree_includes_modified_time() {
        let dir = temp_root();
        write_note(dir.path(), "a.md", "x").unwrap();
        let tree = list_tree(dir.path()).unwrap();
        assert!(tree[0].modified > 0);
    }

    #[test]
    fn create_folder_makes_dir_with_gitkeep() {
        let dir = temp_root();
        create_folder(dir.path(), "ideas/2026").unwrap();
        assert!(dir.path().join("ideas/2026").is_dir());
        assert!(dir.path().join("ideas/2026/.gitkeep").exists());
        let tree = list_tree(dir.path()).unwrap();
        assert_eq!(tree[0].name, "ideas");
        assert!(tree[0].is_dir);
    }

    #[test]
    fn create_folder_rejects_traversal() {
        let dir = temp_root();
        assert!(create_folder(dir.path(), "../evil").is_err());
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
    fn backlinks_finds_referencing_notes() {
        let dir = temp_root();
        write_note(dir.path(), "target.md", "내용").unwrap();
        write_note(dir.path(), "a.md", "보라 [[target]] 링크").unwrap();
        write_note(dir.path(), "b.md", "별 관계 없음").unwrap();
        write_note(dir.path(), "c.md", "별칭 [[target|다른이름]]").unwrap();
        let links = backlinks(dir.path(), "target").unwrap();
        assert_eq!(links, vec!["a.md".to_string(), "c.md".to_string()]);
    }

    #[test]
    fn backlinks_empty_when_none() {
        let dir = temp_root();
        write_note(dir.path(), "x.md", "no links").unwrap();
        assert!(backlinks(dir.path(), "target").unwrap().is_empty());
    }

    #[test]
    fn search_empty_query_returns_nothing() {
        let dir = temp_root();
        write_note(dir.path(), "a.md", "content").unwrap();
        assert!(search(dir.path(), "   ").unwrap().is_empty());
    }

    #[test]
    fn save_asset_writes_and_returns_relative_path() {
        let dir = temp_root();
        let rel = save_asset(dir.path(), "pic.png", b"\x89PNG").unwrap();
        assert_eq!(rel, "assets/pic.png");
        assert_eq!(fs::read(dir.path().join("assets/pic.png")).unwrap(), b"\x89PNG");
    }

    #[test]
    fn save_asset_dedupes_name() {
        let dir = temp_root();
        let first = save_asset(dir.path(), "pic.png", b"a").unwrap();
        let second = save_asset(dir.path(), "pic.png", b"b").unwrap();
        assert_eq!(first, "assets/pic.png");
        assert_eq!(second, "assets/pic-1.png");
    }

    #[test]
    fn save_asset_strips_path_traversal() {
        let dir = temp_root();
        let rel = save_asset(dir.path(), "../../etc/passwd", b"x").unwrap();
        assert_eq!(rel, "assets/passwd");
    }
}
