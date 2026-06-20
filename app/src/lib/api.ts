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
  github_client_id: string | null;
}

export interface SearchHit {
  path: string;
  line: number;
  snippet: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export type PollStatusKind =
  | "Pending"
  | "SlowDown"
  | "Authorized"
  | "Denied"
  | "Expired"
  | "Error";

export interface PollStatus {
  status: PollStatusKind;
  detail?: string;
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
  saveAsset: (filename: string, bytes: number[]) =>
    invoke<string>("save_asset", { filename, bytes }),

  setGithubClientId: (clientId: string) =>
    invoke<void>("set_github_client_id", { clientId }),
  githubStartDeviceFlow: () =>
    invoke<DeviceCodeResponse>("github_start_device_flow"),
  githubPoll: (deviceCode: string) =>
    invoke<PollStatus>("github_poll", { deviceCode }),
  githubLoggedIn: () => invoke<boolean>("github_logged_in"),
  githubLogout: () => invoke<void>("github_logout"),
};
