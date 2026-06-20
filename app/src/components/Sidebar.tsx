import { useEffect, useState } from "react";
import { useStore } from "../store";
import { TreeView } from "./TreeView";
import { Dialog } from "./Dialog";

const SYNC_LABEL: Record<string, string> = {
  idle: "대기",
  syncing: "동기화 중…",
  synced: "동기화됨",
  offline: "오프라인",
  conflict: "충돌",
  norepo: "저장소 미연결",
  error: "오류",
};

type DialogState =
  | { kind: "new" }
  | { kind: "rename"; path: string }
  | { kind: "delete"; path: string }
  | null;

export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const {
    tree,
    selectedPath,
    selectNote,
    searchQuery,
    searchResults,
    setSearchQuery,
    loggedIn,
    syncStatus,
    theme,
    toggleTheme,
    createNote,
    renameNote,
    deleteNote,
    recent,
  } = useStore();
  const [local, setLocal] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(local), 200);
    return () => clearTimeout(t);
  }, [local, setSearchQuery]);

  const searching = searchQuery.trim() !== "";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>git_note</span>
        <span className="header-actions">
          <button className="icon-btn" title="새 노트" onClick={() => setDialog({ kind: "new" })}>
            ＋
          </button>
          <button className="icon-btn" title="테마" onClick={toggleTheme}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </span>
      </div>
      <input
        className="search-box"
        placeholder="검색…"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
      {searching ? (
        <ul className="search-results">
          {searchResults.length === 0 && (
            <li className="search-empty">결과 없음</li>
          )}
          {searchResults.map((hit, i) => (
            <li key={`${hit.path}:${hit.line}:${i}`}>
              <button className="search-hit" onClick={() => selectNote(hit.path)}>
                <span className="hit-path">{hit.path}</span>
                <span className="hit-snippet">
                  {hit.line > 0 ? `${hit.line}: ${hit.snippet}` : "제목 일치"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : tree.length === 0 ? (
        <div className="tree-empty">노트가 없습니다. ＋로 새 노트를 만드세요.</div>
      ) : (
        <>
          {recent.length > 0 && (
            <div className="recent">
              <div className="recent-title">최근</div>
              {recent.slice(0, 5).map((path) => (
                <button
                  key={path}
                  className={
                    "tree-row tree-file recent-item" +
                    (path === selectedPath ? " selected" : "")
                  }
                  onClick={() => selectNote(path)}
                  title={path}
                >
                  {path.split("/").pop()?.replace(/\.md$/, "")}
                </button>
              ))}
            </div>
          )}
          <TreeView
            nodes={tree}
            selectedPath={selectedPath}
            onSelect={selectNote}
            onRename={(path) => setDialog({ kind: "rename", path })}
            onDelete={(path) => setDialog({ kind: "delete", path })}
          />
        </>
      )}

      <button className="sidebar-footer" onClick={onOpenSettings}>
        <span className={loggedIn ? "dot dot-on" : "dot dot-off"} />
        <span>{SYNC_LABEL[syncStatus] ?? syncStatus}</span>
        <span className="footer-gear">⚙</span>
      </button>

      {dialog?.kind === "new" && (
        <Dialog
          title="새 노트"
          mode="input"
          message="경로를 입력하세요 (예: 폴더/메모). .md는 자동으로 붙습니다."
          confirmLabel="생성"
          onSubmit={(v) => {
            if (v.trim()) createNote(v.trim());
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rename" && (
        <Dialog
          title="이름변경"
          mode="input"
          initial={dialog.path}
          confirmLabel="변경"
          onSubmit={(v) => {
            if (v.trim() && v.trim() !== dialog.path) renameNote(dialog.path, v.trim());
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && (
        <Dialog
          title="삭제"
          mode="confirm"
          message={`'${dialog.path}'를 삭제할까요?`}
          confirmLabel="삭제"
          onSubmit={() => {
            deleteNote(dialog.path);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </aside>
  );
}
