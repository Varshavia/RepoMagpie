// magpie search across journals (spec §2, §3, §5): filters, ranking and the result shape.
// searchJournals is pure over the loaded indexes; runSearch opens them. Never prints.
import { join } from "node:path";
import MiniSearch from "minisearch";
import { canonicalDomain, canonicalDomains, DOMAIN_IDS } from "./domains.ts";
import { findProjectJournal, homeJournal, journalAliases, resolvePersonalJournal, samePath, type Place } from "./journals.ts";
import type { Outcome } from "./outcome.ts";
import { loadIndex, type JournalIndex, type SearchDoc } from "./search-index.ts";
import { canonicalTag, queryAliases } from "./tag-aliases.ts";
import { CAPS, cut, forAgent } from "./text.ts";

export interface JournalSource {
  scope: "personal" | "project";
  path: string;
  index: JournalIndex;
  aliases?: ReadonlyMap<string, string>; // the journal's tag aliases (tag-aliases.ts); none: no aliases
}

export type Match = "boost" | "filter";

export interface SearchFilters {
  limit: number;
  tags?: string[]; // technologies the question names; aliases and near spellings resolved
  domains?: string[]; // concerns the question names, from the vocabulary (decision 0040)
  match?: Match; // boost (default): domains and tags add to the score; filter: only notes with one of them
  kind?: string;
  weights?: typeof WEIGHTS; // the retrieval eval's tuning only; WEIGHTS otherwise
}

// The weights of decision 0041, tuned on the retrieval eval's tuning split.
export const WEIGHTS = { domain: 0.3, tag: 0.25, suggested: 0.5 };

// Why a result matched: the requested domains and tags it has, and the query's words found in it.
export interface Why {
  domains: string[];
  tags: string[];
  words: string[];
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
  domains: string[]; // the note's confirmed domains
  domains_suggested: string[]; // its suggested domains
  why: Why;
  score: number;
  path: string;
}

