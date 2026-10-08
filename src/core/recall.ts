// Recall (spec §2 recall, §5 matching): the notes in both journals for a package, before it is
// installed. Each journal's notes are summarised once into <journal>/.cache/recall-index.json
// (note-cache.ts), so a lookup reads one file instead of every note. Never prints.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PackageURL } from "packageurl-js";
import { manifestTypes, normalizePackage, type PackageType } from "./identity.ts";
import { findManifests, findProjectJournal, homeJournal, resolvePersonalJournal, samePath, type Env, type Place } from "./journals.ts";
import { DRAFT_MARKER, readNote } from "./note.ts";
import { isRecord, isTextOrNull, isTexts, noteSignature, readCache, writeCache } from "./note-cache.ts";
import { alternativeLinks, targetResolver, type FoundLink } from "./wikilinks.ts";

export const RECALL_CACHE = "recall-index.json";
const CACHE_VERSION = 2; // 2: entries carry alternatives

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
  alternatives: FoundLink[]; // the alternatives field's targets, in order, as written
}

export interface RecallSource {
  scope: "project" | "personal";
  path: string;
  entries: RecallEntry[];
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
// target, shown by its name as written.
export interface Alternative {
  name: string;
  id: string | null;
  journal: RecallSource["scope"];
  verdict: string | null;
  status: "reviewed" | "inbox" | null;
  avoid: boolean;
  path: string | null;
}

// The journals recall reads (spec §3): the personal journal and, if found, the project journal,
// which is never the personal journal's folder nor the home directory's own .magpie.
export function openRecallSources(options: { home: string; env: Env; cwd: string; homeFlag?: string; projectFlag?: string }): { sources: RecallSource[]; warnings: string[] } {
  const personal = resolvePersonalJournal({ home: options.home, env: options.env, cwd: options.cwd, flag: options.homeFlag });
  const project = findProjectJournal({ cwd: options.cwd, home: options.home, personalJournal: personal.path, flag: options.projectFlag });
  const sources: RecallSource[] = [{ scope: "personal", path: personal.path, entries: loadRecallEntries(personal.path).entries }];
  if (project && !samePath(project, personal.path) && !samePath(project, homeJournal(options.home))) {
    sources.unshift({ scope: "project", path: project, entries: loadRecallEntries(project).entries });
  }
  return { sources, warnings: personal.warnings };
}

// One journal's entries, from the cache when it matches the notes on disk and every entry has the
// expected shape; otherwise rebuilt from the notes, so a damaged cache can't silence recall or the hook.
export function loadRecallEntries(journal: string): { entries: RecallEntry[]; rebuilt: boolean } {
  const { files, signature } = noteSignature(journal);
  const cached = readCache(journal, RECALL_CACHE, CACHE_VERSION, signature);
  if (Array.isArray(cached) && cached.every(isRecallEntry)) return { entries: cached as RecallEntry[], rebuilt: false };
  const entries = files.flatMap((file) => entryOf(readFileSync(join(journal, "notes", file), "utf8"), file) ?? []);
  if (files.length) writeCache(journal, RECALL_CACHE, CACHE_VERSION, signature, entries);
  return { entries, rebuilt: true };
}

function isRecallEntry(e: unknown): boolean {
  return isRecord(e) && typeof e.file === "string" && typeof e.id === "string" && typeof e.name === "string" &&
    Array.isArray(e.keys) && e.keys.every((key) => Array.isArray(key) && key.length === 2 && isTexts(key)) &&
    typeof e.verdict === "string" && isTexts(e.avoidWhen) && isTexts(e.useWhen) &&
    Array.isArray(e.drafts) && e.drafts.every((d) => d === "use_when" || d === "avoid_when") &&
    (e.status === "inbox" || e.status === "reviewed") &&
    Array.isArray(e.alternatives) && e.alternatives.every((a) => isRecord(a) && typeof a.target === "string" && isTextOrNull(a.label));
}

function entryOf(text: string, file: string): RecallEntry | null {
  const note = readNote(text);
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
    avoidWhen: items(section("Avoid when")?.body ?? ""),
    useWhen: items(section("Use when")?.body ?? ""),
    drafts: [section("Use when")?.draft ? "use_when" : null, section("Avoid when")?.draft ? "avoid_when" : null].filter((d): d is ListName => d !== null),
    status: note.status,
    alternatives: alternativeLinks(fm.alternatives),
  };
}

