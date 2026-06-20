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
}
