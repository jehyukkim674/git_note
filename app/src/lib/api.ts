import { invoke } from "@tauri-apps/api/core";

export interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: TreeNode[];
}

export interface AppConfig {
  vault_path: string | null;
  repo_url: string | null;
  branch: string;
  author_name: string;
  author_email: string;
}

export interface SearchHit {
  path: string;
  line: number;
  snippet: string;
}

/// Rust Tauri command 래퍼.
export const api = {
  ensureVault: () => invoke<AppConfig>("ensure_vault"),
  getConfig: () => invoke<AppConfig>("get_config"),
  listTree: () => invoke<TreeNode[]>("list_tree"),
  readNote: (rel: string) => invoke<string>("read_note", { rel }),
  writeNote: (rel: string, content: string) =>
    invoke<void>("write_note", { rel, content }),
  deleteNote: (rel: string) => invoke<void>("delete_note", { rel }),
  searchNotes: (query: string) => invoke<SearchHit[]>("search_notes", { query }),
};
