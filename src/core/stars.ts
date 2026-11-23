// repomagpie import --stars and the app's "Import my GitHub stars" (decision 0068): the user's GitHub
// stars, read from the starred list alone (no request per repository), summed up, then the chosen ones
// written as inbox notes marked `starred`. Nothing is written until the user chooses. Read-only GET
// requests; the token goes only in the Authorization header (decision 0053). Never prints.
import { existsSync } from "node:fs";
import { trashedIds } from "./delete.ts";
import { get, RATE_LIMITS, type FetchProblem, type RepoMetadata } from "./github.ts";
import { githubAuth } from "./github-auth.ts";
import { resolveTarget } from "./identity.ts";
import { journalAliases, journalTagList, listNotes } from "./journals.ts";
import { linkEntries } from "./links.ts";
import type { Outcome } from "./outcome.ts";
import { knownTags, locateJournal, saveItem, type Context, type Journal } from "./save.ts";
import { counts, DEFAULT_LIMIT, selectStars, type Count, type StarSelection } from "./star-selection.ts";
import { CAPS, clean, forAgent } from "./text.ts";

type Scope = Journal["scope"];

// One starred repository, as the list gives it.
export interface Star {
  name: string; // owner/repo as GitHub writes it
  id: string; // its note's id, pkg:github/owner/repo (spec §4)
  url: string; // always https://github.com/owner/repo
  description: string | null;
  language: string | null;
  license: string; // an SPDX id, or "unknown" (decision 0020)
  topics: string[];
  archived: boolean;
  pushed_at: string | null;
  template: boolean;
  starred: string; // the day it was starred, YYYY-MM-DD in UTC
  in_journal: Scope[]; // the journals with a note on it
  in_trash: Scope[]; // when no journal has one, the journals whose trash has its note: skipped
}

export interface StarList {
  user: string | null; // whose stars; null for the signed-in user's
  stars: Star[]; // newest star first
  complete: boolean; // false when a limit or the page cap stopped the list
  problem: FetchProblem | null; // what stopped it, when something did
  warnings: string[];
}

export { DEFAULT_LIMIT, type StarSelection };
const PER_PAGE = 100;
export const MAX_PAGES = 100; // 10,000 stars, about 100 requests
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/; // GitHub's rule for a login
const FULL_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STAR_MEDIA = "application/vnd.github.star+json"; // adds starred_at to each item

// Why the request can't run, or null (the CLI's exit 2, the API's 400).
export function starsProblem(user: string | null, selection: StarSelection): string | null {
  if (user !== null && !LOGIN.test(user)) return "--user takes a GitHub login: letters, digits and single hyphens, at most 39.";
  if (selection.limit !== null && (!Number.isInteger(selection.limit) || selection.limit < 1)) return "--limit takes a whole number of 1 or more.";
  if (selection.since !== null && (!DAY.test(selection.since) || Number.isNaN(Date.parse(selection.since)))) return "--since takes a date written YYYY-MM-DD.";
  if (selection.languages.some((l) => !l.trim()) || selection.topics.some((t) => !t.trim())) return "--language and --topic take a value.";
  return null;
}

// The starred list, newest first, one page of 100 after another until a short page. A rate limit or
// another failure after some pages keeps them (complete: false); one before any fails.
export async function fetchStars(user: string | null, context: Context): Promise<{ ok: true; list: StarList } | { ok: false; problem: FetchProblem }> {
  const token = githubAuth(context).token;
  if (user === null && !token) {
    return { ok: false, problem: { kind: "auth", message: "Reading your own stars needs a GitHub token. Run gh auth login, or set GITHUB_TOKEN; or pass --user <login> to read someone's public stars." } };
  }
  const base = user === null ? "/user/starred" : `/users/${encodeURIComponent(user)}/starred`;
  const stars: Star[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const got = await get(`${base}?per_page=${PER_PAGE}&page=${page}`, user ?? "", { fetch: context.fetch, token }, false, STAR_MEDIA);
    if (!got.ok) {
      const problem = got.problem.kind === "not-found" ? { kind: "not-found" as const, message: `GitHub has no user ${user ?? ""}.` } : got.problem;
      if (!stars.length) return { ok: false, problem };
      const limited = RATE_LIMITS.includes(problem.kind);
      warnings.push(`${limited ? "GitHub's rate limit" : "A failed request"} stopped the list after ${count(stars.length)}, the newest: ${problem.message}`);
      return { ok: true, list: { user, stars, complete: false, problem, warnings } };
    }
    let items: unknown;
    try {
      items = JSON.parse(got.text);
    } catch {
      items = null;
    }
    if (!Array.isArray(items)) {
      const problem: FetchProblem = { kind: "http", message: "GitHub's answer wasn't a list of stars." };
      if (!stars.length) return { ok: false, problem };
      return { ok: true, list: { user, stars, complete: false, problem, warnings: [`The list stopped after ${count(stars.length)}: ${problem.message}`] } };
    }
    for (const item of items) {
      const star = starOf(item);
      if (star && !seen.has(star.id)) {
        seen.add(star.id);
        stars.push(star);
      }
    }
    if (items.length < PER_PAGE) return { ok: true, list: { user, stars, complete: true, problem: null, warnings } };
  }
  warnings.push(`Read the ${count(stars.length)} newest; RepoMagpie reads at most ${count(MAX_PAGES * PER_PAGE)}.`);
  return { ok: true, list: { user, stars, complete: false, problem: null, warnings } };
}

