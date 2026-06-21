import { useEffect, useRef, useState } from "react";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import {
  api,
  ownerRepoFromUrl,
  type DeviceCodeResponse,
  type UpdateCheck,
} from "../lib/api";
import { useStore } from "../store";
import { THEMES } from "../lib/themes";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    clientIdSet,
    loggedIn,
    config,
    syncStatus,
    fontSize,
    setFontSize,
    theme,
    setTheme,
    autoSave,
    autoSync,
    autoSyncSec,
    confirmDelete,
    spellcheck,
    setAutoSave,
    setAutoSync,
    setAutoSyncSec,
    setConfirmDelete,
    setSpellcheck,
    refreshAuth,
    logout,
    connectRepo,
    syncNow,
  } = useStore();

  const [clientId, setClientId] = useState("");
  const [device, setDevice] = useState<DeviceCodeResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  const [repoUrl, setRepoUrl] = useState(config?.repo_url ?? "");
  const [branch, setBranch] = useState(config?.branch ?? "main");
  const [authorName, setAuthorName] = useState(config?.author_name ?? "");
  const [authorEmail, setAuthorEmail] = useState(config?.author_email ?? "");

  const [updateMsg, setUpdateMsg] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateCheck | null>(null);
  const [stats, setStats] = useState<{ notes: number; folders: number } | null>(null);

  // 구글 드라이브
  const [gId, setGId] = useState(config?.google_client_id ?? "");
  const [gSecret, setGSecret] = useState("");
  const [gConnected, setGConnected] = useState(false);
  const [gMsg, setGMsg] = useState("");
  const [gBusy, setGBusy] = useState(false);

  useEffect(() => {
    api.vaultStats().then(setStats).catch(() => setStats(null));
    api.gdriveConnected().then(setGConnected).catch(() => setGConnected(false));
  }, []);

  const saveGoogleClient = async () => {
    if (!gId.trim() || !gSecret.trim()) {
      setGMsg("클라이언트 ID와 시크릿을 모두 입력하세요.");
      return;
    }
    try {
      await api.setGoogleClient(gId.trim(), gSecret.trim());
      setGMsg("구글 클라이언트 저장됨. 이제 '구글 드라이브 연결'을 누르세요.");
    } catch (e) {
      setGMsg(String(e));
    }
  };

  const connectGdrive = async () => {
    setGBusy(true);
    setGMsg("브라우저에서 로그인하세요…");
    try {
      await api.gdriveConnect();
      setGConnected(true);
      setGMsg("구글 드라이브 연결됨. '지금 동기화'로 노트를 올릴 수 있습니다.");
    } catch (e) {
      setGMsg(String(e));
    } finally {
      setGBusy(false);
    }
  };

  const syncGdrive = async () => {
    setGBusy(true);
    setGMsg("동기화 중…");
    try {
      const r = await api.gdriveSync();
      setGMsg(`동기화 완료: 받음 ${r.pulled} · 보냄 ${r.pushed}`);
      await useStore.getState().loadTree();
    } catch (e) {
      setGMsg(String(e));
    } finally {
      setGBusy(false);
    }
  };

  const logoutGdrive = async () => {
    await api.gdriveLogout();
    setGConnected(false);
    setGMsg("연결 해제됨.");
  };

  const checkUpdate = async () => {
    setUpdateMsg("확인 중…");
    setUpdateInfo(null);
    const or = ownerRepoFromUrl(config?.repo_url);
    if (!or) {
      setUpdateMsg("GitHub 저장소가 설정되지 않아 업데이트를 확인할 수 없습니다.");
      return;
    }
    try {
      const res = await api.checkUpdateGithub(or);
      setUpdateInfo(res);
      setUpdateMsg(
        res.newer
          ? `새 버전 ${res.latest_tag} 사용 가능 (현재 ${res.current})`
          : `최신 버전입니다 (현재 ${res.current})`
      );
    } catch (e) {
      setUpdateMsg(String(e));
    }
  };

  const installDesktop = async () => {
    setUpdateMsg("다운로드 중…");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        await relaunch();
      } else {
        setUpdateMsg("설치할 업데이트가 없습니다.");
      }
    } catch (e) {
      setUpdateMsg(`자동 설치 실패(서명키/엔드포인트 설정 필요): ${e}`);
    }
  };

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  // Escape로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveClientId = async () => {
    if (!clientId.trim()) return;
    try {
      await api.setGithubClientId(clientId.trim());
      await refreshAuth();
    } catch (e) {
      setMessage(String(e));
    }
  };

  const startFlow = async () => {
    setBusy(true);
    setMessage("");
    try {
      const d = await api.githubStartDeviceFlow();
      setDevice(d);
      await openUrl(d.verification_uri);
      pollRef.current = window.setInterval(
        async () => {
          try {
            const res = await api.githubPoll(d.device_code);
            if (res.status === "Authorized") {
              if (pollRef.current) clearInterval(pollRef.current);
              await refreshAuth();
              setMessage("GitHub 연결됨");
              setDevice(null);
            } else if (res.status !== "Pending" && res.status !== "SlowDown") {
              if (pollRef.current) clearInterval(pollRef.current);
              setMessage(`실패: ${res.status}${res.detail ? ` - ${res.detail}` : ""}`);
              setDevice(null);
            }
          } catch (e) {
            setMessage(String(e));
          }
        },
        Math.max(d.interval, 5) * 1000
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onConnect = async () => {
    if (!repoUrl.trim()) return;
    await connectRepo(repoUrl.trim(), branch.trim() || "main");
    setMessage("저장소 연결 완료");
  };

  const onSaveAuthor = async () => {
    try {
      await api.setAuthor(authorName.trim(), authorEmail.trim());
      await refreshAuth();
      setMessage("작성자 저장됨");
    } catch (e) {
      setMessage(String(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>설정</h2>

        <section className="settings-section">
          <h3>GitHub</h3>
          {loggedIn ? (
            <div className="row-between">
              <span className="dim">연결됨</span>
              <button onClick={() => logout()}>로그아웃</button>
            </div>
          ) : !clientIdSet ? (
            <>
              <p className="dim">
                OAuth App client_id 입력 (Developer settings → OAuth Apps, "Enable
                Device Flow" 켜기)
              </p>
              <input
                className="text-input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="client_id"
              />
              <button onClick={saveClientId}>client_id 저장</button>
            </>
          ) : device ? (
            <>
              <p>아래 코드를 브라우저에 입력:</p>
              <div className="user-code">{device.user_code}</div>
              <button className="link" onClick={() => openUrl(device.verification_uri)}>
                {device.verification_uri}
              </button>
            </>
          ) : (
            <button onClick={startFlow} disabled={busy}>
              GitHub 연결 시작
            </button>
          )}
        </section>

        <section className="settings-section">
          <h3>저장소</h3>
          <input
            className="text-input"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/notes.git"
          />
          <input
            className="text-input"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="branch (기본 main)"
          />
          <button onClick={onConnect}>저장소 연결</button>
        </section>

        <section className="settings-section">
          <h3>작성자</h3>
          <input
            className="text-input"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="이름"
          />
          <input
            className="text-input"
            value={authorEmail}
            onChange={(e) => setAuthorEmail(e.target.value)}
            placeholder="이메일"
          />
          <button onClick={onSaveAuthor}>작성자 저장</button>
        </section>

        <section className="settings-section">
          <h3>동기화 (Git)</h3>
          <div className="row-between">
            <span className="dim">상태: {syncStatus}</span>
            <button onClick={() => syncNow()}>지금 동기화</button>
          </div>
        </section>

        <section className="settings-section">
          <h3>구글 드라이브 (Git 없이 동기화)</h3>
          {gConnected ? (
            <>
              <div className="row-between">
                <span className="dim">연결됨</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={syncGdrive} disabled={gBusy}>지금 동기화</button>
                  <button className="modal-close" onClick={logoutGdrive}>연결 해제</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="dim">
                구글 클라우드에서 만든 데스크톱 OAuth 클라이언트 ID/시크릿을 입력하세요.
                (Drive API 사용 설정 + 동의화면에 본인을 테스트 사용자로 추가)
              </p>
              <input
                className="text-input"
                value={gId}
                onChange={(e) => setGId(e.target.value)}
                placeholder="구글 client_id"
              />
              <input
                className="text-input"
                type="password"
                value={gSecret}
                onChange={(e) => setGSecret(e.target.value)}
                placeholder="구글 client_secret"
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="modal-close" onClick={saveGoogleClient}>클라이언트 저장</button>
                <button onClick={connectGdrive} disabled={gBusy}>구글 드라이브 연결</button>
              </div>
            </>
          )}
          {gMsg && <p className="modal-msg">{gMsg}</p>}
        </section>

        <section className="settings-section">
          <h3>보관함</h3>
          <p className="dim path-text">{config?.vault_path ?? "(미설정)"}</p>
          <div className="row-between">
            <span className="dim">
              {stats ? `노트 ${stats.notes} · 폴더 ${stats.folders}` : "…"}
            </span>
            {config?.vault_path && (
              <button onClick={() => openPath(config.vault_path!)}>폴더 열기</button>
            )}
          </div>
        </section>

        <section className="settings-section">
          <h3>단축키</h3>
          <ul className="shortcut-list">
            <li><kbd>⌘/Ctrl + S</kbd> 저장 + 동기화</li>
            <li><kbd>⌘/Ctrl + N</kbd> 새 노트</li>
            <li><kbd>⌘/Ctrl + K</kbd> 빠른 열기</li>
          </ul>
        </section>

        <section className="settings-section">
          <h3>편집 · 동기화</h3>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => setAutoSave(e.target.checked)}
            />
            자동 저장 (편집 1.5초 후 로컬 저장)
          </label>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
            자동 동기화
          </label>
          <label className="setting-row">
            자동 동기화 간격(초)
            <input
              className="num-input"
              type="number"
              min={3}
              max={300}
              value={autoSyncSec}
              disabled={!autoSync}
              onChange={(e) =>
                setAutoSyncSec(Math.max(3, Number(e.target.value) || 10))
              }
            />
          </label>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.checked)}
            />
            삭제 시 확인 대화상자 표시
          </label>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={spellcheck}
              onChange={(e) => setSpellcheck(e.target.checked)}
            />
            편집기 맞춤법 검사
          </label>
        </section>

        <section className="settings-section">
          <h3>테마</h3>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={"theme-swatch" + (theme === t.id ? " active" : "")}
                onClick={() => setTheme(t.id)}
                title={t.label}
                aria-label={`테마 ${t.label}`}
                aria-pressed={theme === t.id}
              >
                <span
                  className="theme-preview"
                  style={{ background: t.bg }}
                  data-theme={t.id}
                >
                  <span
                    className="theme-dot"
                    style={{ background: t.swatch }}
                  />
                </span>
                <span className="theme-name">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>편집기 글꼴</h3>
          <div className="font-buttons">
            {(["sm", "md", "lg"] as const).map((s) => (
              <button
                key={s}
                className={fontSize === s ? "active" : ""}
                onClick={() => setFontSize(s)}
              >
                {s === "sm" ? "작게" : s === "md" ? "보통" : "크게"}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>업데이트</h3>
          <div className="row-between">
            <span className="dim">{updateMsg || "최신 릴리스 확인"}</span>
            <button onClick={checkUpdate}>업데이트 확인</button>
          </div>
          {updateInfo?.newer && (
            <div className="update-actions">
              <button onClick={installDesktop}>지금 설치 (데스크톱)</button>
              <button className="link" onClick={() => openUrl(updateInfo.html_url)}>
                릴리스 보기
              </button>
              {updateInfo.apk_url && (
                <button
                  className="link"
                  onClick={() => openUrl(updateInfo.apk_url!)}
                >
                  APK 다운로드
                </button>
              )}
            </div>
          )}
        </section>

        {message && <p className="modal-msg">{message}</p>}
        <button className="modal-close" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
