import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./lib/api", () => ({ api: {} }));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("스토어 초기화(localStorage/시스템 설정)", () => {
  it("저장된 테마가 없으면 vscode로 시작한다", async () => {
    const { useStore } = await import("./store");
    expect(useStore.getState().theme).toBe("vscode");
  });

  it("저장된 설정(테마/폰트/플래그/간격/정렬)을 불러온다", async () => {
    localStorage.setItem("theme", "sepia");
    localStorage.setItem("fontSize", "lg");
    localStorage.setItem("autoSave", "false");
    localStorage.setItem("autoSync", "false");
    localStorage.setItem("autoSyncSec", "45");
    localStorage.setItem("confirmDelete", "false");
    localStorage.setItem("spellcheck", "true");
    localStorage.setItem("sortDir", "desc");
    localStorage.setItem("recent", JSON.stringify(["a.md"]));
    const { useStore } = await import("./store");
    const s = useStore.getState();
    expect(s.theme).toBe("sepia");
    expect(s.fontSize).toBe("lg");
    expect(s.autoSave).toBe(false);
    expect(s.autoSync).toBe(false);
    expect(s.autoSyncSec).toBe(45);
    expect(s.confirmDelete).toBe(false);
    expect(s.spellcheck).toBe(true);
    expect(s.sortDir).toBe("desc");
    expect(s.recent).toEqual(["a.md"]);
  });

  it("잘못된 테마 저장값은 vscode로 폴백한다", async () => {
    localStorage.setItem("theme", "없는테마");
    const { useStore } = await import("./store");
    expect(useStore.getState().theme).toBe("vscode");
  });

  it("잘못된 저장값은 기본값으로 폴백한다", async () => {
    localStorage.setItem("fontSize", "huge");
    localStorage.setItem("autoSyncSec", "-5");
    localStorage.setItem("recent", "{잘못된json");
    const { useStore } = await import("./store");
    const s = useStore.getState();
    expect(s.fontSize).toBe("md");
    expect(s.autoSyncSec).toBe(10);
    expect(s.recent).toEqual([]);
  });
});
