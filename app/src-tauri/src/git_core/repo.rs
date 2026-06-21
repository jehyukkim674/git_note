use std::path::Path;
use git2::{Commit, Cred, FetchOptions, Oid, PushOptions, RemoteCallbacks, Repository, Signature};
use git2::build::RepoBuilder;
use crate::git_core::error::GitError;

/// token이 있으면 HTTPS userpass(`x-access-token`)로 인증한다.
/// file:// 원격(테스트용)은 token 없이 동작한다.
fn make_callbacks(token: Option<String>) -> RemoteCallbacks<'static> {
    let mut cb = RemoteCallbacks::new();
    if let Some(tok) = token {
        cb.credentials(move |_url, _username, _allowed| {
            Cred::userpass_plaintext("x-access-token", &tok)
        });
    }
    cb
}

/// 원격 저장소를 into 경로로 clone 한다.
pub fn clone_repo(url: &str, into: &Path, token: Option<String>) -> Result<Repository, GitError> {
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(make_callbacks(token));
    let mut builder = RepoBuilder::new();
    builder.fetch_options(fo);
    let repo = builder.clone(url, into)?;
    Ok(repo)
}

/// 기존 저장소를 연다.
pub fn open_repo(path: &Path) -> Result<Repository, GitError> {
    Ok(Repository::open(path)?)
}

/// 기존(노트가 있는) 폴더를 git 저장소로 만들어 원격에 올린다.
/// 비어있는 원격에 로컬 노트를 처음 연결할 때 사용한다.
pub fn init_and_adopt(
    path: &Path,
    url: &str,
    branch: &str,
    name: &str,
    email: &str,
    token: Option<String>,
) -> Result<(), GitError> {
    let repo = Repository::init(path)?;
    // 첫 커밋이 지정한 브랜치에 올라가도록 HEAD를 미리 가리킨다.
    let _ = repo.set_head(&format!("refs/heads/{branch}"));
    repo.remote("origin", url)?;
    stage_all_and_commit(&repo, "import existing notes", name, email)?;
    push(&repo, branch, token)?;
    Ok(())
}

/// 작업트리의 모든 변경을 스테이징하고 커밋한다. 커밋 Oid를 돌려준다.
pub fn stage_all_and_commit(
    repo: &Repository,
    message: &str,
    name: &str,
    email: &str,
) -> Result<Oid, GitError> {
    let mut index = repo.index()?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;
    let tree = repo.find_tree(index.write_tree()?)?;
    let sig = Signature::now(name, email)?;
    let parent: Option<Commit> = match repo.head() {
        Ok(head) => Some(head.peel_to_commit()?),
        Err(_) => None,
    };
    let parents: Vec<&Commit> = parent.iter().collect();
    let oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?;
    Ok(oid)
}

/// origin의 같은 이름 브랜치로 push 한다.
pub fn push(repo: &Repository, branch: &str, token: Option<String>) -> Result<(), GitError> {
    let mut remote = repo.find_remote("origin")?;
    let mut po = PushOptions::new();
    po.remote_callbacks(make_callbacks(token));
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    remote.push(&[refspec.as_str()], Some(&mut po))?;
    Ok(())
}

/// pull 결과 분류.
#[derive(Debug, PartialEq, Eq)]
pub enum MergeOutcome {
    UpToDate,
    FastForward,
    Merged,
    Conflicts,
}

/// origin/branch를 fetch한 뒤 현재 브랜치에 병합한다.
pub fn pull(
    repo: &Repository,
    branch: &str,
    name: &str,
    email: &str,
    token: Option<String>,
) -> Result<MergeOutcome, GitError> {
    {
        let mut remote = repo.find_remote("origin")?;
        let mut fo = FetchOptions::new();
        fo.remote_callbacks(make_callbacks(token));
        remote.fetch(&[branch], Some(&mut fo), None)?;
    }

    let fetch_head = repo.find_reference("FETCH_HEAD")?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)?;
    let (analysis, _) = repo.merge_analysis(&[&fetch_commit])?;

    if analysis.is_up_to_date() {
        return Ok(MergeOutcome::UpToDate);
    }

    let refname = format!("refs/heads/{branch}");

    if analysis.is_fast_forward() {
        let mut reference = repo.find_reference(&refname)?;
        reference.set_target(fetch_commit.id(), "fast-forward")?;
        repo.set_head(&refname)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))?;
        return Ok(MergeOutcome::FastForward);
    }

    // 일반 병합
    repo.merge(&[&fetch_commit], None, None)?;
    let mut index = repo.index()?;
    if index.has_conflicts() {
        return Ok(MergeOutcome::Conflicts);
    }

    // 병합 커밋 생성
    let tree = repo.find_tree(index.write_tree()?)?;
    let sig = Signature::now(name, email)?;
    let local_commit = repo.head()?.peel_to_commit()?;
    let remote_commit = repo.find_commit(fetch_commit.id())?;
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        "merge",
        &tree,
        &[&local_commit, &remote_commit],
    )?;
    repo.cleanup_state()?;
    Ok(MergeOutcome::Merged)
}

/// 작업트리에서 변경/신규/삭제된 파일 경로 목록.
pub fn changed_paths(repo: &Repository) -> Result<Vec<String>, GitError> {
    let statuses = repo.statuses(None)?;
    let mut out = Vec::new();
    for entry in statuses.iter() {
        if let Some(path) = entry.path() {
            out.push(path.to_string());
        }
    }
    Ok(out)
}

