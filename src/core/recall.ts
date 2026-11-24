// Recall (spec §2 recall, §5 matching): the notes in both journals for a package, before it is
// installed. Each journal's notes are summarised once into <journal>/.cache/recall-index.json
// (note-cache.ts), so a lookup reads one file instead of every note. Never prints.
import { join } from "node:path";
import { PackageURL } from "packageurl-js";
import { manifestTypes, normalizePackage, type PackageType } from "./identity.ts";
import { findManifests, findProjectJournal, homeJournal, resolvePersonalJournal, samePath, type Env, type Place } from "./journals.ts";
import { sectionItems, starredOf, type Note } from "./note.ts";
import { isRecord, isTextOrNull, isTexts, noteEntries, noteSignature } from "./note-cache.ts";
import { CAPS, clean, forAgent } from "./text.ts";
import { alternativeLinks, targetResolver, type FoundLink, type Resolution } from "./wikilinks.ts";

export const RECALL_CACHE = "recall-index.json";
// 2: entries carry alternatives; 3: nested and unterminated comments stripped; 4: one entry per note
// file, by its name (noteEntries); 5: starred (decision 0068)
const CACHE_VERSION = 5;

type ListName = "use_when" | "avoid_when";

// What recall needs from one note.
export interface RecallEntry {
  file: string;
  id: string;
  name: string;
  keys: [string, string][]; // [PURL type, name with namespace] for the id and every package
  verdict: string; // "" when empty
  avoidWhen: string[];
  useWhen: string[];
  drafts: ListName[];
  status: "inbox" | "reviewed";
  starred: boolean; // a starred note without a Verdict: recall and the hook don't answer from it (decision 0068)
  alternatives: FoundLink[]; // the alternatives field's targets, in order, as written
}

export interface RecallSource {
  scope: "project" | "personal";
  path: string;
  entries: RecallEntry[];
  tooBig?: string[]; // note files over 256 KB, not read (decision 0032 rule 6): their Verdicts are unknown
}

export interface RecallMatch {
  query: string;
  id: string;
  journal: RecallSource["scope"];
  confidence: "exact" | "name-only";
  name: string;
  verdict: string | null;
  avoid_when: string[];
  use_when: string[];
  drafts: ListName[];
  status: "inbox" | "reviewed";
  path: string;
  alternatives: Alternative[];
}

// An alternative of a matched note (decision 0029): a note in the same journal, or an unresolved
// target, shown by its name as written, with why it doesn't resolve.
export interface Alternative {
  name: string;
  id: string | null;
  journal: RecallSource["scope"];
  verdict: string | null;
  status: "reviewed" | "inbox" | null;
  avoid: boolean; // avoid_in isn't empty
  avoid_in: RecallSource["scope"][]; // the journals whose note on it is an avoid note, project first (decision 0059)
  path: string | null;
  reason?: "missing" | "ambiguous"; // only when id is null, as a [[link]]'s (links.ts)
}

// How the alternative's mark reads for people (decision 0059): `moment (your notes say avoid)`.
export const AVOID_MARK = "your notes say avoid";

// The journals recall reads (spec §3): the personal journal and, if found, the project journal,
// which is never the personal journal's folder nor the home directory's own .magpie.
export function openRecallSources(options: { home: string; env: Env; cwd: string; homeFlag?: string; projectFlag?: string }): { sources: RecallSource[]; warnings: string[] } {
  const personal = resolvePersonalJournal({ home: options.home, env: options.env, cwd: options.cwd, flag: options.homeFlag });
  const project = findProjectJournal({ cwd: options.cwd, home: options.home, personalJournal: personal.path, flag: options.projectFlag });
  const source = (scope: RecallSource["scope"], path: string): RecallSource => {
    const { entries, tooBig } = loadRecallEntries(path);
    return { scope, path, entries, tooBig };
  };
  const sources: RecallSource[] = [source("personal", personal.path)];
  if (project && !samePath(project, personal.path) && !samePath(project, homeJournal(options.home))) {
    sources.unshift(source("project", project));
  }
  return { sources, warnings: personal.warnings };
}

// One journal's entries, in file order. Each is cached per note file (noteEntries): a note added or
// changed since is read again, alone, and so is one whose cached entry hasn't the expected shape, so a
// damaged cache can't silence recall or the hook. `rebuilt`: some entry was read again from its note.
// `listed`: the journal's noteSignature, when the caller has it already (one listing per journal per
// command).
export function loadRecallEntries(journal: string, listed = noteSignature(journal)): { entries: RecallEntry[]; rebuilt: boolean; derived: string[]; tooBig: string[] } {
  // An entry must name the note file it is kept for: a cache a repository committed can't send recall
  // to a file elsewhere, nor to another note (decision 0032). A note without a readable id is null.
  const valid = (e: unknown, file: string) => e === null || (isRecallEntry(e) && (e as RecallEntry).file === file);
  const { files, data, derived } = noteEntries(journal, RECALL_CACHE, CACHE_VERSION, (file, parse) => entryOf(parse(), file), valid, listed);
  return { entries: files.flatMap((file) => data[file] ?? []), rebuilt: derived.length > 0, derived, tooBig: listed.tooBig };
}

