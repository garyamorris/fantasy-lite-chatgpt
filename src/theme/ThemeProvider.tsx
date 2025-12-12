"use client";

import type { ReactNode } from "react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME, isThemeId, THEME_COOKIE_NAME, type ThemeId } from "@/theme/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function writeThemeCookie(theme: ThemeId) {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(theme)}; Path=/; Max-Age=31536000; SameSite=Lax${
    secure ? "; Secure" : ""
  }`;
}

function applyThemeToDom(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme?: ThemeId;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme ?? DEFAULT_THEME);

  const applyAndPersist = useCallback((next: ThemeId) => {
    applyThemeToDom(next);
    window.localStorage.setItem(THEME_COOKIE_NAME, next);
    writeThemeCookie(next);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_COOKIE_NAME);
    const next = isThemeId(stored) ? stored : theme;
    applyAndPersist(next);
    if (next !== theme) setThemeState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback(
    (next: ThemeId) => {
      applyAndPersist(next);
      setThemeState(next);
    },
    [applyAndPersist],
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}
