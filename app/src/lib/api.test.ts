import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { api, ownerRepoFromUrl } from "./api";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined as never);
});

describe("api 래퍼", () => {
  it("인자 없는 커맨드는 이름만 invoke한다", async () => {
    await api.ensureVault();
    await api.getConfig();
    await api.listTree();
    await api.vaultStats();
    await api.githubLoggedIn();
    await api.githubLogout();
    await api.syncPull();
    expect(mockInvoke).toHaveBeenCalledWith("ensure_vault");
    expect(mockInvoke).toHaveBeenCalledWith("get_config");
    expect(mockInvoke).toHaveBeenCalledWith("list_tree");
    expect(mockInvoke).toHaveBeenCalledWith("vault_stats");
    expect(mockInvoke).toHaveBeenCalledWith("github_logged_in");
    expect(mockInvoke).toHaveBeenCalledWith("github_logout");
    expect(mockInvoke).toHaveBeenCalledWith("sync_pull");
  });

  it("인자 있는 커맨드는 올바른 payload로 invoke한다", async () => {
    await api.readNote("a.md");
    expect(mockInvoke).toHaveBeenCalledWith("read_note", { rel: "a.md" });

    await api.writeNote("a.md", "본문");
    expect(mockInvoke).toHaveBeenCalledWith("write_note", {
      rel: "a.md",
      content: "본문",
    });

    await api.deleteNote("a.md");
    expect(mockInvoke).toHaveBeenCalledWith("delete_note", { rel: "a.md" });

    await api.renameNote("a.md", "b.md");
    expect(mockInvoke).toHaveBeenCalledWith("rename_note", {
      from: "a.md",
      to: "b.md",
    });

    await api.exportHtml("a.md", "<p>x</p>");
    expect(mockInvoke).toHaveBeenCalledWith("export_html", {
      rel: "a.md",
      html: "<p>x</p>",
    });

    await api.createFolder("f");
    expect(mockInvoke).toHaveBeenCalledWith("create_folder", { rel: "f" });

    await api.backlinks("noteA");
    expect(mockInvoke).toHaveBeenCalledWith("backlinks", { name: "noteA" });

    await api.searchNotes("쿼리");
    expect(mockInvoke).toHaveBeenCalledWith("search_notes", { query: "쿼리" });

    await api.saveAsset("img.png", [1, 2, 3]);
    expect(mockInvoke).toHaveBeenCalledWith("save_asset", {
      filename: "img.png",
      bytes: [1, 2, 3],
    });
  });

  it("GitHub/저장소/동기화 커맨드", async () => {
    await api.setGithubClientId("cid");
    expect(mockInvoke).toHaveBeenCalledWith("set_github_client_id", {
      clientId: "cid",
    });
    await api.githubStartDeviceFlow();
    expect(mockInvoke).toHaveBeenCalledWith("github_start_device_flow");
    await api.githubPoll("dc");
    expect(mockInvoke).toHaveBeenCalledWith("github_poll", { deviceCode: "dc" });
    await api.setAuthor("이름", "메일");
    expect(mockInvoke).toHaveBeenCalledWith("set_author", {
      name: "이름",
      email: "메일",
    });
    await api.connectRepo("url", "main");
    expect(mockInvoke).toHaveBeenCalledWith("connect_repo", {
      repoUrl: "url",
      branch: "main",
    });
    await api.syncPush("msg");
    expect(mockInvoke).toHaveBeenCalledWith("sync_push", { message: "msg" });
    await api.checkUpdateGithub("o/r");
    expect(mockInvoke).toHaveBeenCalledWith("check_update_github", {
      ownerRepo: "o/r",
    });
  });

  it("ownerRepoFromUrl을 재노출한다", () => {
    expect(ownerRepoFromUrl("https://github.com/a/b.git")).toBe("a/b");
  });
});
