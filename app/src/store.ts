import { create } from "zustand";
import {
  api,
  type AppConfig,
  type SearchHit,
  type SyncResult,
  type TreeNode,
} from "./lib/api";

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
  theme: "light" | "dark";

  init: () => Promise<void>;
  loadTree: () => Promise<void>;
  selectNote: (path: string) => Promise<void>;
  setContent: (content: string) => void;
  clearSelection: () => void;
  save: () => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
  connectRepo: (repoUrl: string, branch: string) => Promise<void>;
  syncNow: () => Promise<void>;
  pushChanges: (message: string) => Promise<void>;
  createNote: (path: string) => Promise<void>;
  renameNote: (from: string, to: string) => Promise<void>;
  deleteNote: (path: string) => Promise<void>;
  clearError: () => void;
  toggleTheme: () => void;
}

function initialTheme(): "light" | "dark" {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
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
      set({ selectedPath: path, content, dirty: false, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setContent: (content: string) => set({ content, dirty: true }),

  clearSelection: () => set({ selectedPath: null, content: "", dirty: false }),

  save: async () => {
    const { selectedPath, content } = get();
    if (!selectedPath) return;
    try {
      await api.writeNote(selectedPath, content);
      set({ dirty: false, error: null });
      await get().loadTree();
      await get().pushChanges(`update ${selectedPath}`);
    } catch (e) {
      set({ error: String(e), syncStatus: "error" });
    }
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
    try {
      await api.writeNote(rel, `# ${rel.replace(/\.md$/, "").split("/").pop()}\n\n`);
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

  clearError: () => set({ error: null }),

  toggleTheme: () => {
    const theme = get().theme === "dark" ? "light" : "dark";
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
