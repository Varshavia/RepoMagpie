// magpie search across journals (spec §2, §3, §5): filters, ranking and the result shape.
// searchJournals is pure over the loaded indexes; runSearch opens them. Never prints.
import { join } from "node:path";
import { findProjectJournal, homeJournal, resolvePersonalJournal, samePath, type Place } from "./journals.ts";
import type { Outcome } from "./outcome.ts";
import { loadIndex, type JournalIndex, type SearchDoc } from "./search-index.ts";

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

export interface SearchRequest {
  query: string;
  tags?: string[];
  kind?: string;
  journal?: JournalSource["scope"]; // one journal only
  limit: number;
}

export interface SearchRun {
  outcome: Outcome;
  document: { query: string; results: SearchResult[]; error?: string }; // the --json document (spec §2)
  total: number; // results before the limit
  warnings: string[];
}

// magpie search: both journals (or one), the project journal never being the personal journal's
// folder nor the home directory's own .magpie (spec §3).
export function runSearch(request: SearchRequest, place: Place): SearchRun {
  const { query } = request;
  if (!query.trim()) {
    return { outcome: "usage", document: { query, results: [], error: "Give a search query, for example: magpie search pdf" }, total: 0, warnings: [] };
  }
  const personal = resolvePersonalJournal({ home: place.home, env: place.env, cwd: place.cwd, flag: place.homeFlag });
  const project = findProjectJournal({ cwd: place.cwd, home: place.home, personalJournal: personal.path, flag: place.projectFlag });
  const sources: JournalSource[] = [];
  if (request.journal !== "project") sources.push({ scope: "personal", path: personal.path, index: loadIndex(personal.path).index });
  if (request.journal !== "personal" && project && !samePath(project, personal.path) && !samePath(project, homeJournal(place.home))) {
    sources.push({ scope: "project", path: project, index: loadIndex(project).index });
  }
  const all = searchJournals(sources, query, { limit: Infinity, tags: request.tags, kind: request.kind });
  return { outcome: "ok", document: { query, results: all.slice(0, request.limit) }, total: all.length, warnings: personal.warnings };
}