/// 충돌 상태인 파일 경로 목록.
pub fn conflicted_paths(repo: &Repository) -> Result<Vec<String>, GitError> {
    let index = repo.index()?;
    let mut out = Vec::new();
    if index.has_conflicts() {
        for conflict in index.conflicts()? {
            let conflict = conflict?;
            if let Some(entry) = conflict.our.or(conflict.their) {
                out.push(String::from_utf8_lossy(&entry.path).to_string());
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// 커밋 1개가 들어있는 bare "원격" 저장소를 임시 폴더에 만들어 file:// URL을 돌려준다.
    fn make_seed_remote() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("work");
        let repo = Repository::init(&work).unwrap();
        fs::write(work.join("hello.md"), "# hello").unwrap();
        let branch;
        {
            let mut idx = repo.index().unwrap();
            idx.add_path(Path::new("hello.md")).unwrap();
            idx.write().unwrap();
            let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
            let sig = git2::Signature::now("Seed", "seed@test").unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[]).unwrap();
            branch = repo.head().unwrap().shorthand().unwrap().to_string();
        }
        // bare 원격 생성 후 work에서 push
        let bare = dir.path().join("remote.git");
        Repository::init_bare(&bare).unwrap();
        let mut remote = repo
            .remote("origin", &format!("file://{}", bare.display()))
            .unwrap();
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        remote.push(&[refspec.as_str()], None).unwrap();
        let url = format!("file://{}", bare.display());
        (dir, url)
    }

    #[test]
    fn clone_brings_seed_file() {
        let (dir, url) = make_seed_remote();
        let dest = dir.path().join("clone");
        let _repo = clone_repo(&url, &dest, None).unwrap();
        assert!(dest.join("hello.md").exists());
    }

    #[test]
    fn commit_creates_new_head() {
        let (dir, url) = make_seed_remote();
        let dest = dir.path().join("clone");
        let repo = clone_repo(&url, &dest, None).unwrap();

        fs::write(dest.join("note.md"), "# note").unwrap();
        let oid = stage_all_and_commit(&repo, "add note", "Tester", "t@test").unwrap();

        let head = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.id(), oid);
        assert_eq!(head.message().unwrap(), "add note");
    }

    #[test]
    fn push_updates_remote() {
        let (dir, url) = make_seed_remote();

        // 첫 번째 clone에서 커밋 후 push
        let a = dir.path().join("a");
        let repo_a = clone_repo(&url, &a, None).unwrap();
        fs::write(a.join("pushed.md"), "# pushed").unwrap();
        stage_all_and_commit(&repo_a, "add pushed", "A", "a@test").unwrap();
        let branch = repo_a.head().unwrap().shorthand().unwrap().to_string();
        push(&repo_a, &branch, None).unwrap();

        // 두 번째 clone에 push 결과가 반영됐는지 확인
        let b = dir.path().join("b");
        clone_repo(&url, &b, None).unwrap();
        assert!(b.join("pushed.md").exists());
    }

    #[test]
    fn pull_fast_forwards_remote_change() {
        let (dir, url) = make_seed_remote();

        // B는 A의 push보다 먼저 clone해야 fast-forward가 발생한다.
        let b = dir.path().join("b");
        let repo_b = clone_repo(&url, &b, None).unwrap();
        let branch = repo_b.head().unwrap().shorthand().unwrap().to_string();

        // A가 커밋+push
        let a = dir.path().join("a");
        let repo_a = clone_repo(&url, &a, None).unwrap();
        fs::write(a.join("from_a.md"), "# a").unwrap();
        stage_all_and_commit(&repo_a, "a change", "A", "a@test").unwrap();
        push(&repo_a, &branch, None).unwrap();

        // B는 변경 없이 pull → fast-forward
        let outcome = pull(&repo_b, &branch, "B", "b@test", None).unwrap();
        assert_eq!(outcome, MergeOutcome::FastForward);
        assert!(b.join("from_a.md").exists());
    }

    #[test]
    fn pull_up_to_date_when_no_remote_change() {
        let (dir, url) = make_seed_remote();
        let b = dir.path().join("b");
        let repo_b = clone_repo(&url, &b, None).unwrap();
        let branch = repo_b.head().unwrap().shorthand().unwrap().to_string();
        let outcome = pull(&repo_b, &branch, "B", "b@test", None).unwrap();
        assert_eq!(outcome, MergeOutcome::UpToDate);
    }

    #[test]
    fn changed_paths_lists_new_file() {
        let (dir, url) = make_seed_remote();
        let dest = dir.path().join("clone");
        let repo = clone_repo(&url, &dest, None).unwrap();
        fs::write(dest.join("new.md"), "x").unwrap();
        let changed = changed_paths(&repo).unwrap();
        assert!(changed.contains(&"new.md".to_string()));
    }

    #[test]
    fn conflicted_paths_empty_when_clean() {
        let (dir, url) = make_seed_remote();
        let dest = dir.path().join("clone");
        let repo = clone_repo(&url, &dest, None).unwrap();
        assert!(conflicted_paths(&repo).unwrap().is_empty());
    }
}
