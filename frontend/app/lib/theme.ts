/**
 * Theme configuration and preferences for Frame Gallery.
 *
 * Adding a new theme in the future is easy:
 * 1. Add a new entry to the `THEMES` array below (id, name, description, colors).
 * 2. Define the corresponding CSS variables in `app/app.css`:
 *      :root[data-ui-theme="your-id"] { ...light mode tokens... }
 *      :root[data-ui-theme="your-id"].dark { ...dark mode tokens... }
 *
 * The theme is persisted in localStorage and applied to `<html data-ui-theme="...">`.
 */

export interface ThemeOption {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  accentColor?: string;
  isDefault?: boolean;
}

export const THEMES: readonly ThemeOption[] = [
  {
    id: "clean",
    name: "Clean Blue",
    description: "Crisp blue accents with modern neutral surfaces",
    primaryColor: "#2563EB",
    accentColor: "#3B82F6",
    isDefault: true,
  },
  {
    id: "orange",
    name: "Warm Terracotta",
    description: "Earthy terracotta and ochre accents with warm gallery neutrals",
    primaryColor: "#A64E3D",
    accentColor: "#D69D41",
  },
] as const;

export type ThemeId = string;

export const DEFAULT_THEME_ID: ThemeId = "clean";
export const THEME_STORAGE_KEY = "framegallery_theme";

/**
 * Gets the stored theme preference from localStorage.
 * Falls back to DEFAULT_THEME_ID ("clean").
 */
export function getStoredTheme(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) {
      return stored;
    }
  } catch {
    // localStorage may be disabled or restricted
  }
  return DEFAULT_THEME_ID;
}

/**
 * Applies the theme by setting data-ui-theme on document.documentElement.
 */
export function applyTheme(themeId: string) {
  if (typeof document === "undefined") return;
  const validTheme = THEMES.some((t) => t.id === themeId) ? themeId : DEFAULT_THEME_ID;
  document.documentElement.setAttribute("data-ui-theme", validTheme);
}

/**
 * Persists the theme preference in localStorage and applies it to the DOM.
 */
export function setStoredTheme(themeId: string) {
  const validTheme = THEMES.some((t) => t.id === themeId) ? themeId : DEFAULT_THEME_ID;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, validTheme);
  } catch {
    // Remembering is a convenience only
  }
  applyTheme(validTheme);
}
