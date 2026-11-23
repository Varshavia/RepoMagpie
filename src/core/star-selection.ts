// Which stars an import takes (decision 0068), for import --stars and the app's table alike. Pure, no
// imports, so the app's chunk can load it.

export interface StarSelection {
  limit: number | null; // the newest n new stars; null for all
  languages: string[]; // any of them, ignoring case; none for any language
  topics: string[]; // any of them; none for any topic
  since: string | null; // starred on or after this day, YYYY-MM-DD
}

export interface Selectable {
  language: string | null;
  topics: string[];
  starred: string; // YYYY-MM-DD
  in_journal: string[]; // the journals that have a note on it
  in_trash: string[]; // the journals whose trash has its note: skipped too
}

export const DEFAULT_LIMIT = 100;

// The new stars the filters keep, in the list's order (newest star first), and the first `limit` of
// them. --language and --topic each match any of their values; given both, a star needs both. A star
// whose note is in a journal's trash isn't new: the user deleted it.
export function selectStars<S extends Selectable>(stars: S[], selection: StarSelection): { matching: S[]; selected: S[] } {
  const languages = selection.languages.map((l) => l.trim().toLowerCase());
  const topics = selection.topics.map((t) => t.trim().toLowerCase());
  const matching = stars.filter((s) =>
    !s.in_journal.length && !s.in_trash.length &&
    (!languages.length || (s.language !== null && languages.includes(s.language.toLowerCase()))) &&
    (!topics.length || s.topics.some((t) => topics.includes(t.toLowerCase()))) &&
    (selection.since === null || s.starred >= selection.since));
  return { matching, selected: selection.limit === null ? matching : matching.slice(0, selection.limit) };
}

export interface Count {
  name: string;
  count: number;
}

// The most common values, most first, then by name; at most `top`. Values that differ only in case
// count as one, written as first seen.
export function counts(values: string[], top = 10): Count[] {
  const by = new Map<string, Count>();
  for (const value of values) {
    const key = value.toLowerCase();
    const seen = by.get(key);
    if (seen) seen.count++;
    else by.set(key, { name: value, count: 1 });
  }
  return [...by.values()].sort((a, b) => b.count - a.count || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1)).slice(0, top);
}
