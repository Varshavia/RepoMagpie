// The command palette as you type. Notes and skills come from magpie search; actions match when every
// word appears in the label or the keywords, and actions with a label word that starts with a query
// word come first.

// The last answer of the search endpoint, for the query it answered.
export interface NoteSearch<T> {
  query: string;
  results: T[];
  error?: string;
}

// The notes to show for what is typed now: only the answer for exactly this query, so the palette
// shows what magpie search shows. Pending until that answer arrives; a failed search gives its error.
export function noteResults<T>(typed: string, last: NoteSearch<T> | null): { notes: T[]; pending: boolean; error: string | null } {
  const query = typed.trim();
  if (!query) return { notes: [], pending: false, error: null };
  if (last?.query !== query) return { notes: [], pending: true, error: null };
  return { notes: last.error ? [] : last.results, pending: false, error: last.error ?? null };
}

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
