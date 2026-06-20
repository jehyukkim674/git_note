# git_note 1단계: 프로젝트 스캐폴드 + git-core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tauri v2 + React/TS 데스크톱 앱 골격을 세우고, 그 위에서 clone·commit·pull·push·status·충돌감지를 수행하는 테스트된 Rust `git_core` 모듈을 완성한다.

**Architecture:** 앱 루트 `git_note/`에 docs는 그대로 두고, Tauri 프로젝트는 `app/` 하위에 둔다. Rust 백엔드(`app/src-tauri`) 안에 `git_core` 모듈을 만들고 `git2`(libgit2) 크레이트로 git 동작을 구현한다. 모든 git 테스트는 네트워크 없이 로컬 `file://` bare 저장소를 "원격"으로 사용해 검증한다. git 동작은 Tauri command로 프론트엔드에 노출한다.

**Tech Stack:** Tauri v2, React + TypeScript (Vite), Rust, `git2` crate, `tempfile` crate (테스트용).

---

## 파일 구조

```
git_note/
  docs/...                          # 기존 (변경 없음)
  app/                              # ← 이 계획에서 생성
    package.json
    vite.config.ts
    index.html
    src/                            # React 프론트엔드
      App.tsx
    src-tauri/
      Cargo.toml
      tauri.conf.json
      src/
        lib.rs                      # Tauri 진입 + command 등록
        main.rs
        git_core/
          mod.rs                    # 공개 API 재노출
          error.rs                  # GitError 타입
          repo.rs                   # clone/open/commit/pull/push/status
        commands.rs                 # Tauri command 래퍼
```

- `git_core`는 Tauri에 의존하지 않는 순수 Rust 모듈로 둔다(독립 테스트 가능).
- `commands.rs`만 Tauri와 `git_core`를 연결한다.

---

## Task 1: Tauri v2 + React/TS 앱 스캐폴드

**Files:**
- Create: `app/` (스캐폴드 전체)

- [ ] **Step 1: app/ 하위에 Tauri 앱 생성**

`git_note` 루트에서 실행:

```bash
npm create tauri-app@latest app -- --template react-ts --manager npm --yes
```

생성되는 구조: `app/package.json`, `app/src/`, `app/src-tauri/`.

- [ ] **Step 2: 의존성 설치**

```bash
cd app && npm install
```

- [ ] **Step 3: 데스크톱 dev 빌드가 뜨는지 확인**

Run: `cd app && npm run tauri build -- --debug 2>&1 | tail -20`
Expected: 컴파일 성공, 마지막에 `Finished` / 번들 생성 로그. (창을 띄우는 `tauri dev`는 대화형이라 CI/계획 검증에는 `build --debug`를 사용.)

- [ ] **Step 4: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/git_note
git add app
git commit -m "chore: app/ 하위에 Tauri v2 + React/TS 스캐폴드 추가"
```

---

## Task 2: git2 의존성 + git_core 모듈 골격 + 에러 타입

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Create: `app/src-tauri/src/git_core/mod.rs`
- Create: `app/src-tauri/src/git_core/error.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Cargo.toml에 의존성 추가**

`app/src-tauri/Cargo.toml`의 `[dependencies]`에 추가:

```toml
git2 = "0.20"
```

`[dev-dependencies]` 섹션(없으면 새로 추가):

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: 에러 타입 작성**

Create `app/src-tauri/src/git_core/error.rs`:

```rust
use std::fmt;

#[derive(Debug)]
pub enum GitError {
    Git(git2::Error),
    Io(std::io::Error),
}

impl fmt::Display for GitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GitError::Git(e) => write!(f, "git error: {e}"),
            GitError::Io(e) => write!(f, "io error: {e}"),
        }
    }
}

impl std::error::Error for GitError {}

impl From<git2::Error> for GitError {
    fn from(e: git2::Error) -> Self {
        GitError::Git(e)
    }
}

impl From<std::io::Error> for GitError {
    fn from(e: std::io::Error) -> Self {
        GitError::Io(e)
    }
}
```

- [ ] **Step 3: 모듈 재노출 골격 작성**

Create `app/src-tauri/src/git_core/mod.rs`:

```rust
pub mod error;
pub mod repo;

pub use error::GitError;
```

