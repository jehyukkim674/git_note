import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { TreeView } from "./TreeView";
import { Dialog } from "./Dialog";
import { splitHighlight } from "../lib/text";
import { themeMeta, nextTheme } from "../lib/themes";
import { flattenFiles } from "../lib/tree";
import type { TreeNode } from "../lib/api";

function countNotes(nodes: TreeNode[]): number {
  return nodes.reduce(
    (sum, n) => sum + (n.is_dir ? countNotes(n.children) : 1),
    0
  );
}

function collectDirs(nodes: TreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.is_dir) {
      out.push(n.path);
      collectDirs(n.children, out);
    }
  }
  return out;
}

function loadOpenDirs(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem("openDirs") || "{}");
  } catch {
    return {};
  }
}

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

function sortTree(
  nodes: TreeNode[],
  sortBy: "name" | "modified",
  dir: "asc" | "desc"
): TreeNode[] {
  const sign = dir === "asc" ? 1 : -1;
  const sorted = [...nodes].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1; // 폴더 우선은 고정
    const base =
      !a.is_dir && sortBy === "modified"
        ? a.modified - b.modified
        : a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return base * sign;
  });
  return sorted.map((n) =>
    n.is_dir ? { ...n, children: sortTree(n.children, sortBy, dir) } : n
  );
}

interface Props {
  onOpenSettings: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onNewInFolder: (dir: string) => void;
  onDailyNote: () => void;
  onOpenTags: () => void;
}

