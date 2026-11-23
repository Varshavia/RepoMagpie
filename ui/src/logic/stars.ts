// "Import my GitHub stars" on the Import page (decision 0068): the table's filters, its default checks
// and its summary line. The selection rules are import --stars' own (src/core/star-selection.ts).
import type { StarsJson } from "../../../src/core/stars.ts";
import { DEFAULT_LIMIT, selectStars } from "../../../src/core/star-selection.ts";

export type StarRow = NonNullable<StarsJson["stars"]>[number];

export interface StarFilters {
  language: string; // "" for any
  topic: string; // "" for any
  since: string; // YYYY-MM-DD, or "" for any time
}

export const NO_FILTERS: StarFilters = { language: "", topic: "", since: "" };
export const PAGE_ROWS = 100;

const selection = (f: StarFilters, limit: number | null) => ({
  limit,
  languages: f.language ? [f.language] : [],
  topics: f.topic.trim() ? [f.topic.trim()] : [],
  since: /^\d{4}-\d{2}-\d{2}$/.test(f.since) ? f.since : null,
});

// The rows the filters keep, those already in a journal or its trash included (they show it, unchecked).
export function shownStars(stars: StarRow[], f: StarFilters): StarRow[] {
  return selectStars(stars.map((s) => ({ ...s, in_journal: [] as string[], in_trash: [] as string[], row: s })), selection(f, null)).matching.map((s) => s.row);
}

// Whether a row can't be imported: a journal has its note, or a journal's trash.
export const skipped = (s: StarRow) => s.in_journal.length > 0 || s.in_trash.length > 0;

// What starts checked: the 100 most recently starred new ones the filters keep, as the command does.
export function defaultChecked(stars: StarRow[], f: StarFilters): Set<string> {
  return new Set(selectStars(stars, selection(f, DEFAULT_LIMIT)).selected.map((s) => s.name));
}

// "2,431 stars: 2,309 new, 120 already in your journal, 2 skipped because they're in the trash."
export function starsSummary(doc: Pick<StarsJson, "total" | "new" | "in_journal" | "in_trash" | "complete">): string {
  const n = (count: number) => count.toLocaleString("en-US");
  const trash = doc.in_trash ? `, ${n(doc.in_trash)} skipped because they're in the trash` : "";
  return `${n(doc.total)} ${doc.total === 1 ? "star" : "stars"}${doc.complete ? "" : " read (not all)"}: ${n(doc.new)} new, ${n(doc.in_journal)} already in your journal${trash}.`;
}

// Every language in the list, most common first: the language filter's choices.
export function languagesOf(stars: StarRow[]): string[] {
  const by = new Map<string, number>();
  for (const s of stars) if (s.language) by.set(s.language, (by.get(s.language) ?? 0) + 1);
  return [...by].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([name]) => name);
}