- [ ] **Step 4: lib.rs에서 모듈 선언**

`app/src-tauri/src/lib.rs` 상단(다른 코드보다 위)에 추가:

```rust
mod git_core;
```

- [ ] **Step 5: 컴파일 확인 (repo.rs는 다음 태스크에서 채움 — 임시 빈 파일 생성)**

Create `app/src-tauri/src/git_core/repo.rs`:

```rust
// 구현은 다음 태스크에서 추가된다.
```

Run: `cd app/src-tauri && cargo build 2>&1 | tail -20`
Expected: 컴파일 성공 (경고는 무방).

- [ ] **Step 6: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/git_note
git add app/src-tauri/Cargo.toml app/src-tauri/src/git_core app/src-tauri/src/lib.rs
git commit -m "feat(git-core): git2 의존성과 모듈 골격/에러 타입 추가"
```

---

## Task 3: clone 구현

**Files:**
- Modify: `app/src-tauri/src/git_core/repo.rs`

- [ ] **Step 1: 실패하는 테스트 작성**

`app/src-tauri/src/git_core/repo.rs`에 작성:

```rust
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
        // 작업용 저장소에서 커밋 후 bare로 clone하여 원격을 만든다.
        let work = dir.path().join("work");
        let repo = Repository::init(&work).unwrap();
        fs::write(work.join("hello.md"), "# hello").unwrap();
        {
            let mut idx = repo.index().unwrap();
            idx.add_path(Path::new("hello.md")).unwrap();
            idx.write().unwrap();
            let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
            let sig = git2::Signature::now("Seed", "seed@test").unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[]).unwrap();
        }
        let bare = dir.path().join("remote.git");
        Repository::clone(work.to_str().unwrap(), &bare).unwrap(); // 일반 clone
        // bare로 다시 만들기 위해 init bare 후 push가 복잡하므로, 위 clone을 그대로 원격으로 사용.
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app/src-tauri && cargo test git_core::repo::tests::clone_brings_seed_file 2>&1 | tail -20`
Expected: 처음엔 빈 `repo.rs` 주석만 있던 상태에서 위 코드로 교체했으므로 곧바로 통과할 수도 있다. 만약 컴파일 에러가 나면(예: `tempfile` 미설치) 먼저 해결. 의도: 이 테스트가 clone 동작을 검증.

- [ ] **Step 3: 테스트 통과 확인**

Run: `cd app/src-tauri && cargo test git_core::repo::tests::clone_brings_seed_file 2>&1 | tail -20`
Expected: `test result: ok. 1 passed`.

- [ ] **Step 4: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/git_note
git add app/src-tauri/src/git_core/repo.rs
git commit -m "feat(git-core): clone_repo 구현 및 테스트"
```

---

## Task 4: open + stage_all_and_commit 구현

**Files:**
- Modify: `app/src-tauri/src/git_core/repo.rs`

- [ ] **Step 1: 실패하는 테스트 작성**

`repo.rs`의 `use` 아래(테스트 모듈 위)에 함수 추가:

```rust
use git2::{Commit, Oid, Signature};

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
```

테스트 모듈 안에 추가:

```rust
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app/src-tauri && cargo test git_core::repo::tests::commit_creates_new_head 2>&1 | tail -20`
Expected: 함수가 막 추가됐다면 통과. 실패 시 컴파일 에러 메시지에 따라 수정.

- [ ] **Step 3: 통과 확인**

Run: `cd app/src-tauri && cargo test git_core::repo::tests::commit_creates_new_head 2>&1 | tail -20`
Expected: `1 passed`.

- [ ] **Step 4: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/git_note
git add app/src-tauri/src/git_core/repo.rs
git commit -m "feat(git-core): open_repo와 stage_all_and_commit 구현 및 테스트"
```

---

## Task 5: push 구현

**Files:**
- Modify: `app/src-tauri/src/git_core/repo.rs`

- [ ] **Step 1: 실패하는 테스트 작성**

`repo.rs`에 함수 추가:

```rust
use git2::PushOptions;

