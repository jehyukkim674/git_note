export type ThemeId =
  | "light"
  | "dark"
  | "sepia"
  | "nord"
  | "solarized"
  | "dracula"
  | "rose-pine"
  | "forest"
  | "high-contrast";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  /// 다크 계열 여부(아이콘·그림자 판단용).
  dark: boolean;
  /// 설정 화면 미리보기용 대표 배경색.
  bg: string;
  /// 설정 화면 미리보기용 대표 강조색.
  swatch: string;
}

export const THEMES: ThemeMeta[] = [
  { id: "light", label: "라이트", dark: false, bg: "#ffffff", swatch: "#2563eb" },
  { id: "dark", label: "다크", dark: true, bg: "#1a1b1e", swatch: "#3b82f6" },
  { id: "sepia", label: "세피아", dark: false, bg: "#f4ecd8", swatch: "#9c5a2e" },
  { id: "nord", label: "노르드", dark: true, bg: "#2e3440", swatch: "#88c0d0" },
  { id: "solarized", label: "솔라라이즈드", dark: true, bg: "#002b36", swatch: "#268bd2" },
  { id: "dracula", label: "드라큘라", dark: true, bg: "#282a36", swatch: "#bd93f9" },
  { id: "rose-pine", label: "로즈 파인", dark: true, bg: "#191724", swatch: "#c4a7e7" },
  { id: "forest", label: "포레스트", dark: false, bg: "#f3f7f0", swatch: "#3f7d3f" },
  { id: "high-contrast", label: "고대비", dark: true, bg: "#000000", swatch: "#ffd400" },
];

export const THEME_IDS: ThemeId[] = THEMES.map((t) => t.id);

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as string[]).includes(v);
}

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/// 목록상 다음 테마로 순환한다.
export function nextTheme(id: ThemeId): ThemeId {
  const i = THEME_IDS.indexOf(id);
  return THEME_IDS[(i + 1) % THEME_IDS.length];
}