export function Sidebar({
  onOpenSettings,
  onNewNote,
  onNewFolder,
  onNewInFolder,
  onDailyNote,
  onOpenTags,
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
    cycleTheme,
    renameNote,
    duplicateNote,
    deleteNote,
    recent,
    pinned,
    togglePin,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    confirmDelete,
    searchHistory,
    addSearchHistory,
  } = useStore();
  const [local, setLocal] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [fileOnly, setFileOnly] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>(loadOpenDirs);
  const [showPinned, setShowPinned] = useState(true);
  const [showRecent, setShowRecent] = useState(true);

  const persistDirs = (next: Record<string, boolean>) => {
    setOpenDirs(next);
    try {
      localStorage.setItem("openDirs", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const toggleDir = (path: string) =>
    persistDirs({ ...openDirs, [path]: !(openDirs[path] ?? true) });
  const dirPaths = useMemo(() => collectDirs(tree), [tree]);
  const allOpen = dirPaths.every((p) => openDirs[p] ?? true);
  const setAllDirs = (open: boolean) => {
    const next: Record<string, boolean> = {};
    dirPaths.forEach((p) => (next[p] = open));
    persistDirs(next);
  };

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(local), 200);
    return () => clearTimeout(t);
  }, [local, setSearchQuery]);

  // 외부에서 검색어가 바뀌면(예: 태그 클릭) 입력창에도 반영
  useEffect(() => {
    setLocal((prev) => (prev === searchQuery ? prev : searchQuery));
  }, [searchQuery]);

  const searching = searchQuery.trim() !== "";
  const sortedTree = useMemo(
    () => sortTree(tree, sortBy, sortDir),
    [tree, sortBy, sortDir]
  );
  const noteCount = useMemo(() => countNotes(tree), [tree]);
  const fileMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return flattenFiles(tree).filter((p) => p.toLowerCase().includes(q));
  }, [tree, searchQuery]);
  // 대용량 보관함에서 DOM 폭주를 막기 위해 렌더 개수를 제한한다.
  const RESULT_CAP = 300;

  // 20. 현재 노트의 상위 폴더를 모두 펼친다.
  const revealActive = () => {
    if (!selectedPath) return;
    const parts = selectedPath.split("/");
    const next = { ...openDirs };
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      next[acc] = true;
    }
    persistDirs(next);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">
          git_note
          {noteCount > 0 && <span className="count-badge">{noteCount}</span>}
        </span>
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
            title="오늘 노트"
            aria-label="오늘 노트"
            onClick={onDailyNote}
          >
            📅
          </button>
          <button
            className="icon-btn"
            title="태그 보기"
            aria-label="태그 보기"
            onClick={onOpenTags}
          >
            #
          </button>
          {selectedPath && (
            <button
              className="icon-btn"
              title="현재 노트 위치 보기"
              aria-label="현재 노트 위치 보기"
              onClick={revealActive}
            >
              🎯
            </button>
          )}
          {dirPaths.length > 0 && (
            <button
              className="icon-btn"
              title={allOpen ? "폴더 모두 접기" : "폴더 모두 펼치기"}
              aria-label={allOpen ? "폴더 모두 접기" : "폴더 모두 펼치기"}
              onClick={() => setAllDirs(!allOpen)}
            >
              {allOpen ? "⊟" : "⊞"}
            </button>
          )}
          <button
            className="icon-btn"
            title={`정렬: ${sortBy === "name" ? "이름" : "수정시각"}`}
            aria-label={`정렬 기준: ${sortBy === "name" ? "이름" : "수정시각"}`}
            onClick={() => setSortBy(sortBy === "name" ? "modified" : "name")}
          >
            {sortBy === "name" ? "A" : "🕘"}
          </button>
          <button
            className="icon-btn"
            title={`정렬 방향: ${sortDir === "asc" ? "오름차순" : "내림차순"}`}
            aria-label={`정렬 방향: ${sortDir === "asc" ? "오름차순" : "내림차순"}`}
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
          <button
            className="icon-btn"
            title={`테마: ${themeMeta(theme).label} → ${themeMeta(nextTheme(theme)).label}`}
            aria-label={`테마 전환 (현재 ${themeMeta(theme).label})`}
            onClick={cycleTheme}
          >
            {themeMeta(theme).dark ? "☾" : "☀"}
          </button>
        </span>
      </div>
      <div className="search-box-wrap">
        <span className="search-icon" aria-hidden="true">🔍</span>
        <input
          className="search-box"
          placeholder={fileOnly ? "파일명 검색…" : "검색…"}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addSearchHistory(local);
          }}
          aria-label="노트 검색"
        />
        <button
          className={"search-toggle" + (fileOnly ? " active" : "")}
          title={fileOnly ? "파일명만 검색 (켜짐)" : "파일명만 검색"}
          aria-label="파일명만 검색"
          aria-pressed={fileOnly}
          onClick={() => setFileOnly((v) => !v)}
        >
          파일명
        </button>
        {local && (
          <button
            className="search-clear"
            title="검색어 지우기"
            aria-label="검색어 지우기"
            onClick={() => setLocal("")}
          >
            ✕
          </button>
        )}
      </div>
      {/* 17. 검색 기록 */}
      {searchFocused && !local && searchHistory.length > 0 && (
        <ul className="search-history">
          {searchHistory.map((q) => (
            <li key={q}>
              <button
                className="history-item"
                onMouseDown={() => setLocal(q)}
              >
                🕘 {q}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && fileOnly ? (
        <ul className="search-results">
          {fileMatches.length === 0 ? (
            <li className="search-empty">결과 없음</li>
          ) : (
            <li className="search-count">
              파일명 {fileMatches.length}개
              {fileMatches.length > RESULT_CAP && ` (상위 ${RESULT_CAP}개 표시)`}
            </li>
          )}
          {fileMatches.slice(0, RESULT_CAP).map((path) => (
            <li key={path}>
              <button className="search-hit" onClick={() => selectNote(path)}>
                <span className="hit-path">
                  {splitHighlight(path, searchQuery).map((s, j) =>
                    s.hit ? <mark key={j}>{s.text}</mark> : <span key={j}>{s.text}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : searching ? (
        <ul className="search-results">
          {searchResults.length === 0 ? (
            <li className="search-empty">결과 없음</li>
          ) : (
            <li className="search-count">
              {searchResults.length}개 결과
              {searchResults.length > RESULT_CAP && ` (상위 ${RESULT_CAP}개 표시)`}
            </li>
          )}
          {searchResults.slice(0, RESULT_CAP).map((hit, i) => (
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
              <button
                className="recent-title section-toggle"
                onClick={() => setShowPinned((s) => !s)}
              >
                <span className="tree-caret" style={{ transform: showPinned ? "rotate(90deg)" : "none" }}>▸</span>
                고정 ({pinned.length})
              </button>
              {showPinned &&
                pinned.map((path) => (
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
              <button
                className="recent-title section-toggle"
                onClick={() => setShowRecent((s) => !s)}
              >
                <span className="tree-caret" style={{ transform: showRecent ? "rotate(90deg)" : "none" }}>▸</span>
                최근 ({Math.min(recent.length, 5)})
              </button>
              {showRecent &&
                recent.slice(0, 5).map((path) => (
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
            onDelete={(path) =>
              confirmDelete ? setDialog({ kind: "delete", path }) : deleteNote(path)
            }
            onPin={togglePin}
            onNewInFolder={onNewInFolder}
            pinned={pinned}
            openDirs={openDirs}
            onToggleDir={toggleDir}
          />
        </>
      )}

      <button className="sidebar-footer" onClick={onOpenSettings}>
        <span
          className={
            "dot " +
            (syncStatus === "syncing"
              ? "dot-sync"
              : loggedIn
                ? "dot-on"
                : "dot-off")
          }
        />
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
          message={`'${dialog.path}'를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          danger
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
