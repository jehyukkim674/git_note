# 앱 자동 업데이트 설정 가이드

git_note 데스크톱(Mac/Win/Linux)은 `tauri-plugin-updater`로 자동 업데이트한다.
안드로이드는 GitHub 최신 릴리스를 감지해 APK 다운로드를 안내한다.

## 1. 서명 키 생성 (1회)

```bash
# tauri CLI 필요: npm i -D @tauri-apps/cli  또는  cargo install tauri-cli
npx tauri signer generate -w ~/.tauri/git_note.key
```

- 출력된 **공개키(public key)** 를 `app/src-tauri/tauri.conf.json`의
  `plugins.updater.pubkey` 값(`REPLACE_WITH_OUTPUT_OF_tauri_signer_generate`)에 붙여넣는다.
- **개인키와 비밀번호는 절대 커밋하지 않는다.** GitHub Actions Secrets 등에 보관한다.

## 2. 엔드포인트 설정

`tauri.conf.json`의 `plugins.updater.endpoints`에서 `OWNER/REPO`를 실제 저장소로 바꾼다:

```
https://github.com/OWNER/REPO/releases/latest/download/latest.json
```

## 3. 릴리스 빌드 & 서명

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/git_note.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<생성 시 입력한 비밀번호>"
npx tauri build
```

- `bundle.createUpdaterArtifacts: true` 이므로 서명된 업데이트 아티팩트와 `latest.json`이 생성된다.
- 생성물과 `latest.json`을 GitHub Release에 업로드한다.

## 4. 안드로이드

- 안드로이드는 위 updater를 쓰지 않는다. 앱의 **설정 → 업데이트 → 업데이트 확인**이
  GitHub 최신 릴리스 태그를 조회해(`check_update_github`) 현재 버전보다 높으면
  릴리스의 `.apk` 에셋 다운로드 링크를 띄운다.
- 따라서 릴리스에 `.apk` 파일을 함께 첨부해야 한다.
- 추후 Play Store 배포 시 스토어 업데이트로 대체할 수 있다.

## 동작 요약

- 데스크톱: 설정 → 업데이트 → "업데이트 확인"(GitHub API로 새 버전 여부) → "지금 설치"가
  `tauri-plugin-updater`로 서명 검증 후 다운로드·설치·재실행.
- 안드로이드: "업데이트 확인" → 새 버전이면 "APK 다운로드"로 브라우저 열기.
