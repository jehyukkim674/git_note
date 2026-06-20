import { useEffect, useState } from "react";
import { useStore } from "./store";
import { api } from "./lib/api";
import { useMediaQuery } from "./lib/useMediaQuery";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { SettingsModal } from "./components/SettingsModal";
import "./App.css";

async function saveImage(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return api.saveAsset(file.name || "image.png", Array.from(buf));
}

function App() {
  const {
    selectedPath,
    content,
    dirty,
    error,
    vaultPath,
    loading,
    theme,
    syncStatus,
    conflicts,
    init,
    setContent,
    save,
    clearSelection,
    clearError,
    syncNow,
  } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const isMobile = useMediaQuery("(max-width: 720px)");

  useEffect(() => {
    init();
  }, [init]);

  // 테마 적용
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // 자동 저장(편집 후 1.5초)
  useEffect(() => {
    if (!dirty || !selectedPath) return;
    const t = setTimeout(() => save(), 1500);
    return () => clearTimeout(t);
  }, [dirty, content, selectedPath, save]);

  const overlays = (
    <>
      {loading && <div className="loading-overlay">불러오는 중…</div>}
      {syncStatus === "conflict" && conflicts.length > 0 && (
        <div className="conflict-banner">
          <span>충돌: {conflicts.join(", ")} — 파일에서 충돌 표시를 정리한 뒤 다시 동기화하세요.</span>
          <button onClick={() => syncNow()}>다시 동기화</button>
        </div>
      )}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button className="toast-close" onClick={clearError}>
            ✕
          </button>
        </div>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );

  const editorPane = (
    <section className="editor-pane">
      <div className="pane-header">
        {isMobile && selectedPath && (
          <button className="back-btn" onClick={clearSelection}>
            ‹ 목록
          </button>
        )}
        <span>{selectedPath ?? "노트를 선택하세요"}</span>
        <span className="header-right">
          {isMobile && selectedPath && (
            <button
              className="save-btn"
              onClick={() => setMobilePreview((p) => !p)}
            >
              {mobilePreview ? "편집" : "미리보기"}
            </button>
          )}
          {selectedPath && (
            <button className="save-btn" onClick={save} disabled={!dirty}>
              {dirty ? "저장" : "저장됨"}
            </button>
          )}
        </span>
      </div>
      {selectedPath ? (
        isMobile && mobilePreview ? (
          <Preview content={content} vaultPath={vaultPath} />
        ) : (
          <Editor value={content} onChange={setContent} saveImage={saveImage} />
        )
      ) : (
        <div className="empty">왼쪽에서 노트를 선택하거나 새로 만드세요.</div>
      )}
    </section>
  );

  if (isMobile) {
    return (
      <div className="app app-mobile">
        {selectedPath ? (
          editorPane
        ) : (
          <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
        )}
        {overlays}
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      {editorPane}
      <section className="preview-pane">
        <div className="pane-header">미리보기</div>
        <Preview content={content} vaultPath={vaultPath} />
      </section>

      {overlays}
    </div>
  );
}

export default App;