function isRecallEntry(e: unknown): boolean {
  return isRecord(e) && typeof e.file === "string" && typeof e.id === "string" && typeof e.name === "string" &&
    Array.isArray(e.keys) && e.keys.every((key) => Array.isArray(key) && key.length === 2 && isTexts(key)) &&
    typeof e.verdict === "string" && isTexts(e.avoidWhen) && isTexts(e.useWhen) &&
    Array.isArray(e.drafts) && e.drafts.every((d) => d === "use_when" || d === "avoid_when") &&
    (e.status === "inbox" || e.status === "reviewed") && typeof e.starred === "boolean" &&
    Array.isArray(e.alternatives) && e.alternatives.every((a) => isRecord(a) && typeof a.target === "string" && isTextOrNull(a.label));
}

function entryOf(note: Note, file: string): RecallEntry | null {
  const fm = note.frontmatter;
  if (typeof fm.id !== "string") return null; // a note without a readable id can't match
  const packages = Array.isArray(fm.packages) ? fm.packages.filter((p): p is string => typeof p === "string") : [];
  const keys = [fm.id, ...packages].flatMap((purl) => {
    try {
      const p = PackageURL.fromString(purl);
      return [[p.type, p.namespace ? `${p.namespace}/${p.name}` : p.name] as [string, string]];
    } catch {
      return [];
    }
  });
  const section = (name: string) => note.sections.find((s) => s.name === name);
  return {
    file,
    id: fm.id,
    name: typeof fm.name === "string" ? fm.name : file.replace(/\.md$/, ""),
    keys,
    verdict: note.verdict,
    avoidWhen: sectionItems(section("Avoid when")?.body ?? ""),
    useWhen: sectionItems(section("Use when")?.body ?? ""),
    drafts: [section("Use when")?.draft ? "use_when" : null, section("Avoid when")?.draft ? "avoid_when" : null].filter((d): d is ListName => d !== null),
    status: note.status,
    starred: note.status === "inbox" && starredOf(fm) !== null,
    alternatives: alternativeLinks(fm.alternatives),
  };
}

// Names compare as their registry does for exact matches, and loosely for name-only ones.
const exactName = (type: string, name: string) => (type === "pypi" ? name.toLowerCase().replace(/[-_.]+/g, "-") : type === "cargo" ? name : name.toLowerCase());
const looseName = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "-");

// The packages a query may mean: a PURL's own type, or the query under each of `types`.
function candidates(query: string, types: PackageType[]): { type: string; name: string }[] {
  if (query.trim().startsWith("pkg:")) {
    try {
      const p = PackageURL.fromString(query.trim());
      return [{ type: p.type, name: p.namespace ? `${p.namespace}/${p.name}` : p.name }];
    } catch {
      return [];
    }
  }
  return types.map((type) => ({ type, name: normalizePackage(query, type) })).filter((c) => c.name);
}

// The matches for one query across the journals (spec §5): exact matches from every journal,
// project first; name-only matches only when no journal has an exact one. A starred note without a
// Verdict is never a match: a star isn't a decision (decision 0068). `withStarred` matches them too,
// for delete, which finds a note to remove, not a decision.
export function recall(sources: RecallSource[], query: string, types: PackageType[], withStarred = false): RecallMatch[] {
  return matching(sources, query, types, withStarred ? null : false).map(({ source, entry, confidence }) => match(query, source, entry, confidence, sources));
}

// The starred notes without a Verdict that would match the query: recall's "You starred this on
// GitHub; no note yet." Matched by the same rules as recall.
export function recallStarred(sources: RecallSource[], query: string, types: PackageType[]): StarredMatch[] {
  return matching(sources, query, types, true).map(({ source, entry }) => ({ query, id: entry.id, journal: source.scope, path: join(source.path, "notes", entry.file) }));
}

export interface StarredMatch {
  query: string;
  id: string;
  journal: RecallSource["scope"];
  path: string;
}

