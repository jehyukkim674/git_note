use std::path::Path;
use serde::Serialize;
use crate::git_core::error::GitError;
use crate::git_core::repo::{self, MergeOutcome};

/// 동기화 결과.
#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", content = "detail")]
pub enum SyncResult {
    NoRepo,
    UpToDate,
    Pulled,
    Pushed,
    Offline,
    Conflicts(Vec<String>),
}

fn is_network_error(msg: &str) -> bool {
    let m = msg.to_lowercase();
    [
        "failed to connect",
        "could not resolve",
        "timed out",
        "timeout",
        "network",
        "connection",
        "temporary failure",
        "dns",
        "no route to host",
    ]
    .iter()
    .any(|k| m.contains(k))
}

/// 네트워크성 오류면 Offline으로, 아니면 에러 문자열로 변환.
fn classify(e: GitError) -> Result<SyncResult, String> {
    let s = e.to_string();
    if is_network_error(&s) {
        Ok(SyncResult::Offline)
    } else {
        Err(s)
    }
}

fn is_repo(root: &Path) -> bool {
    root.join(".git").exists()
}

/// origin/branch를 pull 한다.
pub fn pull_repo(
    root: &Path,
    branch: &str,
    name: &str,
    email: &str,
    token: Option<String>,
) -> Result<SyncResult, String> {
    if !is_repo(root) {
        return Ok(SyncResult::NoRepo);
    }
    let repository = repo::open_repo(root).map_err(|e| e.to_string())?;
    match repo::pull(&repository, branch, name, email, token) {
        Ok(MergeOutcome::UpToDate) => Ok(SyncResult::UpToDate),
        Ok(MergeOutcome::Conflicts) => Ok(SyncResult::Conflicts(
            repo::conflicted_paths(&repository).unwrap_or_default(),
        )),
        Ok(_) => Ok(SyncResult::Pulled),
        Err(e) => classify(e),
    }
}

/// 변경을 커밋하고 push 한다. push가 거절되면 pull 후 재시도.
pub fn commit_and_push(
    root: &Path,
    branch: &str,
    name: &str,
    email: &str,
    token: Option<String>,
    message: &str,
) -> Result<SyncResult, String> {
    if !is_repo(root) {
        return Ok(SyncResult::NoRepo);
    }
    let repository = repo::open_repo(root).map_err(|e| e.to_string())?;

    let changed = repo::changed_paths(&repository).map_err(|e| e.to_string())?;
    if !changed.is_empty() {
        repo::stage_all_and_commit(&repository, message, name, email).map_err(|e| e.to_string())?;
    }

    match repo::push(&repository, branch, token.clone()) {
        Ok(()) => Ok(SyncResult::Pushed),
        Err(e) => {
            if is_network_error(&e.to_string()) {
                return Ok(SyncResult::Offline);
            }
            // push 거절(non-fast-forward) 가능성 → pull 후 재시도
            match repo::pull(&repository, branch, name, email, token.clone()) {
                Ok(MergeOutcome::Conflicts) => Ok(SyncResult::Conflicts(
                    repo::conflicted_paths(&repository).unwrap_or_default(),
                )),
                Ok(_) => repo::push(&repository, branch, token)
                    .map(|_| SyncResult::Pushed)
                    .or_else(|e2| classify(e2)),
                Err(e2) => classify(e2),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use git2::Repository;

    fn seed_remote() -> (tempfile::TempDir, String, String) {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("seed");
        let r = Repository::init(&work).unwrap();
        fs::write(work.join("hello.md"), "# hello").unwrap();
        let branch;
        {
            let mut idx = r.index().unwrap();
            idx.add_path(Path::new("hello.md")).unwrap();
            idx.write().unwrap();
            let tree = r.find_tree(idx.write_tree().unwrap()).unwrap();
            let sig = git2::Signature::now("Seed", "seed@test").unwrap();
            r.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[]).unwrap();
            branch = r.head().unwrap().shorthand().unwrap().to_string();
        }
        let bare = dir.path().join("remote.git");
        Repository::init_bare(&bare).unwrap();
        let mut remote = r
            .remote("origin", &format!("file://{}", bare.display()))
            .unwrap();
        remote
            .push(
                &[format!("refs/heads/{branch}:refs/heads/{branch}").as_str()],
                None,
            )
            .unwrap();
        (dir, format!("file://{}", bare.display()), branch)
    }

    #[test]
    fn commit_and_push_publishes_change() {
        let (dir, url, branch) = seed_remote();
        let root = dir.path().join("a");
        repo::clone_repo(&url, &root, None).unwrap();

        fs::write(root.join("note.md"), "# note").unwrap();
        let res =
            commit_and_push(&root, &branch, "A", "a@test", None, "add note").unwrap();
        assert_eq!(res, SyncResult::Pushed);

        let other = dir.path().join("b");
        repo::clone_repo(&url, &other, None).unwrap();
        assert!(other.join("note.md").exists());
    }

    #[test]
    fn push_rejected_triggers_pull_then_push() {
        let (dir, url, branch) = seed_remote();
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        repo::clone_repo(&url, &a, None).unwrap();
        repo::clone_repo(&url, &b, None).unwrap();

        // A가 먼저 다른 파일 커밋+push
        fs::write(a.join("from_a.md"), "a").unwrap();
        commit_and_push(&a, &branch, "A", "a@test", None, "a").unwrap();

        // B는 다른 파일 커밋 → push 거절 → pull(병합) → 재push
        fs::write(b.join("from_b.md"), "b").unwrap();
        let res = commit_and_push(&b, &branch, "B", "b@test", None, "b").unwrap();
        assert_eq!(res, SyncResult::Pushed);

        // 최종 원격에 두 파일 모두 존재
        let c = dir.path().join("c");
        repo::clone_repo(&url, &c, None).unwrap();
        assert!(c.join("from_a.md").exists());
        assert!(c.join("from_b.md").exists());
    }

    #[test]
    fn pull_up_to_date() {
        let (dir, url, branch) = seed_remote();
        let a = dir.path().join("a");
        repo::clone_repo(&url, &a, None).unwrap();
        let res = pull_repo(&a, &branch, "A", "a@test", None).unwrap();
        assert_eq!(res, SyncResult::UpToDate);
    }

    #[test]
    fn no_repo_when_not_initialized() {
        let dir = tempfile::tempdir().unwrap();
        let res = pull_repo(dir.path(), "main", "A", "a@test", None).unwrap();
        assert_eq!(res, SyncResult::NoRepo);
    }
}
