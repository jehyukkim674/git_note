import { useEffect, useState } from "react";
import { useStore } from "../store";
import { TreeView } from "./TreeView";

const SYNC_LABEL: Record<string, string> = {
  idle: "대기",
  syncing: "동기화 중…",
  synced: "동기화됨",
  offline: "오프라인",
  conflict: "충돌",
  norepo: "저장소 미연결",
  error: "오류",
};

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
  } = useStore();
  const [local, setLocal] = useState("");

  // 입력 디바운스(200ms) 후 검색 실행
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(local), 200);
    return () => clearTimeout(t);
  }, [local, setSearchQuery]);

  const searching = searchQuery.trim() !== "";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">git_note</div>
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
              <button
                className="search-hit"
                onClick={() => selectNote(hit.path)}
              >
                <span className="hit-path">{hit.path}</span>
                <span className="hit-snippet">
                  {hit.line > 0 ? `${hit.line}: ${hit.snippet}` : "제목 일치"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <TreeView
          nodes={tree}
          selectedPath={selectedPath}
          onSelect={selectNote}
        />
      )}

      <button className="sidebar-footer" onClick={onOpenSettings}>
        <span className={loggedIn ? "dot dot-on" : "dot dot-off"} />
        <span>{SYNC_LABEL[syncStatus] ?? syncStatus}</span>
        <span className="footer-gear">⚙</span>
      </button>
    </aside>
  );
}
