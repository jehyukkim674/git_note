import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { api } from "./lib/api";
import { renderMarkdown, stripFrontmatter } from "./lib/markdown";
import { useMediaQuery } from "./lib/useMediaQuery";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { SettingsModal } from "./components/SettingsModal";
import { QuickOpen } from "./components/QuickOpen";
import { Dialog } from "./components/Dialog";
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
    config,
    fontSize,
    init,
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
  } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [appDialog, setAppDialog] = useState<"newNote" | "newFolder" | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 720px)");

  const wordInfo = useMemo(() => {
    const text = stripFrontmatter(content).trim();
    const words = text ? text.split(/\s+/).length : 0;
    return { words, mins: Math.max(1, Math.ceil(words / 200)) };
  }, [content]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "s") {
        e.preventDefault();
        save();
      } else if (e.key === "n") {
        e.preventDefault();
        setAppDialog("newNote");
      } else if (e.key === "k" || e.key === "p") {
        e.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // 자동 저장: 편집 후 1.5초 로컬 저장(push 안 함)
  useEffect(() => {
    if (!dirty || !selectedPath) return;
    const t = setTimeout(() => saveLocal(), 1500);
    return () => clearTimeout(t);
  }, [dirty, content, selectedPath, saveLocal]);

  // 자동 동기화: 마지막 편집 후 10초에 한 번 push(커밋 폭주 방지)
  useEffect(() => {
    if (!selectedPath || !config?.repo_url) return;
    const t = setTimeout(() => pushChanges("auto sync"), 10000);
    return () => clearTimeout(t);
  }, [content, selectedPath, config?.repo_url, pushChanges]);

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
      {quickOpen && <QuickOpen onClose={() => setQuickOpen(false)} />}
      {appDialog === "newNote" && (
        <Dialog
          title="새 노트"
          mode="input"
          message="경로 입력 (예: 폴더/메모). .md는 자동으로 붙습니다."
          confirmLabel="생성"
          onSubmit={(v) => {
            if (v.trim()) createNote(v.trim());
            setAppDialog(null);
          }}
          onCancel={() => setAppDialog(null)}
        />
      )}
      {appDialog === "newFolder" && (
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
          {selectedPath && !isMobile && (
            <span className="word-count" title="단어 수 · 예상 읽기시간">
              {exportMsg || `${wordInfo.words}단어 · ${wordInfo.mins}분`}
            </span>
          )}
          {selectedPath && (
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
            <button className="save-btn" onClick={save} disabled={!dirty}>
              {dirty ? "저장" : "저장됨"}
            </button>
          )}
        </span>
      </div>
      {selectedPath ? (
        isMobile && mobilePreview ? (
          <Preview content={content} vaultPath={vaultPath} onWikiLink={openByName} />
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
      <div className={`app app-mobile font-${fontSize}`}>
        {selectedPath ? (
          editorPane
        ) : (
          <Sidebar
            onOpenSettings={() => setSettingsOpen(true)}
            onNewNote={() => setAppDialog("newNote")}
            onNewFolder={() => setAppDialog("newFolder")}
          />
        )}
        {overlays}
      </div>
    );
  }

  return (
    <div className={`app font-${fontSize}`}>
      <Sidebar
            onOpenSettings={() => setSettingsOpen(true)}
            onNewNote={() => setAppDialog("newNote")}
            onNewFolder={() => setAppDialog("newFolder")}
          />
      {editorPane}
      <section className="preview-pane">
        <div className="pane-header">미리보기</div>
        <Preview content={content} vaultPath={vaultPath} onWikiLink={openByName} />
      </section>

      {overlays}
    </div>
  );
}

export default App;
