import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type DeviceCodeResponse } from "../lib/api";
import { useStore } from "../store";

export function LoginModal({ onClose }: { onClose: () => void }) {
  const { clientIdSet, loggedIn, refreshAuth, logout } = useStore();
  const [clientId, setClientId] = useState("");
  const [device, setDevice] = useState<DeviceCodeResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

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
              setMessage("연결되었습니다.");
              setTimeout(onClose, 800);
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>GitHub 연결</h2>

        {loggedIn ? (
          <>
            <p>이미 연결되어 있습니다.</p>
            <button onClick={() => logout()}>로그아웃</button>
          </>
        ) : !clientIdSet ? (
          <>
            <p className="dim">
              OAuth App client_id를 입력하세요. (GitHub → Settings → Developer
              settings → OAuth Apps, "Enable Device Flow" 켜기)
            </p>
            <input
              className="text-input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="client_id"
            />
            <button onClick={saveClientId}>저장</button>
          </>
        ) : !device ? (
          <>
            <p>버튼을 누르면 브라우저가 열리고 코드 입력 화면이 나타납니다.</p>
            <button onClick={startFlow} disabled={busy}>
              GitHub 연결 시작
            </button>
          </>
        ) : (
          <>
            <p>아래 코드를 브라우저에 입력하세요:</p>
            <div className="user-code">{device.user_code}</div>
            <p>
              <button className="link" onClick={() => openUrl(device.verification_uri)}>
                {device.verification_uri}
              </button>
            </p>
            <p className="dim">인증 대기 중…</p>
          </>
        )}

        {message && <p className="modal-msg">{message}</p>}
        <button className="modal-close" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