// A section's items: one per bullet, without comments and the draft marker. A line that isn't a
// bullet starts an item of its own, unless it is indented under the previous one.
function items(body: string): string[] {
  const out: string[] = [];
  for (const line of body.replace(/<!--[\s\S]*?-->/g, "").replace(DRAFT_MARKER, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) out.push(bullet[1].trim());
    else if (/^\s/.test(line) && out.length) out[out.length - 1] += ` ${line.trim()}`;
    else out.push(line.trim());
  }
  return out;
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
// project first; name-only matches only when no journal has an exact one.
export function recall(sources: RecallSource[], query: string, types: PackageType[]): RecallMatch[] {
  const wanted = candidates(query, types);
  const kinds = new Set(wanted.map((c) => c.type));
  const ordered = [...sources].sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "project" ? -1 : 1));
  const exact: RecallMatch[] = [];
  const nameOnly: RecallMatch[] = [];
  for (const source of ordered) {
    for (const entry of source.entries) {
      const isExact = entry.keys.some(([type, name]) => wanted.some((c) => c.type === type && exactName(type, c.name) === exactName(type, name)));
      const isNameOnly = !isExact && entry.keys.some(([type, name]) =>
        !kinds.has(type) && wanted.some((c) => looseName(c.name) === looseName(type === "github" ? name.split("/").pop() ?? "" : name)));
      if (isExact) exact.push(match(query, source, entry, "exact"));
      else if (isNameOnly) nameOnly.push(match(query, source, entry, "name-only"));
    }
  }
  return exact.length ? exact : nameOnly;
}

function match(query: string, source: RecallSource, entry: RecallEntry, confidence: RecallMatch["confidence"]): RecallMatch {
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
    alternatives: alternativesOf(source, entry),
  };
}

// A journal's entries by file, and for each file the entries whose alternatives resolve to it. Built
// once per entries list, so the hook's several packages share it.
interface AlternativeIndex {
  resolve: (target: string) => string | null;
  byFile: Map<string, RecallEntry>;
  listedBy: Map<string, RecallEntry[]>;
}
const alternativeIndexes = new WeakMap<RecallEntry[], AlternativeIndex>();

function alternativeIndex(entries: RecallEntry[]): AlternativeIndex {
  let index = alternativeIndexes.get(entries);
  if (index) return index;
  // An entry without a `name` carries its file stem as its name, which never changes a resolution:
  // the stem rule comes first.
  const resolver = targetResolver(entries);
  const resolve = (target: string) => resolver(target).file;
  const byFile = new Map(entries.map((entry) => [entry.file, entry]));
  const listedBy = new Map<string, RecallEntry[]>();
  for (const entry of entries) {
    for (const file of new Set(entry.alternatives.map(({ target }) => resolve(target)))) {
      if (file && file !== entry.file) listedBy.set(file, [...(listedBy.get(file) ?? []), entry]);
    }
  }
  index = { resolve, byFile, listedBy };
  alternativeIndexes.set(entries, index);
  return index;
}

// The alternatives of the note in `file` of the source's journal; [] for a file recall can't read.
export function alternativesOfFile(source: RecallSource, file: string): Alternative[] {
  const entry = alternativeIndex(source.entries).byFile.get(file);
  return entry ? alternativesOf(source, entry) : [];
}

// The alternatives of one note (decision 0029): the targets in its own field, then the notes that
// list it; each once, never the note itself. Reviewed first, then inbox, avoid and unresolved ones.
function alternativesOf(source: RecallSource, entry: RecallEntry): Alternative[] {
  const { resolve, byFile, listedBy } = alternativeIndex(source.entries);
  const found = new Map<string, Alternative>();
  const note = (other: RecallEntry): Alternative => ({
    name: other.name,
    id: other.id,
    journal: source.scope,
    verdict: other.verdict || null,
    status: other.status,
    avoid: isAvoid({ verdict: other.verdict || null, avoid_when: other.avoidWhen }),
    path: join(source.path, "notes", other.file),
  });
  for (const { target } of entry.alternatives) {
    const file = resolve(target);
    const key = file ?? `?${target.toLowerCase()}`; // file names never start with "?"
    if (file === entry.file || found.has(key)) continue;
    const other = file ? byFile.get(file) : undefined;
    found.set(key, other ? note(other) : { name: target, id: null, journal: source.scope, verdict: null, status: null, avoid: false, path: null });
  }
  for (const other of listedBy.get(entry.file) ?? []) if (!found.has(other.file)) found.set(other.file, note(other));
  const rank = (a: Alternative) => (a.path === null ? 3 : a.avoid ? 2 : a.status === "inbox" ? 1 : 0);
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...found.values()].sort((a, b) => rank(a) - rank(b) || compare(a.name.toLowerCase(), b.name.toLowerCase()) || compare(a.name, b.name));
}

const ALL_TYPES: PackageType[] = ["npm", "pypi", "cargo"];

export interface RecallRun {
  document: { matches: Omit<RecallMatch, "name">[] }; // the --json document (spec §2)
  results: { query: string; matches: RecallMatch[] }[];
  warnings: string[];
}

// magpie recall <package...>. A bare name's type: `type`, else the nearest manifest; unsettled
// means every type (spec §2).
export function runRecall(queries: string[], type: PackageType | undefined, place: Place): RecallRun {
  const fromManifests = manifestTypes(findManifests(place.cwd));
  const types = type ? [type] : fromManifests.length ? fromManifests : ALL_TYPES;
  const { sources, warnings } = openRecallSources(place);
  const results = queries.map((query) => ({ query, matches: recall(sources, query, types) }));
  const matches = results.flatMap((r) => r.matches).map(({ name: _name, ...match }) => match);
  return { document: { matches }, results, warnings };
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