const count = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "star" : "stars"}`;

// What the list keeps of one item: GitHub's text cleaned (decision 0032, rule 8), the rest checked. An
// item without a valid name or star time is left out.
function starOf(raw: unknown): Star | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { starred_at: at, repo } = raw as { starred_at?: unknown; repo?: unknown };
  if (typeof at !== "string" || Number.isNaN(Date.parse(at)) || typeof repo !== "object" || repo === null) return null;
  const item = repo as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? clean(value).trim() : "");
  const name = typeof item.full_name === "string" ? item.full_name : "";
  if (!FULL_NAME.test(name)) return null;
  const resolved = resolveTarget(`https://github.com/${name}`);
  if (resolved.kind !== "ok") return null;
  const license = item.license as { spdx_id?: unknown } | null | undefined;
  const spdx = text(license?.spdx_id);
  const pushed = typeof item.pushed_at === "string" && /^\d{4}-\d{2}-\d{2}T[\d:]+Z$/.test(item.pushed_at) ? item.pushed_at : null;
  return {
    name,
    id: resolved.purl,
    url: `https://github.com/${name}`,
    description: text(item.description) || null,
    language: text(item.language) || null,
    license: spdx && spdx !== "NOASSERTION" ? spdx : "unknown",
    topics: (Array.isArray(item.topics) ? item.topics : []).map(text).filter(Boolean),
    archived: item.archived === true,
    pushed_at: pushed,
    template: item.is_template === true,
    starred: new Date(at).toISOString().slice(0, 10),
    in_journal: [],
    in_trash: [],
  };
}

// Marks each star with the journals that have a note on it, by id, and, for a star no journal has,
// the journals whose trash has its note: a note the user deleted doesn't come back (decision 0068).
// The notes' ids come from the link cache, so no note is read again; of the trash only the ids.
export function markNoted(stars: Star[], context: Context): void {
  const journals = (["personal", "project"] as const).map((scope) => ({ scope, ...notedIds(scope, context) }));
  for (const star of stars) {
    const id = star.id.toLowerCase();
    star.in_journal = journals.filter(({ ids }) => ids.has(id)).map(({ scope }) => scope);
    star.in_trash = star.in_journal.length ? [] : journals.filter(({ trashed }) => trashed.has(id)).map(({ scope }) => scope);
  }
}

function notedIds(scope: Scope, context: Context): { ids: Set<string>; trashed: Set<string> } {
  const journal = locateJournal(scope, context);
  const ids = new Set<string>();
  if (journal.error || !existsSync(journal.path)) return { ids, trashed: new Set() };
  const { files, data } = linkEntries(journal.path);
  for (const file of files) if (data[file].id) ids.add((data[file].id as string).toLowerCase());
  return { ids, trashed: trashedIds(journal.path) };
}

// A star as agent-facing output shows it (decision 0032): GitHub's text cleaned and capped.
export type StarRow = Omit<Star, "template"> & { truncated?: string[] };
const rowOf = ({ template: _template, ...star }: Star): StarRow =>
  forAgent(star, { name: CAPS.name, id: CAPS.id, url: CAPS.url, description: CAPS.other, language: CAPS.tag, license: CAPS.tag, topics: { each: CAPS.tag, count: CAPS.tags } });

// The --json document of import --stars, and the app's (decision 0023).
export interface StarsJson {
  user: string | null;
  journal: Scope; // where the notes go
  total: number; // stars read
  complete: boolean;
  languages: Count[]; // the 10 most common
  topics: Count[];
  in_journal: number; // stars already noted in a journal
  in_trash: number; // stars skipped because their note is in a journal's trash
  new: number;
  filters: StarSelection;
  matching: number; // new stars the filters keep
  selected: StarRow[]; // what is (or was) imported, newest star first
  stars?: StarRow[]; // every star read: the app's table only
  written: boolean;
  created: number;
  failed: number;
  items: { id: string; result: "created" | "updated" | "unchanged" | "failed"; error: string | null; warnings: string[] }[];
  tags_md_added: string[];
  problem: FetchProblem | null;
  warnings: string[];
  error?: string;
}

export function emptyStars(journal: Scope, user: string | null, selection: StarSelection, error?: string): StarsJson {
  return {
    user, journal, total: 0, complete: true, languages: [], topics: [], in_journal: 0, in_trash: 0, new: 0, filters: selection, matching: 0, selected: [],
    written: false, created: 0, failed: 0, items: [], tags_md_added: [], problem: null, warnings: [], ...(error === undefined ? {} : { error }),
  };
}

