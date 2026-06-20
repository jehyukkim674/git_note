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

  init: () => Promise<void>;
  loadTree: () => Promise<void>;
  selectNote: (path: string) => Promise<void>;
  setContent: (content: string) => void;
  save: () => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
  connectRepo: (repoUrl: string, branch: string) => Promise<void>;
  syncNow: () => Promise<void>;
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

  save: async () => {
    const { selectedPath, content, config } = get();
    if (!selectedPath) return;
    try {
      await api.writeNote(selectedPath, content);
      set({ dirty: false, error: null });
      await get().loadTree();
      if (config?.repo_url) {
        set({ syncStatus: "syncing" });
        const res = await api.syncPush(`update ${selectedPath}`);
        set(statusFromResult(res));
      }
    } catch (e) {
      set({ error: String(e), syncStatus: "error" });
    }
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
