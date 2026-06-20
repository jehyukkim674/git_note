use std::path::Path;
use git2::{Cred, FetchOptions, RemoteCallbacks, Repository};
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
}
