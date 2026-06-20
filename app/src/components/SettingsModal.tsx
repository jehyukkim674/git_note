import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  api,
  ownerRepoFromUrl,
  type DeviceCodeResponse,
  type UpdateCheck,
} from "../lib/api";
import { useStore } from "../store";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    clientIdSet,
    loggedIn,
    config,
    syncStatus,
    fontSize,
    setFontSize,
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
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
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
          <h3>동기화</h3>
          <div className="row-between">
            <span className="dim">상태: {syncStatus}</span>
            <button onClick={() => syncNow()}>지금 동기화</button>
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
