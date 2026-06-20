import { create } from "zustand";
import { api, type SearchHit, type TreeNode } from "./lib/api";

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

  init: () => Promise<void>;
  loadTree: () => Promise<void>;
  selectNote: (path: string) => Promise<void>;
  setContent: (content: string) => void;
  save: () => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
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

  init: async () => {
    set({ loading: true, error: null });
    try {
      const cfg = await api.ensureVault();
      set({
        vaultPath: cfg.vault_path,
        clientIdSet: !!cfg.github_client_id,
      });
      await get().loadTree();
      await get().refreshAuth();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  refreshAuth: async () => {
    try {
      const loggedIn = await api.githubLoggedIn();
      const cfg = await api.getConfig();
      set({ loggedIn, clientIdSet: !!cfg.github_client_id });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  logout: async () => {
    await api.githubLogout();
    set({ loggedIn: false });
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
    const { selectedPath, content } = get();
    if (!selectedPath) return;
    try {
      await api.writeNote(selectedPath, content);
      set({ dirty: false, error: null });
      await get().loadTree();
    } catch (e) {
      set({ error: String(e) });
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
}));
