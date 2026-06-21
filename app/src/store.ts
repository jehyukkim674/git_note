import { create } from "zustand";
import {
  api,
  type AppConfig,
  type SearchHit,
  type SyncResult,
  type TreeNode,
} from "./lib/api";
import { flattenFiles } from "./lib/tree";
import { type ThemeId, isThemeId, nextTheme } from "./lib/themes";
import { formatDateYmd } from "./lib/text";

export type SyncStatus =
  | "idle"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "norepo"
  | "error";

function statusFromResult(res: SyncResult): {
  syncStatus: SyncStatus;
  conflicts: string[];
} {
  switch (res.kind) {
    case "NoRepo":
      return { syncStatus: "norepo", conflicts: [] };
    case "Offline":
      return { syncStatus: "offline", conflicts: [] };
    case "Conflicts":
      return { syncStatus: "conflict", conflicts: res.detail };
    default:
      return { syncStatus: "synced", conflicts: [] };
  }
}

interface AppStore {
  tree: TreeNode[];
  selectedPath: string | null;
  content: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  vaultPath: string | null;
  searchQuery: string;
  searchResults: SearchHit[];
  loggedIn: boolean;
  clientIdSet: boolean;
  config: AppConfig | null;
  syncStatus: SyncStatus;
  conflicts: string[];
  theme: ThemeId;
  recent: string[];
  pinned: string[];
  sortBy: "name" | "modified";
  sortDir: "asc" | "desc";
  fontSize: "sm" | "md" | "lg";
  backlinks: string[];
  // 설정 플래그
  autoSave: boolean;
  autoSync: boolean;
  autoSyncSec: number;
  confirmDelete: boolean;
  spellcheck: boolean;
  searchHistory: string[];

