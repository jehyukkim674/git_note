# git_note

안드로이드·Mac에서 모두 쓰는 마크다운 메모장. 메모는 `.md` 파일로 저장되고, HTML 라이브
미리보기를 제공하며, **GitHub 저장소(진짜 git)**를 통해 기기 간 동기화된다.

## 주요 기능

- **마크다운 편집 + 라이브 HTML 미리보기** (CodeMirror 6 · markdown-it · DOMPurify sanitize)
- **폴더/트리 구조** — 저장소 디렉토리 그대로 매핑, 노트 생성·이름변경·복제·삭제, 폴더 생성
- **전체 검색**(제목·본문, 매칭 하이라이트) + **빠른 열기 팔레트**(⌘K)
- **이미지 첨부** — 붙여넣기로 `assets/`에 저장·미리보기 렌더
- **GitHub 동기화** — OAuth device flow 로그인, 열 때/포커스 시 pull, 편집 후 commit+push
  (push 거절 시 pull→재시도, 충돌·오프라인 처리, pull 전 로컬 변경 선커밋으로 데이터 보호)
- **연결** — `[[위키링크]]` 네비게이션, 백링크, `#태그`
- **편의** — 다크 모드, 자동 저장, 마크다운 툴바, 아웃라인(TOC), 고정(★), 최근 노트,
  글꼴 크기, HTML 내보내기
- **앱 자동 업데이트** — 데스크톱(tauri-plugin-updater) · 안드로이드(GitHub 릴리스 감지)

## 기술 스택

Tauri v2 (Rust 백엔드) + React/TypeScript(Vite) 프론트엔드. git은 Rust `git2`(libgit2, HTTPS).

## 아키텍처

```
app/
  src/                     # React 프론트엔드
    components/            # Sidebar, Editor, Preview, SettingsModal, QuickOpen, ...
    lib/                   # api(invoke 래퍼), text(순수 유틸), markdown, tree
    store.ts               # zustand 전역 상태
  src-tauri/src/
    git_core/              # clone/commit/pull/push/status (libgit2)
    vault/                 # 파일 트리·읽기/쓰기·검색·백링크·통계·이미지
    auth/                  # GitHub OAuth device flow · 키체인 토큰 · 사용자 조회
    sync/                  # pull/commit+push 오케스트레이션(오프라인·충돌 분류)
    update/                # 버전 비교 · GitHub 릴리스 조회
    config.rs              # 앱 설정/상태
    commands.rs            # Tauri 커맨드(프론트 ↔ Rust)
```

## 개발

```bash
cd app
npm install
npm run tauri dev        # 데스크톱 개발 실행
```

## 테스트

```bash
# Rust (git_core/vault/sync/auth/update 단위 테스트)
cd app/src-tauri && cargo test
# 프론트 순수 유틸(vitest)
cd app && npm test
```

## 빌드 / 배포

```bash
cd app && npm run tauri build          # 데스크톱 번들
```

- 안드로이드: [`../docs/android-build.md`](../docs/android-build.md)
- 자동 업데이트 서명/엔드포인트: [`../docs/updater-setup.md`](../docs/updater-setup.md)

## 설정(앱 내 ⚙)

GitHub client_id 입력 → "GitHub 연결 시작"으로 로그인 → 저장소 URL/브랜치 연결.
client_id는 `GITHUB_CLIENT_ID` 환경변수로도 주입 가능.
