// magpie search across journals (spec §2, §3, §5): filters, ranking and the result shape.
// Pure over the loaded indexes; never prints.
import { join } from "node:path";
import type { JournalIndex, SearchDoc } from "./search-index.ts";

export interface JournalSource {
  scope: "personal" | "project";
  path: string;
  index: JournalIndex;
}

export interface SearchFilters {
  limit: number;
  tags?: string[]; // every tag must be present
  kind?: string;
}

// One result, in the shape of `magpie search --json`.
export interface SearchResult {
  id: string | null;
  journal: JournalSource["scope"];
  type: "note" | "skill";
  skill: string | null;
  name: string;
  verdict: string | null; // a skill result's own text; null for a note without a Verdict
  status: "inbox" | "reviewed"; // the note's status
  score: number;
  path: string;
}

export function searchJournals(sources: JournalSource[], query: string, filters: SearchFilters): SearchResult[] {
  const keep = (doc: SearchDoc) => (!filters.kind || doc.kind === filters.kind) && (filters.tags ?? []).every((tag) => doc.tags.includes(tag));
  const hits: { result: SearchResult; group: number }[] = [];
  for (const source of sources) {
    for (const hit of source.index.search(query, { filter: (r) => keep(r as unknown as SearchDoc) })) {
      const doc = hit as unknown as SearchDoc & { score: number };
      hits.push({
        // Reviewed notes and completed skill lines (human-written) before inbox notes.
        group: doc.type === "skill" || doc.status === "reviewed" ? 0 : 1,
        result: {
          id: doc.purl,
          journal: source.scope,
          type: doc.type,
          skill: doc.skill,
          name: doc.name,
          verdict: (doc.type === "skill" ? doc.skillText : doc.verdict) || null,
          status: doc.status,
          score: Math.round(doc.score * 100) / 100,
          path: join(source.path, "notes", doc.file),
        },
      });
    }
  }
  hits.sort((a, b) => a.group - b.group || b.result.score - a.result.score);

  // The same subject in both journals: the project's result directly before the personal one.
  const subject = (r: SearchResult) => (r.id ? `${r.id}#${r.skill ?? ""}` : null);
  const placed = new Set<SearchResult>();
  const ordered: SearchResult[] = [];
  for (const { result } of hits) {
    if (placed.has(result)) continue;
    const key = subject(result);
    const partner = key ? hits.find(({ result: other }) => !placed.has(other) && other.journal !== result.journal && subject(other) === key)?.result : undefined;
    const pair = !partner ? [result] : result.journal === "project" ? [result, partner] : [partner, result];
    for (const r of pair) {
      placed.add(r);
      ordered.push(r);
    }
  }
  return ordered.slice(0, filters.limit);
}
