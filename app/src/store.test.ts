import { describe, it, expect, beforeEach, vi } from "vitest";

// 스토어가 의존하는 Tauri 커맨드 래퍼를 통째로 목킹한다.
vi.mock("./lib/api", () => {
  const api = {
    ensureVault: vi.fn(),
    getConfig: vi.fn(),
    listTree: vi.fn(),
    readNote: vi.fn(),
    writeNote: vi.fn(),
    deleteNote: vi.fn(),
    renameNote: vi.fn(),
    createFolder: vi.fn(),
    backlinks: vi.fn(),
    searchNotes: vi.fn(),
    githubLoggedIn: vi.fn(),
    githubLogout: vi.fn(),
    connectRepo: vi.fn(),
    syncPull: vi.fn(),
    syncPush: vi.fn(),
  };
  return { api };
});

import { useStore } from "./store";
import { api } from "./lib/api";
import type { TreeNode } from "./lib/api";

const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const file = (name: string, path: string): TreeNode => ({
  name,
  path,
  is_dir: false,
  modified: 0,
  children: [],
});

const repoConfig = {
  vault_path: "/v",
  repo_url: "https://github.com/a/b.git",
  branch: "main",
  author_name: "n",
  author_email: "e",
  github_client_id: null,
};

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(m)) fn.mockReset();
  m.listTree.mockResolvedValue([]);
  m.readNote.mockResolvedValue("내용");
  m.backlinks.mockResolvedValue([]);
  m.writeNote.mockResolvedValue(undefined);
  m.syncPush.mockResolvedValue({ kind: "Pushed" });
  m.syncPull.mockResolvedValue({ kind: "Pulled" });
  m.githubLoggedIn.mockResolvedValue(false);
  m.getConfig.mockResolvedValue(repoConfig);
  useStore.setState({
    tree: [],
    selectedPath: null,
    content: "",
    dirty: false,
    error: null,
    config: null,
    vaultPath: null,
    recent: [],
    pinned: [],
    searchHistory: [],
    searchResults: [],
    backlinks: [],
    syncStatus: "idle",
    conflicts: [],
  });
});

describe("동기/설정 액션", () => {
  it("setContent는 dirty로 만든다", () => {
    useStore.getState().setContent("x");
    expect(useStore.getState().content).toBe("x");
    expect(useStore.getState().dirty).toBe(true);
  });

  it("clearSelection은 선택을 비운다", () => {
    useStore.setState({ selectedPath: "a.md", content: "y", dirty: true });
    useStore.getState().clearSelection();
    expect(useStore.getState().selectedPath).toBeNull();
    expect(useStore.getState().content).toBe("");
  });

  it("setTheme/cycleTheme는 상태와 localStorage를 갱신한다", () => {
    useStore.getState().setTheme("nord");
    expect(useStore.getState().theme).toBe("nord");
    expect(localStorage.getItem("theme")).toBe("nord");
    const before = useStore.getState().theme;
    useStore.getState().cycleTheme();
    expect(useStore.getState().theme).not.toBe(before);
  });

  it("정렬/글꼴 설정", () => {
    useStore.getState().setSortBy("modified");
    useStore.getState().setSortDir("desc");
    useStore.getState().setFontSize("lg");
    expect(useStore.getState().sortBy).toBe("modified");
    expect(useStore.getState().sortDir).toBe("desc");
    expect(useStore.getState().fontSize).toBe("lg");
    expect(localStorage.getItem("sortDir")).toBe("desc");
  });

  it("togglePin은 추가/제거하고 저장한다", () => {
    useStore.getState().togglePin("a.md");
    expect(useStore.getState().pinned).toContain("a.md");
    useStore.getState().togglePin("a.md");
    expect(useStore.getState().pinned).not.toContain("a.md");
  });

  it("동작 설정 토글들", () => {
    const s = useStore.getState();
    s.setAutoSave(false);
    s.setAutoSync(false);
    s.setAutoSyncSec(30);
    s.setConfirmDelete(false);
    s.setSpellcheck(true);
    const st = useStore.getState();
    expect(st.autoSave).toBe(false);
    expect(st.autoSync).toBe(false);
    expect(st.autoSyncSec).toBe(30);
    expect(st.confirmDelete).toBe(false);
    expect(st.spellcheck).toBe(true);
    expect(localStorage.getItem("autoSyncSec")).toBe("30");
  });

  it("addSearchHistory: 짧은 건 무시, 중복 제거, 8개 제한", () => {
    const s = useStore.getState();
    s.addSearchHistory("a"); // 너무 짧음
    expect(useStore.getState().searchHistory).toHaveLength(0);
    s.addSearchHistory("리액트");
    s.addSearchHistory("리액트"); // 중복
    expect(useStore.getState().searchHistory).toEqual(["리액트"]);
    for (let i = 0; i < 10; i++) useStore.getState().addSearchHistory(`q${i}`);
    expect(useStore.getState().searchHistory.length).toBe(8);
  });

  it("clearError", () => {
    useStore.setState({ error: "boom" });
    useStore.getState().clearError();
    expect(useStore.getState().error).toBeNull();
  });
});

