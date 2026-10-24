// What the browser tells the app: the modifier key's name, the theme saved in this browser, and the
// system's colour scheme.

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

export type Scheme = "dark" | "light";

const DARK = "(prefers-color-scheme: dark)";

export const systemScheme = (): Scheme => (matchMedia(DARK).matches ? "dark" : "light");

// Calls `changed` with the system's scheme each time it changes; returns the clean-up.
export function onSystemScheme(changed: (scheme: Scheme) => void): () => void {
  const query = matchMedia(DARK);
  const listener = () => changed(query.matches ? "dark" : "light");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

// The scheme the page shows, on <html data-theme>: the chosen one, or the system's now. Always one
// scheme, never the stylesheet's "dark light": Safari doesn't redraw light-dark() colours when the
// system changes under it (WebKit bug 262974; the macOS test, 2026-10-24), so "system" is followed
// with onSystemScheme and this called again.
export function showTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme === "system" ? systemScheme() : theme;
}

export function applyTheme(theme: Theme): void {
  showTheme(theme);
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not saved: the theme still applies until the page closes.
  }
}
