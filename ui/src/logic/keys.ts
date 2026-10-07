// The keyboard map (docs/ui.md §7). Pure: a key press in, an action out. Single keys act only
// outside text fields; Ctrl/Cmd+K, Ctrl/Cmd+Enter and Esc act everywhere. "g" starts a two-key
// sequence (g i, g s).

export type Action = "palette" | "search" | "next" | "previous" | "open" | "edit" | "save" | "escape" | "go-inbox" | "go-search" | "help";

export interface KeyInput {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  editable: boolean; // focus is in a text field
  mac: boolean; // Cmd is the modifier
}

export type Pending = "g" | null;

const SINGLE: Record<string, Action> = { "/": "search", j: "next", k: "previous", ArrowDown: "next", ArrowUp: "previous", Enter: "open", e: "edit", "?": "help" };
const AFTER_G: Record<string, Action> = { i: "go-inbox", s: "go-search" };

export function keyAction(input: KeyInput, pending: Pending): { action: Action | null; pending: Pending } {
  const mod = input.mac ? input.meta : input.ctrl;
  const none = { action: null, pending: null };
  if (mod && input.key.toLowerCase() === "k") return { action: "palette", pending: null };
  if (mod && input.key === "Enter") return { action: "save", pending: null };
  if (input.key === "Escape") return { action: "escape", pending: null };
  if (input.editable || input.ctrl || input.meta || input.alt) return none;
  if (pending === "g" && AFTER_G[input.key]) return { action: AFTER_G[input.key], pending: null };
  if (input.key === "g") return { action: null, pending: "g" };
  return { action: SINGLE[input.key] ?? null, pending: null };
}

export const KEY_MAP: { keys: string; does: string }[] = [
  { keys: "Ctrl/Cmd+K", does: "Open the command palette" },
  { keys: "/", does: "Search" },
  { keys: "j / k", does: "Next / previous row" },
  { keys: "Enter", does: "Open the selected note" },
  { keys: "e", does: "Edit the Verdict" },
  { keys: "Ctrl+Enter", does: "Save" },
  { keys: "[[", does: "In an editor: link a note (↑ / ↓ choose, Enter or Tab inserts, Esc closes the list)" },
  { keys: "Esc", does: "Close the palette or editor; back to the list" },
  { keys: "g i / g s", does: "Go to Inbox / Search" },
  { keys: "?", does: "Show the keyboard map" },
];