describe("비동기 데이터 액션", () => {
  it("loadTree는 트리를 채운다", async () => {
    m.listTree.mockResolvedValue([file("a.md", "a.md")]);
    await useStore.getState().loadTree();
    expect(useStore.getState().tree).toHaveLength(1);
  });

  it("selectNote는 내용·최근·백링크를 설정한다", async () => {
    m.readNote.mockResolvedValue("본문");
    m.backlinks.mockResolvedValue(["other.md"]);
    await useStore.getState().selectNote("a.md");
    const st = useStore.getState();
    expect(st.content).toBe("본문");
    expect(st.selectedPath).toBe("a.md");
    expect(st.recent[0]).toBe("a.md");
    expect(st.backlinks).toEqual(["other.md"]);
  });

  it("selectNote 실패 시 error를 설정한다", async () => {
    m.readNote.mockRejectedValue("읽기실패");
    await useStore.getState().selectNote("a.md");
    expect(useStore.getState().error).toContain("읽기실패");
  });

  it("openByName은 일치 노트를 열거나 에러를 낸다", async () => {
    useStore.setState({ tree: [file("메모.md", "폴더/메모.md")] });
    await useStore.getState().openByName("메모");
    expect(useStore.getState().selectedPath).toBe("폴더/메모.md");
    await useStore.getState().openByName("없는것");
    expect(useStore.getState().error).toContain("없는것");
  });

  it("setSearchQuery: 빈 값은 결과를 비우고, 값이 있으면 검색한다", async () => {
    await useStore.getState().setSearchQuery("");
    expect(useStore.getState().searchResults).toEqual([]);
    m.searchNotes.mockResolvedValue([{ path: "a.md", line: 1, snippet: "s" }]);
    await useStore.getState().setSearchQuery("쿼리");
    expect(useStore.getState().searchResults).toHaveLength(1);
  });

  it("saveLocal은 dirty일 때만 저장한다", async () => {
    useStore.setState({ selectedPath: "a.md", content: "c", dirty: false });
    await useStore.getState().saveLocal();
    expect(m.writeNote).not.toHaveBeenCalled();
    useStore.setState({ dirty: true });
    await useStore.getState().saveLocal();
    expect(m.writeNote).toHaveBeenCalledWith("a.md", "c");
    expect(useStore.getState().dirty).toBe(false);
  });

  it("pushChanges는 repo가 없으면 아무 것도 하지 않는다", async () => {
    useStore.setState({ config: null });
    await useStore.getState().pushChanges("m");
    expect(m.syncPush).not.toHaveBeenCalled();
  });

  it("pushChanges는 결과 종류에 따라 상태를 바꾼다", async () => {
    useStore.setState({ config: repoConfig });
    m.syncPush.mockResolvedValue({ kind: "Conflicts", detail: ["a.md"] });
    await useStore.getState().pushChanges("m");
    expect(useStore.getState().syncStatus).toBe("conflict");
    expect(useStore.getState().conflicts).toEqual(["a.md"]);

    m.syncPush.mockResolvedValue({ kind: "Offline" });
    await useStore.getState().pushChanges("m");
    expect(useStore.getState().syncStatus).toBe("offline");

    m.syncPush.mockResolvedValue({ kind: "NoRepo" });
    await useStore.getState().pushChanges("m");
    expect(useStore.getState().syncStatus).toBe("norepo");
  });

  it("save는 로컬 저장 후 push한다", async () => {
    useStore.setState({ selectedPath: "a.md", content: "c", dirty: true, config: repoConfig });
    await useStore.getState().save();
    expect(m.writeNote).toHaveBeenCalled();
    expect(m.syncPush).toHaveBeenCalled();
  });

  it("createNote는 프론트매터 템플릿으로 생성 후 선택한다", async () => {
    useStore.setState({ config: repoConfig });
    await useStore.getState().createNote("새글");
    const [rel, body] = m.writeNote.mock.calls[0];
    expect(rel).toBe("새글.md");
    expect(body).toContain("created:");
    expect(body).toContain("# 새글");
  });

  it("createFolder", async () => {
    useStore.setState({ config: repoConfig });
    await useStore.getState().createFolder("프로젝트");
    expect(m.createFolder).toHaveBeenCalledWith("프로젝트");
  });

  it("renameNote는 이동 후 선택 노트를 갱신한다", async () => {
    useStore.setState({ selectedPath: "a.md", config: repoConfig });
    m.renameNote.mockResolvedValue(undefined);
    await useStore.getState().renameNote("a.md", "b");
    expect(m.renameNote).toHaveBeenCalledWith("a.md", "b.md");
    expect(useStore.getState().selectedPath).toBe("b.md");
  });

  it("duplicateNote는 -copy 이름으로 복제한다", async () => {
    useStore.setState({ tree: [file("a.md", "a.md")], config: repoConfig });
    m.readNote.mockResolvedValue("원본");
    await useStore.getState().duplicateNote("a.md");
    expect(m.writeNote).toHaveBeenCalledWith("a-copy.md", "원본");
  });

  it("deleteNote는 선택 노트를 지우면 선택 해제한다", async () => {
    useStore.setState({ selectedPath: "a.md", config: repoConfig });
    m.deleteNote.mockResolvedValue(undefined);
    await useStore.getState().deleteNote("a.md");
    expect(m.deleteNote).toHaveBeenCalledWith("a.md");
    expect(useStore.getState().selectedPath).toBeNull();
  });

  it("openDailyNote: 없으면 생성, 있으면 그냥 연다", async () => {
    useStore.setState({ tree: [], config: repoConfig });
    await useStore.getState().openDailyNote();
    expect(m.writeNote).toHaveBeenCalled();
    const created = m.writeNote.mock.calls[0][0] as string;
    expect(created).toMatch(/^daily\/\d{4}-\d{2}-\d{2}\.md$/);

    m.writeNote.mockClear();
    useStore.setState({ tree: [file("x.md", created)] });
    await useStore.getState().openDailyNote();
    expect(m.writeNote).not.toHaveBeenCalled();
    expect(useStore.getState().selectedPath).toBe(created);
  });

  it("gotoAdjacentNote는 순환 이동한다", async () => {
    useStore.setState({
      tree: [file("a.md", "a.md"), file("b.md", "b.md")],
      selectedPath: "a.md",
    });
    await useStore.getState().gotoAdjacentNote(1);
    expect(useStore.getState().selectedPath).toBe("b.md");
    await useStore.getState().gotoAdjacentNote(1); // 끝에서 처음으로
    expect(useStore.getState().selectedPath).toBe("a.md");
    await useStore.getState().gotoAdjacentNote(-1);
    expect(useStore.getState().selectedPath).toBe("b.md");
  });

  it("gotoAdjacentNote는 파일이 없으면 아무 것도 안 한다", async () => {
    useStore.setState({ tree: [], selectedPath: null });
    await useStore.getState().gotoAdjacentNote(1);
    expect(useStore.getState().selectedPath).toBeNull();
  });

  it("saveWithMessage는 지정 메시지로 push한다", async () => {
    useStore.setState({ selectedPath: "a.md", content: "c", dirty: true, config: repoConfig });
    await useStore.getState().saveWithMessage("내 메시지");
    expect(m.syncPush).toHaveBeenCalledWith("내 메시지");
  });

  it("syncNow는 pull 후 트리를 갱신한다", async () => {
    useStore.setState({ config: repoConfig });
    await useStore.getState().syncNow();
    expect(m.syncPull).toHaveBeenCalled();
    expect(m.listTree).toHaveBeenCalled();
    expect(useStore.getState().syncStatus).toBe("synced");
  });

  it("refreshAuth는 로그인/설정을 반영한다", async () => {
    m.githubLoggedIn.mockResolvedValue(true);
    await useStore.getState().refreshAuth();
    expect(useStore.getState().loggedIn).toBe(true);
  });

  it("logout", async () => {
    m.githubLogout.mockResolvedValue(undefined);
    useStore.setState({ loggedIn: true });
    await useStore.getState().logout();
    expect(useStore.getState().loggedIn).toBe(false);
  });

  it("connectRepo는 설정을 저장하고 동기화한다", async () => {
    m.connectRepo.mockResolvedValue(repoConfig);
    await useStore.getState().connectRepo("url", "main");
    expect(m.connectRepo).toHaveBeenCalledWith("url", "main");
    expect(useStore.getState().config?.repo_url).toBe(repoConfig.repo_url);
  });

  it("init은 보관함 준비 후 트리/인증/동기화를 수행한다", async () => {
    m.ensureVault.mockResolvedValue(repoConfig);
    await useStore.getState().init();
    expect(m.ensureVault).toHaveBeenCalled();
    expect(m.listTree).toHaveBeenCalled();
    expect(m.syncPull).toHaveBeenCalled(); // repo_url 있으므로
    expect(useStore.getState().loading).toBe(false);
  });

  it("init 실패 시 error를 설정한다", async () => {
    m.ensureVault.mockRejectedValue("init실패");
    await useStore.getState().init();
    expect(useStore.getState().error).toContain("init실패");
  });
});