// score = L + WEIGHTS.domain · D + WEIGHTS.tag · T (decision 0041):
// - L, the lexical score, normalised to 0..1 over every lexical hit; the query gets the canonical
//   tag of each word that is exactly an alias;
// - D, the share of requested domains the note has: 1 each when confirmed, WEIGHTS.suggested when
//   only suggested;
// - T, the share of requested tags it has: 1 each by name or alias, 0.5 for a near spelling.
// With match "boost", a note that has a requested domain or tag is a candidate without words;
// with "filter", only those are. Reviewed results still come before inbox ones (spec §5).
export function searchJournals(sources: JournalSource[], query: string, filters: SearchFilters): SearchResult[] {
  const domains = [...new Set(filters.domains ?? [])];
  const wanted = [...new Set((filters.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const structured = domains.length > 0 || wanted.length > 0;
  const filter = filters.match === "filter" && structured;
  const weights = filters.weights ?? WEIGHTS;
  const kindOk = (doc: SearchDoc) => !filters.kind || doc.kind === filters.kind;

  type Hit = { source: JournalSource; doc: SearchDoc; lexical: number; words: string[] };
  const byKey = new Map<string, Hit>();
  for (const source of sources) {
    const aliases = source.aliases ?? new Map<string, string>();
    const expanded = [query, ...queryAliases(query, aliases)].join(" ");
    for (const hit of source.index.search(expanded, { filter: (r) => kindOk(r as unknown as SearchDoc) })) {
      const doc = hit as unknown as SearchDoc & { score: number; queryTerms: string[] };
      byKey.set(`${source.scope}\0${doc.file}\0${doc.skill ?? ""}`, { source, doc, lexical: doc.score, words: doc.queryTerms });
    }
    if (!structured) continue;
    // A note found by its domains or tags alone; its skill lines come only with words.
    for (const hit of source.index.search(MiniSearch.wildcard, { filter: (r) => (r as unknown as SearchDoc).type === "note" && kindOk(r as unknown as SearchDoc) })) {
      const doc = hit as unknown as SearchDoc;
      const key = `${source.scope}\0${doc.file}\0${doc.skill ?? ""}`;
      if (!byKey.has(key)) byKey.set(key, { source, doc, lexical: 0, words: [] });
    }
  }
  const top = Math.max(0, ...[...byKey.values()].map((h) => h.lexical));

  const hits: { result: SearchResult; group: number; score: number }[] = [];
  for (const { source, doc, lexical, words } of byKey.values()) {
    const aliases = source.aliases ?? new Map<string, string>();
    const own = doc.tags.map((t) => canonicalTag(t, aliases));
    const matchedDomains = domains.filter((d) => doc.domains.includes(d) || doc.domainsSuggested.includes(d));
    const domainScore = domains.length ? domains.reduce((sum, d) => sum + (doc.domains.includes(d) ? 1 : doc.domainsSuggested.includes(d) ? weights.suggested : 0), 0) / domains.length : 0;
    const matchedTags: string[] = [];
    let tagScore = 0;
    for (const tag of wanted) {
      const canonical = canonicalTag(tag, aliases);
      if (own.includes(canonical)) {
        matchedTags.push(canonical);
        tagScore += 1;
      } else {
        const near = canonical.length >= 5 ? own.find((t) => t.length >= 5 && nearSpelling(t, canonical)) : undefined;
        if (near) {
          matchedTags.push(near);
          tagScore += 0.5;
        }
      }
    }
    if (wanted.length) tagScore /= wanted.length;
    if (filter && !matchedDomains.length && !matchedTags.length) continue;
    if (lexical === 0 && !matchedDomains.length && !matchedTags.length) continue;
    const score = (top ? lexical / top : 0) + weights.domain * domainScore + weights.tag * tagScore;
    hits.push({
      // Reviewed notes and completed skill lines (human-written) before inbox notes.
      group: doc.type === "skill" || doc.status === "reviewed" ? 0 : 1,
      score,
      result: {
        id: doc.purl,
        journal: source.scope,
        type: doc.type,
        skill: doc.skill,
        name: doc.name,
        verdict: (doc.type === "skill" ? doc.skillText : doc.verdict) || null,
        status: doc.status,
        domains: doc.domains ?? [],
        domains_suggested: doc.domainsSuggested ?? [],
        why: { domains: matchedDomains, tags: [...new Set(matchedTags)], words: [...new Set(words)] },
        score: Math.round(score * 100) / 100,
        path: join(source.path, "notes", doc.file),
      },
    });
  }
  hits.sort((a, b) => a.group - b.group || b.score - a.score);
  return projectFirst(hits.map((hit) => hit.result), (r) => (r.id ? `${r.id}#${r.skill ?? ""}` : null)).slice(0, filters.limit);
}

// Two tags of 5 letters or more one edit apart (a letter added, dropped or changed).
function nearSpelling(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const rest = (x: string, n: number) => x.slice(i + n);
  return rest(a, 1) === rest(b, 1) || rest(a, 1) === rest(b, 0) || rest(a, 0) === rest(b, 1);
}

// The same subject in both journals (the same `subject` key): the project's result directly before
// the personal one, at the place of the first of the two (spec §3). Otherwise the order is kept.
export function projectFirst<T extends { journal: string }>(results: T[], subject: (result: T) => string | null): T[] {
  const placed = new Set<T>();
  const ordered: T[] = [];
  for (const result of results) {
    if (placed.has(result)) continue;
    const key = subject(result);
    const partner = key ? results.find((other) => !placed.has(other) && other.journal !== result.journal && subject(other) === key) : undefined;
    const pair = !partner ? [result] : result.journal === "project" ? [result, partner] : [partner, result];
    for (const r of pair) {
      placed.add(r);
      ordered.push(r);
    }
  }
  return ordered;
}

export interface SearchRequest {
  query: string;
  tags?: string[];
  domains?: string[];
  match?: Match;
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
// The --json document as agent-facing output shows it (decision 0032, rule 2), for the CLI and the
// API alike; people get the results as read. A skill result's Verdict is its skill line.
export function searchForAgent(document: SearchRun["document"]): SearchRun["document"] {
  const results = document.results.map((r) =>
    forAgent(r, { id: CAPS.id, name: CAPS.name, skill: CAPS.name, verdict: r.type === "skill" ? CAPS.skill : CAPS.verdict, path: Infinity }));
  return forAgent({ ...document, results }, {});
}

// MCP search's max_chars (decision 0041): the document's JSON within `maxChars`, results kept whole
// in their order, then `rest`, one line naming the ones left out. Unchanged when it fits.
export function fitSearch(document: SearchRun["document"], maxChars: number): SearchRun["document"] & { rest?: string } {
  if (JSON.stringify(document).length <= maxChars) return document;
  const { results } = document;
  let fitted: SearchRun["document"] & { rest: string } = { ...document, results: [], rest: "" };
  for (let n = results.length - 1; n >= 0; n--) {
    const left = results.slice(n);
    const names = left.map((r) => (r.skill ? `${r.name} (skill ${r.skill})` : r.name)).join(", ");
    const rest = cut(`${left.length} more ${left.length === 1 ? "result" : "results"} not shown: ${names}. Raise max_chars or narrow the search.`, 500);
    fitted = { ...document, results: results.slice(0, n), rest };
    if (JSON.stringify(fitted).length <= maxChars) return fitted;
  }
  return fitted; // not even one result fits: none, and the line
}

export function runSearch(request: SearchRequest, place: Place): SearchRun {
  const { query } = request;
  if (!query.trim()) {
    return { outcome: "usage", document: { query, results: [], error: "Give a search query, for example: repomagpie search pdf" }, total: 0, warnings: [] };
  }
  const bad = request.domains?.find((d) => !canonicalDomain(d));
  if (bad !== undefined) return { outcome: "usage", document: { query, results: [], error: `--domain takes one of: ${DOMAIN_IDS.join(", ")}. Not a domain: ${bad}.` }, total: 0, warnings: [] };
  const { sources, warnings } = searchSources(request.journal, place);
  const domains = request.domains && canonicalDomains(request.domains); // an old name as its new one (decision 0055)
  const all = searchJournals(sources, query, { limit: Infinity, tags: request.tags, domains, match: request.match, kind: request.kind });
  return { outcome: "ok", document: { query, results: all.slice(0, request.limit) }, total: all.length, warnings };
}

// The journals search reads (both, or one), each with its index and tag aliases; the project journal
// never being the personal journal's folder nor the home directory's own .magpie (spec §3).
export function searchSources(journal: JournalSource["scope"] | undefined, place: Place): { sources: JournalSource[]; warnings: string[] } {
  const personal = resolvePersonalJournal({ home: place.home, env: place.env, cwd: place.cwd, flag: place.homeFlag });
  const project = findProjectJournal({ cwd: place.cwd, home: place.home, personalJournal: personal.path, flag: place.projectFlag });
  const sources: JournalSource[] = [];
  const source = (scope: JournalSource["scope"], path: string): JournalSource => ({ scope, path, index: loadIndex(path).index, aliases: journalAliases(path) });
  if (journal !== "project") sources.push(source("personal", personal.path));
  if (journal !== "personal" && project && !samePath(project, personal.path) && !samePath(project, homeJournal(place.home))) {
    sources.push(source("project", project));
  }
  return { sources, warnings: personal.warnings };
}
