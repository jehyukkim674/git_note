import { useEffect } from "react";
import { useStore } from "./store";
import { TreeView } from "./components/TreeView";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import "./App.css";

function App() {
  const {
    tree,
    selectedPath,
    content,
    dirty,
    error,
    init,
    selectNote,
    setContent,
    save,
  } = useStore();

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
      <aside className="sidebar">
        <div className="sidebar-header">git_note</div>
        <TreeView
          nodes={tree}
          selectedPath={selectedPath}
          onSelect={selectNote}
        />
      </aside>

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
          <Editor value={content} onChange={setContent} />
        ) : (
          <div className="empty">왼쪽에서 노트를 선택하거나 새로 만드세요.</div>
        )}
      </section>

      <section className="preview-pane">
        <div className="pane-header">미리보기</div>
        <Preview content={content} />
      </section>

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}

export default App;