/// origin의 같은 이름 브랜치로 push 한다.
pub fn push(repo: &Repository, branch: &str, token: Option<String>) -> Result<(), GitError> {
    let mut remote = repo.find_remote("origin")?;
    let mut po = PushOptions::new();
    po.remote_callbacks(make_callbacks(token));
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    remote.push(&[refspec.as_str()], Some(&mut po))?;
    Ok(())
}
```

테스트 모듈에 추가:

```rust
    #[test]
    fn push_updates_remote() {
        let (dir, url) = make_seed_remote();

        // 첫 번째 clone에서 커밋 후 push
        let a = dir.path().join("a");
        let repo_a = clone_repo(&url, &a, None).unwrap();
        fs::write(a.join("pushed.md"), "# pushed").unwrap();
        stage_all_and_commit(&repo_a, "add pushed", "A", "a@test").unwrap();
        // seed remote의 기본 브랜치 이름을 확인
        let branch = repo_a.head().unwrap().shorthand().unwrap().to_string();
        push(&repo_a, &branch, None).unwrap();

        // 두 번째 clone에 push 결과가 반영됐는지 확인
        let b = dir.path().join("b");
        clone_repo(&url, &b, None).unwrap();
        assert!(b.join("pushed.md").exists());
    }
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app/src-tauri && cargo test git_core::repo::tests::push_updates_remote 2>&1 | tail -30`
Expected: 함수 추가 직후 통과. 만약 `remote.git`이 non-bare라 push가 거부되면(`refusing to update checked out branch`) Step 3의 보정 적용.

- [ ] **Step 3: (필요 시) 원격을 bare로 보정**

`make_seed_remote`가 만든 원격이 non-bare라 push가 거부되면, `make_seed_remote`를 아래로 교체한다:

```rust
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
        let mut remote = repo.remote("origin", &format!("file://{}", bare.display())).unwrap();
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        remote.push(&[refspec.as_str()], None).unwrap();
        let url = format!("file://{}", bare.display());
        (dir, url)
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd app/src-tauri && cargo test git_core::repo 2>&1 | tail -20`
Expected: 모든 repo 테스트 `ok` (clone/commit/push).

- [ ] **Step 5: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/git_note
git add app/src-tauri/src/git_core/repo.rs
git commit -m "feat(git-core): push 구현 및 bare 원격 테스트 보정"
```

---

## Task 6: pull (fetch + fast-forward/merge + 충돌감지) 구현

**Files:**
- Modify: `app/src-tauri/src/git_core/repo.rs`

- [ ] **Step 1: 실패하는 테스트 작성**

`repo.rs`에 타입과 함수 추가:

```rust
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
```

테스트 모듈에 추가:

```rust
    #[test]
    fn pull_fast_forwards_remote_change() {
        let (dir, url) = make_seed_remote();
        let branch = {
            let probe = dir.path().join("probe");
            let r = clone_repo(&url, &probe, None).unwrap();
            r.head().unwrap().shorthand().unwrap().to_string()
        };

        // A가 커밋+push
        let a = dir.path().join("a");
        let repo_a = clone_repo(&url, &a, None).unwrap();
        fs::write(a.join("from_a.md"), "# a").unwrap();
        stage_all_and_commit(&repo_a, "a change", "A", "a@test").unwrap();
        push(&repo_a, &branch, None).unwrap();

        // B는 변경 없이 pull → fast-forward
        let b = dir.path().join("b");
        let repo_b = clone_repo(&url, &b, None).unwrap();
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app/src-tauri && cargo test git_core::repo::tests::pull_ 2>&1 | tail -30`
Expected: 함수 추가 직후 통과. 실패 시 메시지에 따라 수정.

- [ ] **Step 3: 통과 확인**

Run: `cd app/src-tauri && cargo test git_core::repo 2>&1 | tail -20`
Expected: 모든 repo 테스트 `ok`.

- [ ] **Step 4: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/git_note
git add app/src-tauri/src/git_core/repo.rs
git commit -m "feat(git-core): pull(fast-forward/merge/충돌감지) 구현 및 테스트"
```

---

## Task 7: status / 충돌 파일 목록 구현

**Files:**
- Modify: `app/src-tauri/src/git_core/repo.rs`

- [ ] **Step 1: 실패하는 테스트 작성**

`repo.rs`에 추가:

```rust
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
```

테스트 모듈에 추가:

```rust
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd app/src-tauri && cargo test git_core::repo::tests::changed_paths_lists_new_file git_core::repo::tests::conflicted_paths_empty_when_clean 2>&1 | tail -20`
Expected: 함수 추가 직후 통과.

- [ ] **Step 3: 통과 확인**

Run: `cd app/src-tauri && cargo test git_core::repo 2>&1 | tail -20`
Expected: 모든 repo 테스트 `ok`.

- [ ] **Step 4: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/git_note
git add app/src-tauri/src/git_core/repo.rs
git commit -m "feat(git-core): changed_paths/conflicted_paths(status) 구현 및 테스트"
```

