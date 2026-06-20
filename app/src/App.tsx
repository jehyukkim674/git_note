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
    init,
    setContent,
    save,
    clearSelection,
  } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const isMobile = useMediaQuery("(max-width: 720px)");

  useEffect(() => {
    init();
  }, [init]);

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
        {error && <div className="error-toast">{error}</div>}
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
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

      {error && <div className="error-toast">{error}</div>}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default App;
