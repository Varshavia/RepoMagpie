// What the browser tells the app: the modifier key's name, and the theme saved in this browser.

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const MOD = IS_MAC ? "⌘" : "Ctrl";

export type Theme = "system" | "dark" | "light";

const THEME_KEY = "magpie-theme";

// A per-browser convenience; storage can be missing or blocked, and the app works without it.
export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not saved: the theme still applies until the page closes.
  }
}
