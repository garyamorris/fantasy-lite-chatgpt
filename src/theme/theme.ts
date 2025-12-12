export const THEME_COOKIE_NAME = "fl_theme";

export const themes = [
  { id: "nebula", name: "Nebula" },
  { id: "arcade", name: "Arcade" },
] as const;

export type ThemeId = (typeof themes)[number]["id"];

export const DEFAULT_THEME: ThemeId = "nebula";

export function isThemeId(value: string | undefined | null): value is ThemeId {
  return themes.some((t) => t.id === value);
}

