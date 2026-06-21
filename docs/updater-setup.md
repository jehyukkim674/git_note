# 앱 자동 업데이트 설정 가이드

git_note 데스크톱(Mac/Win/Linux)은 `tauri-plugin-updater`로 자동 업데이트한다.
안드로이드는 GitHub 최신 릴리스를 감지해 APK 다운로드를 안내한다.

## 현재 설정 상태 (완료됨)

- **서명 키**: 생성 완료. 개인키는 로컬 `~/.tauri/git_note.key`에 보관(커밋하지 않음),
  공개키는 `app/src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 반영됨.
- **GitHub Secrets**: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`(빈 값)
  등록 완료 → CI에서 서명에 사용.
- **엔드포인트**: `https://github.com/jehyukkim674/git_note/releases/latest/download/latest.json`
- **CI**: `.github/workflows/release.yml` — `v*` 태그 푸시 시 데스크톱 3종 서명 빌드 +
  `latest.json` 생성 + 릴리스 발행, 이어서 안드로이드 APK를 같은 릴리스에 첨부.

## 릴리스 방법 (사용법)

버전을 올리고 태그를 푸시하면 끝:

```bash
# 1) 버전 동기화: app/package.json, app/src-tauri/tauri.conf.json,
#    app/src-tauri/Cargo.toml 의 version 을 동일하게 올린다 (예: 0.1.1)
# 2) 태그 푸시
git tag v0.1.1
git push origin v0.1.1
```

→ Actions가 빌드/서명/릴리스/`latest.json`/APK 첨부를 자동 수행한다.

## 키를 다시 만들어야 할 때 (재발급)

```bash
npx tauri signer generate -w ~/.tauri/git_note.key -p "" --ci --force
# 공개키(.pub) 내용을 tauri.conf.json 의 pubkey 에 반영
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/git_note.key
printf '' | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

> 개인키/비밀번호를 분실하면 기존 사용자에게 더 이상 업데이트를 서명·배포할 수 없다.

## 로컬에서 수동 서명 빌드 (선택)

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/git_note.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
cd app && npx tauri build
```

- `bundle.createUpdaterArtifacts: true` 이므로 서명된 업데이트 아티팩트와 `latest.json`이 생성된다.

## 안드로이드

- 안드로이드는 위 updater를 쓰지 않는다. 앱의 **설정 → 업데이트 → 업데이트 확인**이
  GitHub 최신 릴리스 태그를 조회해(`check_update_github`) 현재 버전보다 높으면
  릴리스의 `.apk` 에셋 다운로드 링크를 띄운다.
- 따라서 릴리스에 `.apk` 파일을 함께 첨부해야 한다.
- 추후 Play Store 배포 시 스토어 업데이트로 대체할 수 있다.

## 동작 요약

- 데스크톱: 설정 → 업데이트 → "업데이트 확인"(GitHub API로 새 버전 여부) → "지금 설치"가
  `tauri-plugin-updater`로 서명 검증 후 다운로드·설치·재실행.
- 안드로이드: "업데이트 확인" → 새 버전이면 "APK 다운로드"로 브라우저 열기.