describe("에러/경계 경로", () => {
  it("selectNote 백링크 실패는 무시하고 backlinks를 비운다", async () => {
    m.readNote.mockResolvedValue("본문");
    m.backlinks.mockRejectedValue("bl실패");
    await useStore.getState().selectNote("a.md");
    expect(useStore.getState().backlinks).toEqual([]);
    expect(useStore.getState().selectedPath).toBe("a.md");
  });

  it("saveLocal 실패 시 error", async () => {
    useStore.setState({ selectedPath: "a.md", content: "c", dirty: true });
    m.writeNote.mockRejectedValue("쓰기실패");
    await useStore.getState().saveLocal();
    expect(useStore.getState().error).toContain("쓰기실패");
  });

  it("save는 선택 노트가 없으면 즉시 반환한다", async () => {
    useStore.setState({ selectedPath: null });
    await useStore.getState().save();
    expect(m.writeNote).not.toHaveBeenCalled();
  });

  it("saveWithMessage는 선택 노트가 없으면 반환한다", async () => {
    useStore.setState({ selectedPath: null });
    await useStore.getState().saveWithMessage("m");
    expect(m.syncPush).not.toHaveBeenCalled();
  });

  it("saveWithMessage는 빈 메시지면 기본 메시지를 쓴다", async () => {
    useStore.setState({ selectedPath: "a.md", dirty: true, config: repoConfig });
    await useStore.getState().saveWithMessage("");
    expect(m.syncPush).toHaveBeenCalledWith("update a.md");
  });

  it("pushChanges 실패 시 error/상태", async () => {
    useStore.setState({ config: repoConfig });
    m.syncPush.mockRejectedValue("push실패");
    await useStore.getState().pushChanges("m");
    expect(useStore.getState().syncStatus).toBe("error");
    expect(useStore.getState().error).toContain("push실패");
  });

  it("pushChanges UpToDate/Pushed/Pulled는 synced", async () => {
    useStore.setState({ config: repoConfig });
    m.syncPush.mockResolvedValue({ kind: "UpToDate" });
    await useStore.getState().pushChanges("m");
    expect(useStore.getState().syncStatus).toBe("synced");
  });

  it("createNote 실패 시 error", async () => {
    m.writeNote.mockRejectedValue("생성실패");
    await useStore.getState().createNote("x");
    expect(useStore.getState().error).toContain("생성실패");
  });

  it("createFolder 실패 시 error", async () => {
    m.createFolder.mockRejectedValue("폴더실패");
    await useStore.getState().createFolder("f");
    expect(useStore.getState().error).toContain("폴더실패");
  });

  it("renameNote 실패 시 error", async () => {
    m.renameNote.mockRejectedValue("이름실패");
    await useStore.getState().renameNote("a.md", "b");
    expect(useStore.getState().error).toContain("이름실패");
  });

  it("renameNote는 선택 노트가 아니면 재선택하지 않는다", async () => {
    useStore.setState({ selectedPath: "other.md", config: repoConfig });
    m.renameNote.mockResolvedValue(undefined);
    await useStore.getState().renameNote("a.md", "b");
    expect(useStore.getState().selectedPath).toBe("other.md");
  });

  it("duplicateNote는 이름 충돌 시 -copy-N을 쓴다", async () => {
    useStore.setState({
      tree: [file("a.md", "a.md"), file("a-copy.md", "a-copy.md")],
      config: repoConfig,
    });
    m.readNote.mockResolvedValue("원본");
    await useStore.getState().duplicateNote("a.md");
    expect(m.writeNote).toHaveBeenCalledWith("a-copy-1.md", "원본");
  });

  it("duplicateNote 실패 시 error", async () => {
    m.readNote.mockRejectedValue("복제실패");
    await useStore.getState().duplicateNote("a.md");
    expect(useStore.getState().error).toContain("복제실패");
  });

  it("deleteNote 실패 시 error", async () => {
    m.deleteNote.mockRejectedValue("삭제실패");
    await useStore.getState().deleteNote("a.md");
    expect(useStore.getState().error).toContain("삭제실패");
  });

  it("deleteNote는 다른 노트를 지우면 선택을 유지한다", async () => {
    useStore.setState({ selectedPath: "keep.md", config: repoConfig });
    m.deleteNote.mockResolvedValue(undefined);
    await useStore.getState().deleteNote("a.md");
    expect(useStore.getState().selectedPath).toBe("keep.md");
  });

  it("setSearchQuery 실패 시 error", async () => {
    m.searchNotes.mockRejectedValue("검색실패");
    await useStore.getState().setSearchQuery("q");
    expect(useStore.getState().error).toContain("검색실패");
  });

  it("syncNow 실패 시 error", async () => {
    useStore.setState({ config: repoConfig });
    m.syncPull.mockRejectedValue("pull실패");
    await useStore.getState().syncNow();
    expect(useStore.getState().syncStatus).toBe("error");
  });

  it("syncNow는 선택 노트가 dirty가 아니면 재읽기한다", async () => {
    useStore.setState({ config: repoConfig, selectedPath: "a.md", dirty: false });
    m.syncPull.mockResolvedValue({ kind: "Pulled" });
    m.readNote.mockResolvedValue("갱신됨");
    await useStore.getState().syncNow();
    expect(useStore.getState().content).toBe("갱신됨");
  });

  it("refreshAuth 실패 시 error", async () => {
    m.githubLoggedIn.mockRejectedValue("auth실패");
    await useStore.getState().refreshAuth();
    expect(useStore.getState().error).toContain("auth실패");
  });

  it("connectRepo 실패 시 error/상태", async () => {
    m.connectRepo.mockRejectedValue("연결실패");
    await useStore.getState().connectRepo("u", "main");
    expect(useStore.getState().syncStatus).toBe("error");
  });

  it("init은 repo_url이 없으면 동기화하지 않는다", async () => {
    m.ensureVault.mockResolvedValue({ ...repoConfig, repo_url: null });
    await useStore.getState().init();
    expect(m.syncPull).not.toHaveBeenCalled();
  });

  it("gotoAdjacentNote는 선택이 없으면 첫 노트로 간다", async () => {
    useStore.setState({
      tree: [file("a.md", "a.md"), file("b.md", "b.md")],
      selectedPath: null,
    });
    await useStore.getState().gotoAdjacentNote(1);
    expect(useStore.getState().selectedPath).toBe("a.md");
  });

  it("createNote는 이미 .md면 확장자를 덧붙이지 않는다", async () => {
    useStore.setState({ config: repoConfig });
    await useStore.getState().createNote("이미.md");
    expect(m.writeNote.mock.calls[0][0]).toBe("이미.md");
  });

  it("duplicateNote는 확장자 없는 경로도 복제한다", async () => {
    useStore.setState({ tree: [file("noext", "noext")], config: repoConfig });
    m.readNote.mockResolvedValue("본문");
    await useStore.getState().duplicateNote("noext");
    expect(m.writeNote).toHaveBeenCalledWith("noext-copy.md", "본문");
  });

  it("openByName은 정확히 일치하는 경로를 연다", async () => {
    useStore.setState({ tree: [file("메모.md", "메모.md")] });
    await useStore.getState().openByName("메모.md");
    expect(useStore.getState().selectedPath).toBe("메모.md");
  });
});
