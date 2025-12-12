"use client";

import { isThemeId, themes } from "@/theme/theme";
import { useTheme } from "@/theme/ThemeProvider";

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <label className="themePicker">
      <span className="ui-muted themePicker__label">
        Theme
      </span>
      <select
        className="ui-input"
        style={{ width: 160 }}
        value={theme}
        onChange={(e) => {
          const next = e.target.value;
          if (isThemeId(next)) setTheme(next);
        }}
        aria-label="Theme"
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
