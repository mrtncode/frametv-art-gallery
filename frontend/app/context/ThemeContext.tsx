import React, { createContext, useContext, useEffect, useState } from "react";
import {
  THEMES,
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  getStoredTheme,
  setStoredTheme,
  applyTheme,
  type ThemeOption,
} from "~/lib/theme";

interface UIThemeContextValue {
  theme: string;
  setTheme: (id: string) => void;
  themes: readonly ThemeOption[];
  currentThemeOption: ThemeOption;
}

const defaultOption = THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? THEMES[0];

const UIThemeContext = createContext<UIThemeContextValue>({
  theme: DEFAULT_THEME_ID,
  setTheme: () => {},
  themes: THEMES,
  currentThemeOption: defaultOption,
});

const THEME_META_COLORS: Record<string, { light: string; dark: string }> = {
  clean: { light: "#FFFFFF", dark: "#0A0A0A" },
  orange: { light: "#FAF8F4", dark: "#1E211F" },
};

function updateThemeColorMeta(themeId: string) {
  if (typeof document === "undefined") return;
  const colors = THEME_META_COLORS[themeId] ?? THEME_META_COLORS.clean;
  const lightMeta = document.querySelector('meta[name="theme-color"][media*="light"]');
  if (lightMeta) lightMeta.setAttribute("content", colors.light);
  const darkMeta = document.querySelector('meta[name="theme-color"][media*="dark"]');
  if (darkMeta) darkMeta.setAttribute("content", colors.dark);
}

export function UIThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<string>(DEFAULT_THEME_ID);

  useEffect(() => {
    const initial = getStoredTheme();
    setThemeState(initial);
    applyTheme(initial);
    updateThemeColorMeta(initial);

    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        setThemeState(e.newValue);
        applyTheme(e.newValue);
        updateThemeColorMeta(e.newValue);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = (nextTheme: string) => {
    setThemeState(nextTheme);
    setStoredTheme(nextTheme);
    updateThemeColorMeta(nextTheme);
  };

  const currentThemeOption = THEMES.find((t) => t.id === theme) ?? defaultOption;

  return (
    <UIThemeContext.Provider value={{ theme, setTheme, themes: THEMES, currentThemeOption }}>
      {children}
    </UIThemeContext.Provider>
  );
}

export function useUITheme() {
  return useContext(UIThemeContext);
}