  init: () => Promise<void>;
  loadTree: () => Promise<void>;
  selectNote: (path: string) => Promise<void>;
  openByName: (name: string) => Promise<void>;
  setContent: (content: string) => void;
  clearSelection: () => void;
  saveLocal: () => Promise<void>;
  save: () => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
  connectRepo: (repoUrl: string, branch: string) => Promise<void>;
  syncNow: () => Promise<void>;
  pushChanges: (message: string) => Promise<void>;
  createNote: (path: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  renameNote: (from: string, to: string) => Promise<void>;
  duplicateNote: (path: string) => Promise<void>;
  deleteNote: (path: string) => Promise<void>;
  clearError: () => void;
  setTheme: (theme: ThemeId) => void;
  cycleTheme: () => void;
  setSortBy: (sortBy: "name" | "modified") => void;
  setSortDir: (dir: "asc" | "desc") => void;
  togglePin: (path: string) => void;
  setFontSize: (fontSize: "sm" | "md" | "lg") => void;
  // 신규 기능
  openDailyNote: () => Promise<void>;
  gotoAdjacentNote: (delta: number) => Promise<void>;
  saveWithMessage: (message: string) => Promise<void>;
  setAutoSave: (v: boolean) => void;
  setAutoSync: (v: boolean) => void;
  setAutoSyncSec: (v: number) => void;
  setConfirmDelete: (v: boolean) => void;
  setSpellcheck: (v: boolean) => void;
  addSearchHistory: (q: string) => void;
}

function initialTheme(): ThemeId {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("theme");
    if (isThemeId(saved)) return saved;
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

/// .md 확장자를 보장한다.
function ensureMd(path: string): string {
  return path.endsWith(".md") ? path : `${path}.md`;
}

function loadList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function initialFontSize(): "sm" | "md" | "lg" {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem("fontSize") : null;
  return v === "sm" || v === "lg" ? v : "md";
}

function loadBool(key: string, def: boolean): boolean {
  if (typeof localStorage === "undefined") return def;
  const v = localStorage.getItem(key);
  return v === null ? def : v === "true";
}

function loadNum(key: string, def: number): number {
  if (typeof localStorage === "undefined") return def;
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : def;
}

function persist(key: string, value: string) {
  if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
}

export const useStore = create<AppStore>((set, get) => ({
  tree: [],
  selectedPath: null,
  content: "",
  dirty: false,
  loading: false,
  error: null,
  vaultPath: null,
  searchQuery: "",
  searchResults: [],
  loggedIn: false,
  clientIdSet: false,
  config: null,
  syncStatus: "idle",
  conflicts: [],
  theme: initialTheme(),
  recent: loadList("recent"),
  pinned: loadList("pinned"),
  sortBy: "name",
  sortDir: (localStorage.getItem("sortDir") as "asc" | "desc") || "asc",
  fontSize: initialFontSize(),
  backlinks: [],
  autoSave: loadBool("autoSave", true),
  autoSync: loadBool("autoSync", true),
  autoSyncSec: loadNum("autoSyncSec", 10),
  confirmDelete: loadBool("confirmDelete", true),
  spellcheck: loadBool("spellcheck", false),
  searchHistory: loadList("searchHistory"),

  init: async () => {
    set({ loading: true, error: null });
    try {
      const cfg = await api.ensureVault();
      set({
        vaultPath: cfg.vault_path,
        config: cfg,
        clientIdSet: !!cfg.github_client_id,
      });
      await get().loadTree();
      await get().refreshAuth();
      if (cfg.repo_url) {
        await get().syncNow();
      }
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  loadTree: async () => {
    const tree = await api.listTree();
    set({ tree });
  },

  selectNote: async (path: string) => {
    try {
      const content = await api.readNote(path);
      const recent = [path, ...get().recent.filter((p) => p !== path)].slice(0, 8);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("recent", JSON.stringify(recent));
      }
      set({ selectedPath: path, content, dirty: false, error: null, recent });
      // 백링크 로드(노트 파일명 기준)
      const base = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
      try {
        const backlinks = await api.backlinks(base);
        set({ backlinks: backlinks.filter((p) => p !== path) });
      } catch {
        set({ backlinks: [] });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openByName: async (name: string) => {
    const target = ensureMd(name);
    const files = flattenFiles(get().tree);
    const hit = files.find(
      (p) =>
        p === target ||
        p === name ||
        p.split("/").pop() === target ||
        p.split("/").pop()?.replace(/\.md$/, "") === name
    );
    if (hit) await get().selectNote(hit);
    else set({ error: `노트를 찾을 수 없음: ${name}` });
  },

  setContent: (content: string) => set({ content, dirty: true }),

  clearSelection: () => set({ selectedPath: null, content: "", dirty: false }),

  // 로컬에만 저장(잦은 자동저장용). push는 하지 않는다.
  saveLocal: async () => {
    const { selectedPath, content, dirty } = get();
    if (!selectedPath || !dirty) return;
    try {
      await api.writeNote(selectedPath, content);
      set({ dirty: false, error: null });
      await get().loadTree();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  // 명시적 저장: 로컬 저장 후 즉시 push.
  save: async () => {
    const { selectedPath } = get();
    if (!selectedPath) return;
    await get().saveLocal();
    await get().pushChanges(`update ${selectedPath}`);
  },

  pushChanges: async (message: string) => {
    const { config } = get();
    if (!config?.repo_url) return;
    set({ syncStatus: "syncing" });
    try {
      const res = await api.syncPush(message);
      set(statusFromResult(res));
    } catch (e) {
      set({ error: String(e), syncStatus: "error" });
    }
  },

  createNote: async (path: string) => {
    const rel = ensureMd(path);
    const title = rel.replace(/\.md$/, "").split("/").pop();
    // 15. 새 노트에 프론트매터 템플릿(생성일)
    const today = formatDateYmd(new Date());
    const body = `---\ncreated: ${today}\n---\n\n# ${title}\n\n`;
    try {
      await api.writeNote(rel, body);
      await get().loadTree();
      await get().selectNote(rel);
      await get().pushChanges(`create ${rel}`);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  renameNote: async (from: string, to: string) => {
    const dst = ensureMd(to);
    try {
      await api.renameNote(from, dst);
      await get().loadTree();
      if (get().selectedPath === from) {
        await get().selectNote(dst);
      }
      await get().pushChanges(`rename ${from} -> ${dst}`);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  duplicateNote: async (path: string) => {
    try {
      const content = await api.readNote(path);
      const base = path.endsWith(".md") ? path.slice(0, -3) : path;
      const existing = new Set(flattenFiles(get().tree));
      let candidate = `${base}-copy.md`;
      let n = 1;
      while (existing.has(candidate)) {
        candidate = `${base}-copy-${n}.md`;
        n += 1;
      }
      await api.writeNote(candidate, content);
      await get().loadTree();
      await get().selectNote(candidate);
      await get().pushChanges(`duplicate ${path}`);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteNote: async (path: string) => {
    try {
      await api.deleteNote(path);
      if (get().selectedPath === path) get().clearSelection();
      await get().loadTree();
      await get().pushChanges(`delete ${path}`);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  createFolder: async (path: string) => {
    try {
      await api.createFolder(path);
      await get().loadTree();
      await get().pushChanges(`create folder ${path}`);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setSortBy: (sortBy) => set({ sortBy }),

  setSortDir: (sortDir) => {
    persist("sortDir", sortDir);
    set({ sortDir });
  },

  // 8. 오늘 날짜 노트 열기/생성
  openDailyNote: async () => {
    const rel = `daily/${formatDateYmd(new Date())}.md`;
    const exists = flattenFiles(get().tree).includes(rel);
    if (!exists) {
      const today = formatDateYmd(new Date());
      await api.writeNote(rel, `---\ncreated: ${today}\n---\n\n# ${today}\n\n`);
      await get().loadTree();
      await get().pushChanges(`create ${rel}`);
    }
    await get().selectNote(rel);
  },

  // 13/14. 인접 노트로 이동(델타: +1 다음, -1 이전)
  gotoAdjacentNote: async (delta: number) => {
    const files = flattenFiles(get().tree);
    if (files.length === 0) return;
    const cur = get().selectedPath;
    const idx = cur ? files.indexOf(cur) : -1;
    const next = (idx + delta + files.length) % files.length;
    await get().selectNote(files[next]);
  },

  // 21. 커밋 메시지를 직접 지정해 저장+동기화
  saveWithMessage: async (message: string) => {
    const { selectedPath } = get();
    if (!selectedPath) return;
    await get().saveLocal();
    await get().pushChanges(message || `update ${selectedPath}`);
  },

  setAutoSave: (v) => {
    persist("autoSave", String(v));
    set({ autoSave: v });
  },
  setAutoSync: (v) => {
    persist("autoSync", String(v));
    set({ autoSync: v });
  },
  setAutoSyncSec: (v) => {
    persist("autoSyncSec", String(v));
    set({ autoSyncSec: v });
  },
  setConfirmDelete: (v) => {
    persist("confirmDelete", String(v));
    set({ confirmDelete: v });
  },
  setSpellcheck: (v) => {
    persist("spellcheck", String(v));
    set({ spellcheck: v });
  },
  addSearchHistory: (q) => {
    const query = q.trim();
    if (query.length < 2) return;
    const searchHistory = [query, ...get().searchHistory.filter((p) => p !== query)].slice(0, 8);
    persist("searchHistory", JSON.stringify(searchHistory));
    set({ searchHistory });
  },

  togglePin: (path: string) => {
    const pinned = get().pinned.includes(path)
      ? get().pinned.filter((p) => p !== path)
      : [...get().pinned, path];
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("pinned", JSON.stringify(pinned));
    }
    set({ pinned });
  },

  setFontSize: (fontSize) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("fontSize", fontSize);
    set({ fontSize });
  },

  clearError: () => set({ error: null }),

  setTheme: (theme: ThemeId) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("theme", theme);
    set({ theme });
  },

  cycleTheme: () => {
    const theme = nextTheme(get().theme);
    if (typeof localStorage !== "undefined") localStorage.setItem("theme", theme);
    set({ theme });
  },

  setSearchQuery: async (query: string) => {
    set({ searchQuery: query });
    if (query.trim() === "") {
      set({ searchResults: [] });
      return;
    }
    try {
      const searchResults = await api.searchNotes(query);
      set({ searchResults, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshAuth: async () => {
    try {
      const loggedIn = await api.githubLoggedIn();
      const cfg = await api.getConfig();
      set({ loggedIn, config: cfg, clientIdSet: !!cfg.github_client_id });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  logout: async () => {
    await api.githubLogout();
    set({ loggedIn: false });
  },

  connectRepo: async (repoUrl: string, branch: string) => {
    set({ syncStatus: "syncing", error: null });
    try {
      const cfg = await api.connectRepo(repoUrl, branch);
      set({ config: cfg, vaultPath: cfg.vault_path });
      await get().loadTree();
      await get().syncNow();
    } catch (e) {
      set({ error: String(e), syncStatus: "error" });
    }
  },

  syncNow: async () => {
    set({ syncStatus: "syncing" });
    try {
      const res = await api.syncPull();
      set(statusFromResult(res));
      await get().loadTree();
      // 현재 노트가 원격 변경으로 갱신됐을 수 있으니 다시 읽기
      const { selectedPath, dirty } = get();
      if (selectedPath && !dirty) {
        await get().selectNote(selectedPath);
      }
    } catch (e) {
      set({ error: String(e), syncStatus: "error" });
    }
  },
}));
