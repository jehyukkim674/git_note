import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { api } from "./lib/api";
import { renderMarkdown, stripFrontmatter } from "./lib/markdown";
import { hasConflictMarkers, toggleTaskAt, generateToc } from "./lib/text";
import { useMediaQuery } from "./lib/useMediaQuery";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { SettingsModal } from "./components/SettingsModal";
import { QuickOpen } from "./components/QuickOpen";
import { Dialog } from "./components/Dialog";
import { Outline } from "./components/Outline";
import { Connections } from "./components/Connections";
import { TagBrowser } from "./components/TagBrowser";
import { StatsModal } from "./components/StatsModal";
import "./App.css";

type ViewMode = "split" | "editor" | "preview";

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
    config,
    fontSize,
    backlinks,
    pinned,
    spellcheck,
    autoSave,
    autoSync,
    autoSyncSec,
    setSearchQuery,
    init,
    selectNote,
    setContent,
    save,
    saveLocal,
    pushChanges,
    clearSelection,
    clearError,
    syncNow,
    openByName,
    createNote,
    createFolder,
    togglePin,
    openDailyNote,
    gotoAdjacentNote,
    saveWithMessage,
  } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [appDialog, setAppDialog] = useState<
    { kind: "newNote"; initial?: string } | { kind: "newFolder" } | null
  >(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [zen, setZen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [commitOpen, setCommitOpen] = useState(false);
  const [sidebarW, setSidebarW] = useState(
    () => Number(localStorage.getItem("sidebarW")) || 250
  );
  const isMobile = useMediaQuery("(max-width: 720px)");

  useEffect(() => {
    localStorage.setItem("sidebarW", String(sidebarW));
  }, [sidebarW]);

  // 17. 사이드바 너비 드래그 조절
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarW;
    const move = (ev: MouseEvent) =>
      setSidebarW(Math.min(440, Math.max(180, startW + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const toggleTask = (index: number) =>
    setContent(toggleTaskAt(content, index));

  const closeMenu = (e: React.MouseEvent) =>
    (e.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
  const copyMarkdown = () => navigator.clipboard.writeText(content);
  const copyHtml = () =>
    navigator.clipboard.writeText(renderMarkdown(content, vaultPath));
  const insertToc = () => {
    const toc = generateToc(content);
    if (toc) setContent(`${toc}\n${content}`);
  };
  const printNote = () => {
    const html = renderMarkdown(content, vaultPath);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>${selectedPath ?? "노트"}</title></head><body>${html}</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };
  const cycleView = () =>
    setViewMode((m) =>
      m === "split" ? "editor" : m === "editor" ? "preview" : "split"
    );
  const viewLabel = { split: "분할", editor: "편집", preview: "미리보기" }[viewMode];

  const wordInfo = useMemo(() => {
    const text = stripFrontmatter(content).trim();
    const words = text ? text.split(/\s+/).length : 0;
    return { words, mins: Math.max(1, Math.ceil(words / 200)) };
  }, [content]);

  const conflicted = useMemo(() => hasConflictMarkers(content), [content]);

  const onExport = async () => {
    if (!selectedPath) return;
    try {
      const html = renderMarkdown(content, vaultPath);
      const out = await api.exportHtml(selectedPath, html);
      setExportMsg(`내보냄: ${out}`);
      setTimeout(() => setExportMsg(""), 2500);
    } catch (e) {
      setExportMsg(String(e));
    }
  };

  useEffect(() => {
    init();
  }, [init]);

  // 테마 적용
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 28. 창 제목에 현재 노트 이름 표시
  useEffect(() => {
    const name = selectedPath?.split("/").pop()?.replace(/\.md$/, "");
    document.title = name ? `${name} — git_note` : "git_note";
  }, [selectedPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 22. 단축키 도움말(?)
      if (e.key === "?" && !(e.metaKey || e.ctrlKey)) {
        const el = e.target as HTMLElement;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
          return;
        e.preventDefault();
        setShowHelp((s) => !s);
        return;
      }
      // 25. Esc로 젠 모드 종료
      if (e.key === "Escape" && zen) {
        setZen(false);
        return;
      }
      // 27. Esc로 검색 초기화(모달이 없을 때)
      if (e.key === "Escape" && !settingsOpen && !quickOpen && !appDialog && !showHelp) {
        if (useStore.getState().searchQuery) {
          setSearchQuery("");
          return;
        }
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "s") {
        e.preventDefault();
        save();
      } else if (e.key === "n") {
        e.preventDefault();
        setAppDialog({ kind: "newNote" });
      } else if (e.key === "k" || e.key === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (e.key === "\\") {
        // 23. ⌘\ 아웃라인 토글
        e.preventDefault();
        setShowOutline((s) => !s);
      } else if (e.key === "]") {
        // 13. 다음 노트
        e.preventDefault();
        gotoAdjacentNote(1);
      } else if (e.key === "[") {
        // 14. 이전 노트
        e.preventDefault();
        gotoAdjacentNote(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, settingsOpen, quickOpen, appDialog, showHelp, zen, setSearchQuery, gotoAdjacentNote]);

  // 26. 오류 토스트 자동 닫힘(6초)
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => clearError(), 6000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  // 자동 저장: 편집 후 1.5초 로컬 저장(push 안 함) — 설정으로 끌 수 있음
  useEffect(() => {
    if (!autoSave || !dirty || !selectedPath) return;
    const t = setTimeout(() => saveLocal(), 1500);
    return () => clearTimeout(t);
  }, [autoSave, dirty, content, selectedPath, saveLocal]);

  // 자동 동기화: 마지막 편집 후 N초에 한 번 push(커밋 폭주 방지) — 설정으로 끌 수 있음
  useEffect(() => {
    if (!autoSync || !selectedPath || !config?.repo_url) return;
    const t = setTimeout(() => pushChanges("auto sync"), autoSyncSec * 1000);
    return () => clearTimeout(t);
  }, [autoSync, autoSyncSec, content, selectedPath, config?.repo_url, pushChanges]);

  // 창 포커스 복귀 시 자동 pull(스펙)
  useEffect(() => {
    const onFocus = () => {
      if (config?.repo_url) syncNow();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [config?.repo_url, syncNow]);

  const overlays = (
    <>
      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>불러오는 중…</span>
        </div>
      )}
      {exportMsg && (
        <div className="success-toast" role="status" aria-live="polite">
          <span>{exportMsg}</span>
          <button className="toast-close" onClick={() => setExportMsg("")}>
            ✕
          </button>
        </div>
      )}
      {syncStatus === "conflict" && conflicts.length > 0 && (
        <div className="conflict-banner">
          <span>
            충돌:{" "}
            {conflicts.map((p, i) => (
              <button
                key={p}
                className="conflict-link"
                onClick={() => selectNote(p)}
              >
                {p}
                {i < conflicts.length - 1 ? ", " : ""}
              </button>
            ))}
            {" "}— 정리 후 다시 동기화하세요.
          </span>
          <button onClick={() => syncNow()}>다시 동기화</button>
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert" aria-live="assertive">
          <span>{error}</span>
          <button className="toast-close" onClick={clearError}>
            ✕
          </button>
        </div>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {quickOpen && <QuickOpen onClose={() => setQuickOpen(false)} />}
      {appDialog?.kind === "newNote" && (
        <Dialog
          title="새 노트"
          mode="input"
          initial={appDialog.initial ?? ""}
          message="경로 입력 (예: 폴더/메모). .md는 자동으로 붙습니다."
          confirmLabel="생성"
          onSubmit={(v) => {
            if (v.trim()) createNote(v.trim());
            setAppDialog(null);
          }}
          onCancel={() => setAppDialog(null)}
        />
      )}
      {appDialog?.kind === "newFolder" && (
        <Dialog
          title="새 폴더"
          mode="input"
          message="폴더 경로 입력 (예: 프로젝트/2026)"
          confirmLabel="생성"
          onSubmit={(v) => {
            if (v.trim()) createFolder(v.trim());
            setAppDialog(null);
          }}
          onCancel={() => setAppDialog(null)}
        />
      )}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="단축키"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>단축키</h2>
            <ul className="shortcut-list">
              <li><kbd>⌘/Ctrl + S</kbd> 저장 + 동기화</li>
              <li><kbd>⌘/Ctrl + N</kbd> 새 노트</li>
              <li><kbd>⌘/Ctrl + K</kbd> 빠른 열기</li>
              <li><kbd>⌘/Ctrl + \</kbd> 목차 열기/닫기</li>
              <li><kbd>⌘/Ctrl + F</kbd> 노트 안에서 찾기·바꾸기</li>
              <li><kbd>⌘/Ctrl + ]</kbd> 다음 노트 · <kbd>⌘/Ctrl + [</kbd> 이전 노트</li>
              <li><kbd>⌘/Ctrl + B</kbd> 굵게 · <kbd>⌘/Ctrl + I</kbd> 기울임 · <kbd>⌘/Ctrl + K</kbd> 링크</li>
              <li><kbd>?</kbd> 이 도움말</li>
              <li><kbd>Esc</kbd> 검색 초기화 / 닫기</li>
            </ul>
            <div className="row-end">
              <button onClick={() => setShowHelp(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
      {showStats && (
        <StatsModal
          content={content}
          path={selectedPath}
          onClose={() => setShowStats(false)}
        />
      )}
      {showTags && <TagBrowser onClose={() => setShowTags(false)} />}
      {commitOpen && (
        <Dialog
          title="메시지와 함께 동기화"
          mode="input"
          initial={selectedPath ? `update ${selectedPath}` : ""}
          message="커밋 메시지를 입력하세요."
          confirmLabel="동기화"
          onSubmit={(v) => {
            saveWithMessage(v.trim());
            setCommitOpen(false);
          }}
          onCancel={() => setCommitOpen(false)}
        />
      )}
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
        <span className="pane-title">{selectedPath ?? "노트를 선택하세요"}</span>
        <span className="header-right">
          {selectedPath && (
            <span className="word-count" title="단어 수 · 예상 읽기시간">
              {wordInfo.words}단어 · {wordInfo.mins}분
            </span>
          )}
          {selectedPath && (
            <button
              className="save-btn"
              onClick={() => togglePin(selectedPath)}
              title={pinned.includes(selectedPath) ? "고정 해제" : "고정"}
              aria-label="고정 토글"
            >
              {pinned.includes(selectedPath) ? "★" : "☆"}
            </button>
          )}
          {selectedPath && !isMobile && (
            <details className="hmenu">
              <summary className="save-btn" title="더 보기">⋯</summary>
              <div className="hmenu-list">
                <button onClick={(e) => { closeMenu(e); copyMarkdown(); }}>Markdown 복사</button>
                <button onClick={(e) => { closeMenu(e); copyHtml(); }}>HTML 복사</button>
                <button onClick={(e) => { closeMenu(e); onExport(); }}>HTML 내보내기</button>
                <button onClick={(e) => { closeMenu(e); insertToc(); }}>목차 삽입</button>
                <button onClick={(e) => { closeMenu(e); printNote(); }}>인쇄</button>
                <button onClick={(e) => { closeMenu(e); setShowStats(true); }}>통계</button>
                <button onClick={(e) => { closeMenu(e); setCommitOpen(true); }}>메시지와 함께 동기화</button>
              </div>
            </details>
          )}
          {!isMobile && (
            <button className="save-btn" onClick={cycleView} title="보기 모드 전환">
              {viewLabel}
            </button>
          )}
          {isMobile && selectedPath && (
            <button className="save-btn" onClick={onExport} title="HTML 내보내기">
              HTML
            </button>
          )}
          {isMobile && selectedPath && (
            <button
              className="save-btn"
              onClick={() => setMobilePreview((p) => !p)}
            >
              {mobilePreview ? "편집" : "미리보기"}
            </button>
          )}
          {selectedPath && (
            <button
              className={"save-btn save-state" + (dirty ? " is-dirty" : "")}
              onClick={save}
              disabled={!dirty}
              title={dirty ? "저장 (⌘S)" : "모든 변경사항 저장됨"}
            >
              <span className="save-dot" aria-hidden="true" />
              {dirty ? "저장" : "저장됨"}
            </button>
          )}
        </span>
      </div>
      {selectedPath && conflicted && (
        <div className="conflict-inline" role="alert">
          ⚠ 이 노트에 병합 충돌 마커가 있습니다. {"<<<<<<<"} / {"======="} /{" "}
          {">>>>>>>"} 구간을 정리한 뒤 저장(⌘S)하면 해결됩니다.
        </div>
      )}
      {selectedPath ? (
        isMobile && mobilePreview ? (
          <Preview
            content={content}
            vaultPath={vaultPath}
            onWikiLink={openByName}
            onToggleTask={toggleTask}
          />
        ) : (
          <Editor
            value={content}
            onChange={setContent}
            saveImage={saveImage}
            spellcheck={spellcheck}
          />
        )
      ) : (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">📝</div>
          <p>왼쪽에서 노트를 선택하거나 ＋로 새 노트를 만드세요.</p>
          {!config?.repo_url && (
            <p className="onboarding">
              지금은 로컬에만 저장됩니다. 기기 간 동기화를 켜려면{" "}
              <button className="link" onClick={() => setSettingsOpen(true)}>
                설정에서 GitHub 저장소 연결
              </button>
              .
            </p>
          )}
        </div>
      )}
    </section>
  );

  const previewPane = (
    <section className="preview-pane">
      <div className="pane-header">
        <span className="pane-label">미리보기</span>
        <span className="header-right">
          {selectedPath && (
            <span className="word-count">{wordInfo.words}단어</span>
          )}
          <button className="save-btn" onClick={cycleView} title="보기 모드 전환">
            {viewLabel}
          </button>
          <button
            className="save-btn"
            onClick={() => setZen(true)}
            title="젠 모드(집중)"
          >
            ⛶
          </button>
          <button
            className="save-btn"
            onClick={() => setShowOutline((s) => !s)}
            title="목차 (⌘\)"
          >
            {showOutline ? "목차 닫기" : "목차"}
          </button>
        </span>
      </div>
      {showOutline && <Outline content={content} />}
      <Preview
        content={content}
        vaultPath={vaultPath}
        onWikiLink={openByName}
        onToggleTask={toggleTask}
      />
      {selectedPath && (
        <Connections
          content={content}
          backlinks={backlinks}
          onTag={(t) => setSearchQuery(`#${t}`)}
          onOpen={selectNote}
        />
      )}
    </section>
  );

  const sidebar = (
    <Sidebar
      onOpenSettings={() => setSettingsOpen(true)}
      onNewNote={() => setAppDialog({ kind: "newNote" })}
      onNewFolder={() => setAppDialog({ kind: "newFolder" })}
      onNewInFolder={(dir) => setAppDialog({ kind: "newNote", initial: `${dir}/` })}
      onDailyNote={() => openDailyNote()}
      onOpenTags={() => setShowTags(true)}
    />
  );

  if (isMobile) {
    return (
      <div className={`app app-mobile font-${fontSize}`}>
        {selectedPath ? editorPane : sidebar}
        {overlays}
      </div>
    );
  }

  // 25. 젠 모드: 에디터만 전체 화면
  if (zen) {
    return (
      <div className={`app app-zen font-${fontSize}`}>
        {editorPane}
        <button
          className="zen-exit"
          onClick={() => setZen(false)}
          title="젠 모드 종료 (Esc)"
          aria-label="젠 모드 종료"
        >
          ✕
        </button>
        {overlays}
      </div>
    );
  }

  return (
    <div
      className={`app view-${viewMode} font-${fontSize}`}
      style={{ ["--sidebar-w" as string]: `${sidebarW}px` } as React.CSSProperties}
    >
      {sidebar}
      <div
        className="sidebar-resizer"
        onMouseDown={startResize}
        role="separator"
        aria-label="사이드바 너비 조절"
      />
      {viewMode !== "preview" && editorPane}
      {viewMode !== "editor" && previewPane}

      {overlays}
    </div>
  );
}

export default App;