// `starred`: only starred notes (true), only the others (false), or both (null).
function matching(sources: RecallSource[], query: string, types: PackageType[], starred: boolean | null): { source: RecallSource; entry: RecallEntry; confidence: RecallMatch["confidence"] }[] {
  const wanted = candidates(query, types);
  const kinds = new Set(wanted.map((c) => c.type));
  const ordered = [...sources].sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "project" ? -1 : 1));
  type Found = { source: RecallSource; entry: RecallEntry; confidence: RecallMatch["confidence"] };
  const exact: Found[] = [];
  const nameOnly: Found[] = [];
  for (const source of ordered) {
    for (const entry of source.entries) {
      if (starred !== null && entry.starred !== starred) continue;
      const isExact = entry.keys.some(([type, name]) => wanted.some((c) => c.type === type && exactName(type, c.name) === exactName(type, name)));
      const isNameOnly = !isExact && entry.keys.some(([type, name]) =>
        !kinds.has(type) && wanted.some((c) => looseName(c.name) === looseName(type === "github" ? name.split("/").pop() ?? "" : name)));
      if (isExact) exact.push({ source, entry, confidence: "exact" });
      else if (isNameOnly) nameOnly.push({ source, entry, confidence: "name-only" });
    }
  }
  return exact.length ? exact : nameOnly;
}

function match(query: string, source: RecallSource, entry: RecallEntry, confidence: RecallMatch["confidence"], sources: RecallSource[]): RecallMatch {
  return {
    query,
    id: entry.id,
    journal: source.scope,
    confidence,
    name: entry.name,
    verdict: entry.verdict || null,
    avoid_when: entry.avoidWhen,
    use_when: entry.useWhen,
    drafts: entry.drafts,
    status: entry.status,
    path: join(source.path, "notes", entry.file),
    alternatives: alternativesOf(source, entry, sources),
  };
}

// A journal's entries by file, and for each file the entries whose alternatives resolve to it. Built
// once per entries list, so the hook's several packages share it.
interface AlternativeIndex {
  resolve: (target: string) => Resolution;
  byFile: Map<string, RecallEntry>;
  listedBy: Map<string, RecallEntry[]>;
  avoidIds: Set<string>; // the ids of the journal's avoid notes
}

const entryIsAvoid = (entry: RecallEntry) => isAvoid({ verdict: entry.verdict || null, avoid_when: entry.avoidWhen });
const alternativeIndexes = new WeakMap<RecallEntry[], AlternativeIndex>();

function alternativeIndex(entries: RecallEntry[]): AlternativeIndex {
  let index = alternativeIndexes.get(entries);
  if (index) return index;
  // An entry without a `name` carries its file stem as its name, which never changes a resolution:
  // the stem rule comes first.
  const resolve = targetResolver(entries);
  const byFile = new Map(entries.map((entry) => [entry.file, entry]));
  const listedBy = new Map<string, RecallEntry[]>();
  for (const entry of entries) {
    for (const file of new Set(entry.alternatives.map(({ target }) => resolve(target).file))) {
      if (file && file !== entry.file) listedBy.set(file, [...(listedBy.get(file) ?? []), entry]);
    }
  }
  index = { resolve, byFile, listedBy, avoidIds: new Set(entries.filter(entryIsAvoid).map((entry) => entry.id)) };
  alternativeIndexes.set(entries, index);
  return index;
}

// The alternatives of the note in `file` of the source's journal; [] for a file recall can't read.
// `sources`: every journal read, for the avoid mark (decision 0059).
export function alternativesOfFile(source: RecallSource, file: string, sources: RecallSource[] = [source]): Alternative[] {
  const entry = alternativeIndex(source.entries).byFile.get(file);
  return entry ? alternativesOf(source, entry, sources) : [];
}

// Whether `journal` has an avoid note on an alternative (decision 0059): one with the same id when
// the alternative has a note, else the one its name resolves to there, by the link rules.
function avoidedIn(journal: RecallSource, alternative: { id: string | null; name: string }): boolean {
  const { avoidIds, resolve, byFile } = alternativeIndex(journal.entries);
  if (alternative.id !== null) return avoidIds.has(alternative.id);
  const { file } = resolve(alternative.name);
  const entry = file ? byFile.get(file) : undefined;
  return entry ? entryIsAvoid(entry) : false;
}