---

## Task 8: Tauri command 래퍼로 노출 + 프론트 스모크 호출

**Files:**
- Create: `app/src-tauri/src/commands.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: command 래퍼 작성**

Create `app/src-tauri/src/commands.rs`:

```rust
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
```

- [ ] **Step 2: lib.rs에서 모듈 선언 + command 등록**

`app/src-tauri/src/lib.rs`에서 `mod git_core;` 아래에 추가:

```rust
mod commands;
```

그리고 `tauri::Builder` 체인에 핸들러 등록을 추가한다(기존 `.invoke_handler(...)`가 있으면 거기에 추가, 없으면 `.run` 직전에 삽입):

```rust
        .invoke_handler(tauri::generate_handler![
            commands::clone_repo,
            commands::changed_paths
        ])
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd app/src-tauri && cargo build 2>&1 | tail -20`
Expected: 컴파일 성공.

- [ ] **Step 4: 프론트에 스모크 버튼 추가**

`app/src/App.tsx`의 기본 컴포넌트 본문에, 기존 import에 더해 상단에 추가:

```tsx
import { invoke } from "@tauri-apps/api/core";
```

컴포넌트 JSX 안 아무 곳에 버튼 추가:

```tsx
<button
  onClick={async () => {
    try {
      const result = await invoke<string>("clone_repo", {
        url: "https://github.com/octocat/Hello-World.git",
        into: "/tmp/git_note_smoke",
        token: null,
      });
      alert("cloned to " + result);
    } catch (e) {
      alert("error: " + e);
    }
  }}
>
  clone 스모크 테스트
</button>
```

- [ ] **Step 5: 빌드 확인**

Run: `cd app && npm run tauri build -- --debug 2>&1 | tail -20`
Expected: 프론트+백엔드 빌드 성공. (수동 확인: `npm run tauri dev`로 창을 띄워 버튼을 눌러 clone 동작 확인 — 이 단계는 사람이 실행.)

- [ ] **Step 6: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/git_note
git add app/src-tauri/src/commands.rs app/src-tauri/src/lib.rs app/src/App.tsx
git commit -m "feat(git-core): clone/status를 Tauri command로 노출하고 프론트 스모크 추가"
```

---

## 이후 단계 로드맵 (각각 별도 계획으로 작성 예정)

이 1단계가 끝나면 git-core 위에 다음을 순서대로 쌓는다. 각 단계는 자체로 동작·테스트 가능한 단위이며, 시작 시 brainstorming/writing-plans를 다시 거친다.

- **2단계 — 인증(OAuth device flow)**: GitHub OAuth App 등록(client id), device flow로 토큰 획득, OS 보안 저장소(Keychain/Keystore)에 저장·조회. git_core의 `token` 인자에 연결.
- **3단계 — vault 서비스 + UI 셸(데스크톱 MVP)**: 트리 목록(디렉토리 매핑), 노트 읽기/쓰기, CodeMirror 편집기 + markdown-it 미리보기, 3분할 레이아웃.
- **4단계 — 자동 동기화 배선**: 열 때/포커스 시 pull, 저장 시 commit+push, push 거절 시 pull→재시도, 충돌 시 충돌 상태 표시. 오프라인 큐.
- **5단계 — 전체 검색**: 로컬 `.md` 즉석 grep(제목·본문).
- **6단계 — 이미지/첨부**: `assets/`에 저장·상대경로 참조·함께 커밋, 미리보기에서 로컬 이미지 렌더.
- **7단계 — 안드로이드 타깃**: `cargo-ndk`로 libgit2(HTTPS 전용) 크로스컴파일, `tauri android` 빌드, 모바일 스택 내비게이션 UI. 막히면 spec의 백업 플랜(안드로이드만 GitHub API).
