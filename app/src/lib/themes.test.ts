import { describe, it, expect } from "vitest";
import {
  THEMES,
  THEME_IDS,
  isThemeId,
  themeMeta,
  nextTheme,
} from "./themes";

describe("themes", () => {
  it("THEME_IDS는 THEMES의 id 목록과 일치한다", () => {
    expect(THEME_IDS).toEqual(THEMES.map((t) => t.id));
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(9);
  });

  it("isThemeId는 유효한 id만 통과시킨다", () => {
    expect(isThemeId("dark")).toBe(true);
    expect(isThemeId("nord")).toBe(true);
    expect(isThemeId("없는테마")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(42)).toBe(false);
  });

  it("themeMeta는 메타를 반환하고, 모르면 첫 테마로 폴백한다", () => {
    expect(themeMeta("sepia").label).toBe("세피아");
    // @ts-expect-error 잘못된 id 폴백 확인
    expect(themeMeta("???")).toBe(THEMES[0]);
  });

  it("nextTheme은 순환한다", () => {
    expect(nextTheme(THEME_IDS[0])).toBe(THEME_IDS[1]);
    expect(nextTheme(THEME_IDS[THEME_IDS.length - 1])).toBe(THEME_IDS[0]);
  });

  it("모든 테마는 고유 id와 라벨, 색상 필드를 가진다", () => {
    const ids = new Set(THEMES.map((t) => t.id));
    expect(ids.size).toBe(THEMES.length);
    for (const t of THEMES) {
      expect(t.label).toBeTruthy();
      expect(t.bg).toMatch(/^#/);
      expect(t.swatch).toMatch(/^#/);
      expect(typeof t.dark).toBe("boolean");
    }
  });
});