// The alternatives of one note (decision 0029): the targets in its own field, then the notes that
// list it; each once, never the note itself. Reviewed first, then inbox, avoid and unresolved ones.
// They resolve in the note's own journal; only the avoid mark reads every journal (decision 0059).
function alternativesOf(source: RecallSource, entry: RecallEntry, sources: RecallSource[]): Alternative[] {
  const { resolve, byFile, listedBy } = alternativeIndex(source.entries);
  const found = new Map<string, Alternative>();
  const note = (other: RecallEntry): Alternative => ({
    name: other.name,
    id: other.id,
    journal: source.scope,
    verdict: other.verdict || null,
    status: other.status,
    avoid: false,
    avoid_in: [],
    path: join(source.path, "notes", other.file),
  });
  for (const { target } of entry.alternatives) {
    const resolution = resolve(target);
    const { file } = resolution;
    const key = file ?? `?${target.toLowerCase()}`; // file names never start with "?"
    if (file === entry.file || found.has(key)) continue;
    const other = file ? byFile.get(file) : undefined;
    const reason = resolution.file === null ? resolution.reason : "missing";
    found.set(key, other ? note(other) : { name: target, id: null, journal: source.scope, verdict: null, status: null, avoid: false, avoid_in: [], path: null, reason });
  }
  for (const other of listedBy.get(entry.file) ?? []) if (!found.has(other.file)) found.set(other.file, note(other));
  const journals = [...sources].sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "project" ? -1 : 1));
  for (const alternative of found.values()) {
    alternative.avoid_in = journals.filter((j) => avoidedIn(j, alternative)).map((j) => j.scope);
    alternative.avoid = alternative.avoid_in.length > 0;
  }
  const rank = (a: Alternative) => (a.path === null ? 3 : a.avoid ? 2 : a.status === "inbox" ? 1 : 0);
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...found.values()].sort((a, b) => rank(a) - rank(b) || compare(a.name.toLowerCase(), b.name.toLowerCase()) || compare(a.name, b.name));
}

const ALL_TYPES: PackageType[] = ["npm", "pypi", "cargo"];

export interface RecallRun {
  // The --json document (spec §2), for an agent. `starred`: queries without a match that a starred
  // note would match: "You starred this on GitHub; no note yet." (decision 0068)
  document: { matches: Omit<RecallMatch, "name">[]; skipped: string[]; starred: StarredMatch[] };
  results: { query: string; matches: RecallMatch[]; starred: StarredMatch[] }[]; // as read, for people
  warnings: string[];
}

// A match as agent-facing output shows it (decision 0032, rule 2): note text cleaned and capped, and
// `truncated` on each match and alternative that had a field cut. suggest's in_use_avoid uses it too.
const ALTERNATIVE_CAPS = { name: CAPS.name, id: CAPS.id, verdict: CAPS.verdict, path: Infinity };
const MATCH_CAPS = {
  id: CAPS.id, name: CAPS.name, verdict: CAPS.verdict, path: Infinity,
  avoid_when: { each: CAPS.item, count: CAPS.items }, use_when: { each: CAPS.item, count: CAPS.items },
  alternatives: { each: CAPS.other, count: CAPS.alternatives },
};
export function matchForAgent<M extends Omit<RecallMatch, "name">>(match: M): M & { truncated?: string[] } {
  return forAgent({ ...match, alternatives: match.alternatives.map(alternativeForAgent) }, MATCH_CAPS);
}
export const alternativeForAgent = (alternative: Alternative): Alternative => forAgent(alternative, ALTERNATIVE_CAPS);

// magpie recall <package...>. A bare name's type: `type`, else the nearest manifest; unsettled
// means every type (spec §2).
export function runRecall(queries: string[], type: PackageType | undefined, place: Place): RecallRun {
  const fromManifests = manifestTypes(findManifests(place.cwd));
  const types = type ? [type] : fromManifests.length ? fromManifests : ALL_TYPES;
  const { sources, warnings } = openRecallSources(place);
  const results = queries.map((query) => {
    const matches = recall(sources, query, types);
    return { query, matches, starred: matches.length ? [] : recallStarred(sources, query, types) };
  });
  const matches = results.flatMap((r) => r.matches).map(({ name: _name, ...match }) => matchForAgent(match));
  const starred = results.flatMap((r) => r.starred).map((s) => forAgent(s, { id: CAPS.id, path: Infinity }));
  // Notes not read for their size: their Verdicts are unknown, so no match isn't the whole answer.
  const skipped = sources.flatMap((s) => s.tooBig ?? []).map((path) => clean(`${path} is over 256 KB`));
  return { document: { matches, skipped, starred }, results, warnings };
}

// An avoid note (decision 0024): its Verdict starts with the word "avoid", or Avoid when has text.
export function isAvoid(match: Pick<RecallMatch, "verdict" | "avoid_when">): boolean {
  return verdictSaysAvoid(match.verdict) || match.avoid_when.length > 0;
}

// A Verdict that says to avoid the package: it starts with the word "avoid". magpie adopt names no
// install command for one (spec §2); "Avoid when" lists situations, not the package.
export function verdictSaysAvoid(verdict: string | null): boolean {
  return /^avoid\b/i.test(verdict ?? "");
}
