// Search results in the app (docs/ui.md §7): why a result matched, from its `why` (decision 0041); the
// notes an empty query lists; and what an empty list says, with its one-click fix.
import type { NoteSummary } from "../../../src/core/documents.ts";
import type { SearchResult } from "../../../src/core/search.ts";

// "domain database (suggested) · tag postgresql · words orm, sql"; null when nothing is named.
export function whyLine(result: Pick<SearchResult, "why" | "domains_suggested">): string | null {
  const { domains, tags, words } = result.why;
  const parts = [
    ...domains.map((d) => `domain ${d}${result.domains_suggested.includes(d) ? " (suggested)" : ""}`),
    ...tags.map((t) => `tag ${t}`),
    ...(words.length ? [`${words.length === 1 ? "word" : "words"} ${words.join(", ")}`] : []),
  ];
  return parts.length ? parts.join(" · ") : null;
}

type Scope = SearchResult["journal"];
export interface Filters {
  journal: Scope | "";
  kind: string;
  tag: string;
  domain: string;
}
export type Status = "" | "reviewed" | "inbox";

// With an empty query, the notes the filters keep, as result rows: a Verdict first, then the most
// recently explored, then by name. A note that can't be read has no id to open it by: All notes lists it.
export function browseRows(lists: Partial<Record<Scope, NoteSummary[] | null>>, filters: Filters): SearchResult[] {
  const rows: (SearchResult & { explored: string })[] = [];
  for (const journal of ["personal", "project"] as const) {
    if (filters.journal && filters.journal !== journal) continue;
    for (const n of lists[journal] ?? []) {
      if (n.id === null) continue;
      if (filters.kind && n.kind !== filters.kind) continue;
      if (filters.tag && !n.tags.includes(filters.tag)) continue;
      if (filters.domain && !n.domains.includes(filters.domain) && !n.domains_suggested.includes(filters.domain)) continue;
      rows.push({
        id: n.id, journal, type: "note", skill: null, name: n.name ?? n.id, verdict: n.verdict || null, status: n.status,
        domains: n.domains, domains_suggested: n.domains_suggested, why: { domains: [], tags: [], words: [] }, score: 0, path: "", explored: n.explored ?? "",
      });
    }
  }
  rows.sort((a, b) => Number(a.status === "inbox") - Number(b.status === "inbox") || b.explored.localeCompare(a.explored) || a.name.localeCompare(b.name));
  return rows.map(({ explored: _explored, ...row }) => row);
}

// What an empty list says, and the fix a click makes: show the other status, clear the filters, or
// add notes. `rows` are the matches before the status filter; `filtered`, whether journal, kind,
// domain or tag is set; `unfiltered`, how many match without them (null: not known yet); `total`, the
// notes in the journals searched. Never names a journal that isn't there.
export type EmptyFix = { kind: "status"; status: Status; label: string } | { kind: "clear" } | { kind: "add" } | null;

export function emptyText(o: { query: string; status: Status; rows: Pick<SearchResult, "status">[]; filtered: boolean; unfiltered: number | null; total: number; journals: number }): { text: string; fix: EmptyFix } {
  const q = o.query.trim();
  const notes = (n: number) => `${n} ${n === 1 ? "note" : "notes"}`;
  if (!o.total) {
    return { text: `No notes in ${o.journals > 1 ? "your journals" : "this journal"} yet. Add one from Discover or Import, or ask your agent to note a package.`, fix: { kind: "add" } };
  }
  if (o.status && o.rows.length) {
    const other = o.status === "reviewed" ? "inbox" : "reviewed";
    const n = o.rows.length;
    const some = `${n} ${other} ${n === 1 ? "note" : "notes"}`;
    const text = q ? `No ${o.status} notes match “${q}”. ${some} ${n === 1 ? "does" : "do"}.` : `No ${o.status} notes${o.filtered ? " with these filters" : ""} yet. There ${n === 1 ? "is" : "are"} ${some}.`;
    return { text, fix: { kind: "status", status: other, label: `Show ${other} notes` } };
  }
  if (o.filtered && o.unfiltered) {
    return { text: q ? `No notes match “${q}” with these filters. ${notes(o.unfiltered)} ${o.unfiltered === 1 ? "does" : "do"} without them.` : "No notes have these filters.", fix: { kind: "clear" } };
  }
  return { text: q ? `No notes match “${q}”. Try other words.` : "No notes have these filters.", fix: o.filtered || o.status ? { kind: "clear" } : null };
}