export interface StarsRequest {
  user: string | null;
  to: Scope;
  selection: StarSelection;
  names?: string[]; // the app's checked rows: exactly these, when new, whatever the selection says
  write: boolean;
  all?: boolean; // the app's table: every star in `stars`
}

export interface StarsRun {
  outcome: Outcome;
  document: StarsJson;
  list: StarList | null; // for the app's server to keep for the import that follows
  notices: string[]; // things done on the way, such as creating the project journal
}

// Reads the list (or takes `list`, read a moment ago), sums it up, selects, and with `write` writes
// the selected stars as inbox notes. Stars already noted, or with their note in the trash, are never
// written again.
export async function runStars(request: StarsRequest, context: Context, given?: StarList): Promise<StarsRun> {
  const { user, to, selection } = request;
  const usage = starsProblem(user, selection);
  if (usage) return { outcome: "usage", document: emptyStars(to, user, selection, usage), list: null, notices: [] };
  const journal = locateJournal(to, context);
  if (journal.error) return { outcome: "failed", document: emptyStars(to, user, selection, journal.error), list: null, notices: [] };

  let list = given;
  if (!list) {
    const fetched = await fetchStars(user, context);
    if (!fetched.ok) return { outcome: "failed", document: { ...emptyStars(to, user, selection, fetched.problem.message), problem: fetched.problem }, list: null, notices: [] };
    list = fetched.list;
  }
  markNoted(list.stars, context);
  const { matching, selected } = request.names
    ? (() => {
        const names = new Set(request.names.map((n) => n.toLowerCase()));
        const chosen = list.stars.filter((s) => !s.in_journal.length && !s.in_trash.length && names.has(s.name.toLowerCase()));
        return { matching: chosen, selected: chosen };
      })()
    : selectStars(list.stars, selection);
  const noted = list.stars.filter((s) => s.in_journal.length).length;
  const trashed = list.stars.filter((s) => s.in_trash.length).length;
  const document: StarsJson = {
    ...emptyStars(to, user, selection),
    total: list.stars.length,
    complete: list.complete,
    languages: counts(list.stars.flatMap((s) => (s.language ? [s.language] : []))),
    topics: counts(list.stars.flatMap((s) => s.topics)),
    in_journal: noted,
    in_trash: trashed,
    new: list.stars.length - noted - trashed,
    matching: matching.length,
    selected: selected.map(rowOf),
    ...(request.all ? { stars: list.stars.map(rowOf) } : {}),
    problem: list.problem,
    warnings: [...journal.warnings, ...list.warnings],
  };
  if (!request.write) return { outcome: "ok", document, list, notices: [] };

  const { notices, ...written } = await writeStars(journal, selected, context);
  Object.assign(document, written, { written: true });
  markNoted(list.stars, context); // the written ones are noted now, for the next import from this list
  return { outcome: written.failed ? "failed" : "ok", document, list, notices };
}

// Writes each star as a new inbox note, marked `starred`, from the list's data alone: no request is
// sent. The topics of the journal's notes are gathered once and grow with each note, so a big import
// doesn't read every note again for each one (decision 0068).
async function writeStars(journal: Journal, stars: Star[], context: Context): Promise<Pick<StarsJson, "created" | "failed" | "items" | "tags_md_added"> & { notices: string[] }> {
  const notes = listNotes(journal.path);
  const tagList = journalTagList(journal.path);
  const known = { ...knownTags(notes, tagList, null), aliases: journalAliases(journal.path) };
  const shared = known.shared as Set<string>;
  const items: StarsJson["items"] = [];
  const tagsMdAdded: string[] = [];
  const notices: string[] = [];
  for (const star of stars) {
    const saved = await saveItem(journal, notes, { purl: star.id, source: star.url, metadata: metadataOf(star), starred: star.starred }, context, false, tagList, known);
    if (saved.result === "created") for (const carried of notes.at(-1)?.carries ?? []) shared.add(carried);
    tagsMdAdded.push(...saved.tagsMdAdded);
    notices.push(...saved.notices);
    items.push({ id: saved.id, result: saved.result, error: saved.error, warnings: saved.warnings });
  }
  return { created: items.filter((i) => i.result === "created").length, failed: items.filter((i) => i.result === "failed").length, items, tags_md_added: tagsMdAdded, notices };
}

// What a note takes from the starred list. The list has no file list, manifests or README, so a
// starred note has no packages and no skills, and its kind comes from its topics and name only.
function metadataOf(star: Star): RepoMetadata {
  return {
    name: star.name, url: star.url, description: star.description, language: star.language, license: star.license, topics: star.topics,
    skills: null, skillFolders: null, template: star.template, packages: null, plugin: false, bin: false, keywords: [], readme: null, action: false, rootFolders: null,
  };
}
