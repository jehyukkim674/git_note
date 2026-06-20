import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { TreeView } from "./TreeView";
import { Dialog } from "./Dialog";
import { splitHighlight } from "../lib/text";
import type { TreeNode } from "../lib/api";

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
  | { kind: "rename"; path: string }
  | { kind: "delete"; path: string }
  | null;

function sortTree(nodes: TreeNode[], sortBy: "name" | "modified"): TreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    if (!a.is_dir && sortBy === "modified") return b.modified - a.modified;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  return sorted.map((n) =>
    n.is_dir ? { ...n, children: sortTree(n.children, sortBy) } : n
  );
}

interface Props {
  onOpenSettings: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onNewInFolder: (dir: string) => void;
}

export function Sidebar({
  onOpenSettings,
  onNewNote,
  onNewFolder,
  onNewInFolder,
}: Props) {
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
    renameNote,
    duplicateNote,
    deleteNote,
    recent,
    pinned,
    togglePin,
    sortBy,
    setSortBy,
  } = useStore();
  const [local, setLocal] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(local), 200);
    return () => clearTimeout(t);
  }, [local, setSearchQuery]);

  // 외부에서 검색어가 바뀌면(예: 태그 클릭) 입력창에도 반영
  useEffect(() => {
    setLocal((prev) => (prev === searchQuery ? prev : searchQuery));
  }, [searchQuery]);

  const searching = searchQuery.trim() !== "";
  const sortedTree = useMemo(() => sortTree(tree, sortBy), [tree, sortBy]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>git_note</span>
        <span className="header-actions">
          <button
            className="icon-btn"
            title="새 노트 (⌘N)"
            aria-label="새 노트"
            onClick={onNewNote}
          >
            ＋
          </button>
          <button
            className="icon-btn"
            title="새 폴더"
            aria-label="새 폴더"
            onClick={onNewFolder}
          >
            🗀
          </button>
          <button
            className="icon-btn"
            title={`정렬: ${sortBy === "name" ? "이름" : "수정시각"}`}
            aria-label={`정렬 기준: ${sortBy === "name" ? "이름" : "수정시각"}`}
            onClick={() => setSortBy(sortBy === "name" ? "modified" : "name")}
          >
            {sortBy === "name" ? "A↓" : "🕘"}
          </button>
          <button
            className="icon-btn"
            title="테마 전환"
            aria-label="테마 전환"
            onClick={toggleTheme}
          >
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
                  {hit.line > 0 ? (
                    <>
                      {hit.line}:{" "}
                      {splitHighlight(hit.snippet, searchQuery).map((s, j) =>
                        s.hit ? <mark key={j}>{s.text}</mark> : <span key={j}>{s.text}</span>
                      )}
                    </>
                  ) : (
                    "제목 일치"
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : tree.length === 0 ? (
        <div className="tree-empty">노트가 없습니다. ＋로 새 노트를 만드세요.</div>
      ) : (
        <>
          {pinned.length > 0 && (
            <div className="recent">
              <div className="recent-title">고정</div>
              {pinned.map((path) => (
                <button
                  key={path}
                  className={
                    "tree-row tree-file recent-item" +
                    (path === selectedPath ? " selected" : "")
                  }
                  onClick={() => selectNote(path)}
                  title={path}
                >
                  ★ {path.split("/").pop()?.replace(/\.md$/, "")}
                </button>
              ))}
            </div>
          )}
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
            nodes={sortedTree}
            selectedPath={selectedPath}
            onSelect={selectNote}
            onRename={(path) => setDialog({ kind: "rename", path })}
            onDuplicate={duplicateNote}
            onDelete={(path) => setDialog({ kind: "delete", path })}
            onPin={togglePin}
            onNewInFolder={onNewInFolder}
            pinned={pinned}
          />
        </>
      )}

      <button className="sidebar-footer" onClick={onOpenSettings}>
        <span className={loggedIn ? "dot dot-on" : "dot dot-off"} />
        <span>{SYNC_LABEL[syncStatus] ?? syncStatus}</span>
        <span className="footer-gear">⚙</span>
      </button>

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
