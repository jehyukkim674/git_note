import { invoke } from "@tauri-apps/api/core";

export interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  modified: number;
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

export type SyncResult =
  | { kind: "NoRepo" }
  | { kind: "UpToDate" }
  | { kind: "Pulled" }
  | { kind: "Pushed" }
  | { kind: "Offline" }
  | { kind: "Conflicts"; detail: string[] };

export interface UpdateCheck {
  current: string;
  latest_tag: string;
  newer: boolean;
  html_url: string;
  apk_url: string | null;
}

export { ownerRepoFromUrl } from "./text";

/// Rust Tauri command 래퍼.
export const api = {
  ensureVault: () => invoke<AppConfig>("ensure_vault"),
  getConfig: () => invoke<AppConfig>("get_config"),
  listTree: () => invoke<TreeNode[]>("list_tree"),
  readNote: (rel: string) => invoke<string>("read_note", { rel }),
  writeNote: (rel: string, content: string) =>
    invoke<void>("write_note", { rel, content }),
  deleteNote: (rel: string) => invoke<void>("delete_note", { rel }),
  renameNote: (from: string, to: string) =>
    invoke<void>("rename_note", { from, to }),
  exportHtml: (rel: string, html: string) =>
    invoke<string>("export_html", { rel, html }),
  createFolder: (rel: string) => invoke<void>("create_folder", { rel }),
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

  setAuthor: (name: string, email: string) =>
    invoke<void>("set_author", { name, email }),
  connectRepo: (repoUrl: string, branch: string) =>
    invoke<AppConfig>("connect_repo", { repoUrl, branch }),
  syncPull: () => invoke<SyncResult>("sync_pull"),
  syncPush: (message: string) => invoke<SyncResult>("sync_push", { message }),
  checkUpdateGithub: (ownerRepo: string) =>
    invoke<UpdateCheck>("check_update_github", { ownerRepo }),
};
