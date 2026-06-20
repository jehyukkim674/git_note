import { create } from "zustand";
import { api, type SearchHit, type TreeNode } from "./lib/api";

interface AppStore {
  tree: TreeNode[];
  selectedPath: string | null;
  content: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: SearchHit[];

  init: () => Promise<void>;
  loadTree: () => Promise<void>;
  selectNote: (path: string) => Promise<void>;
  setContent: (content: string) => void;
  save: () => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
}

export const useStore = create<AppStore>((set, get) => ({
  tree: [],
  selectedPath: null,
  content: "",
  dirty: false,
  loading: false,
  error: null,
  searchQuery: "",
  searchResults: [],

  init: async () => {
    set({ loading: true, error: null });
    try {
      await api.ensureVault();
      await get().loadTree();
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
