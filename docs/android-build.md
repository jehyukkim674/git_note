# 안드로이드 빌드 가이드 (P7)

> 현재 이 개발 환경에는 Android SDK/NDK·Rust 안드로이드 타깃·cargo-ndk가 설치되어 있지
> 않아 `tauri android init`을 실행할 수 없었다. 아래 절차는 SDK/NDK가 준비된 환경에서
> 수행한다. UI는 이미 반응형(좁은 화면 = 목록↔편집 스택)으로 대응해 두었다.

## 1. 사전 준비

```bash
# JDK는 설치되어 있음(25). Android Studio 또는 commandline-tools로 SDK/NDK 설치
# 환경변수 (예: zsh)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<버전>"      # 예: 27.x
# SDK Platform, Build-Tools, NDK, Platform-Tools 설치
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;27.0.12077973"
```

## 2. Rust 안드로이드 타깃 + cargo-ndk

> ⚠️ **rustup 필요.** 현재 개발 머신의 Rust는 Homebrew로 설치돼 `rustup`이 없어 안드로이드
> 타깃을 추가할 수 없다. 안드로이드 빌드 전에 rustup 기반 툴체인을 설치해야 한다:
> ```bash
> curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
> # (기존 Homebrew rust와 PATH 우선순위 정리 필요)
> ```

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
cargo install cargo-ndk
```

### libgit2/OpenSSL 사전 설정 (이미 적용됨)

`app/src-tauri/Cargo.toml`에 안드로이드 타깃 한정으로 `openssl-sys`를 vendored로 빌드하도록
설정해 두었다. libgit2의 HTTPS TLS 백엔드를 정적 링크해 NDK 빌드에서 시스템 OpenSSL 의존을
피한다. 그래도 link 단계에서 막히면 `git2`를 `default-features = false, features =
["https", "vendored-libgit2", "vendored-openssl"]`로 좁혀 재시도한다.

## 3. Tauri 안드로이드 초기화 & 실행

```bash
cd app
npm run tauri android init
npm run tauri android dev      # 에뮬레이터/기기에서 실행
npm run tauri android build    # APK/AAB 빌드
```

## 4. 핵심 리스크: libgit2(git2) 크로스컴파일

`git2` 크레이트는 libgit2(C)와 TLS 백엔드를 안드로이드 ABI로 크로스컴파일해야 한다.

- `git2`는 기본적으로 vendored libgit2를 빌드한다. 안드로이드 NDK 툴체인으로
  cmake/cc가 동작하도록 `cargo-ndk`가 환경을 잡아준다.
- **HTTPS 전용**으로만 쓰므로 SSH(libssh2)는 끄고, TLS는 가능한 한 rustls 경로를 권장.
  libgit2의 HTTPS는 보통 시스템 TLS에 의존하므로, 안드로이드에서는
  `git2`의 `vendored-libgit2` + `vendored-openssl`(또는 `openssl-sys`의 vendored)로
  정적 링크하는 구성이 가장 무난하다.
- 빌드가 막히면 ABI를 하나(`arm64-v8a`)로 좁혀 먼저 통과시키고 확장한다.

### 백업 플랜 (spec 명시)

libgit2 안드로이드 빌드가 끝내 막히면, **안드로이드만 GitHub REST API(HTTP)** 로 동기화한다.
`sync` 모듈의 인터페이스(`pull_repo`/`commit_and_push`)를 trait로 추상화하고,
안드로이드 타깃에서는 GitHub Contents/Git Data API 구현으로 교체한다.
데스크톱은 기존 libgit2 경로를 유지한다.

## 5. 업데이트

안드로이드는 `tauri-plugin-updater`를 쓰지 않는다. 설정 → 업데이트 → "업데이트 확인"이
GitHub 최신 릴리스를 조회해 `.apk` 다운로드를 안내한다([updater-setup.md](updater-setup.md)).
