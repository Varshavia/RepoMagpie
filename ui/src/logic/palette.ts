// Matching the command palette's actions as you type: every word must appear in the label or the
// keywords. Actions with a label word that starts with a query word come first.

export interface PaletteAction {
  id: string;
  label: string;
  keywords?: string;
}

export function rankActions<T extends PaletteAction>(actions: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return actions;
  const matching = actions.filter((a) => {
    const text = `${a.label} ${a.keywords ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const startsWord = (a: T) => a.label.toLowerCase().split(/\s+/).some((lw) => words.some((w) => lw.startsWith(w)));
  return [...matching.filter(startsWord), ...matching.filter((a) => !startsWord(a))];
}
