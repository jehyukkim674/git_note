import { useEffect, useState } from "react";
import { useStore } from "./store";
import { api } from "./lib/api";
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
  const { selectedPath, content, dirty, error, vaultPath, init, setContent, save } =
    useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  // Cmd/Ctrl+S 저장
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

  return (
    <div className="app">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />

      <section className="editor-pane">
        <div className="pane-header">
          <span>{selectedPath ?? "노트를 선택하세요"}</span>
          {selectedPath && (
            <button className="save-btn" onClick={save} disabled={!dirty}>
              {dirty ? "저장 (⌘S)" : "저장됨"}
            </button>
          )}
        </div>
        {selectedPath ? (
          <Editor value={content} onChange={setContent} saveImage={saveImage} />
        ) : (
          <div className="empty">왼쪽에서 노트를 선택하거나 새로 만드세요.</div>
        )}
      </section>

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
