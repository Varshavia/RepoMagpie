// magpie note and magpie import (spec §2): the journal to write to, and saving one item (find the
// note, fetch GitHub metadata, capture, write). Each run returns its --json document, which the CLI
// prints and the local app's API returns as is (decision 0023). Writes notes; never prints.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { captureNote, type Capture, type Items } from "./capture.ts";
import { fetchRepository, type Fetch, type RepoMetadata } from "./github.ts";
import { githubAuth, type GitHubAuth } from "./github-auth.ts";
import { fileNameClash, fileNameFor, resolveTarget, type PackageType } from "./identity.ts";
import { parseImport, type SkippedLine } from "./import.ts";
import {
  appendTags,
  carried,
  createJournal,
  findManifests,
  findProjectJournal,
  findProjectRoot,
  flagJournal,
  gitRoot,
  homeJournal,
  isLink,
  journalAliases,
  journalTagList,
  listNotes,
  noteFor,
  resolvePersonalJournal,
  samePath,
  type NoteEntry,
  type Place,
} from "./journals.ts";
import { canonicalDomains, domainsProblem } from "./domains.ts";
import { linkEntries } from "./links.ts";
import { readNote } from "./note.ts";
import { assertWritable, journalPathProblem, linkProblem } from "./note-cache.ts";
import type { Outcome } from "./outcome.ts";
import { CAPS, forAgent } from "./text.ts";
import type { KnownTags } from "./topic-tags.ts";
import { alternativeLinks, targetResolver } from "./wikilinks.ts";
import { addAlternatives, itemsProblem } from "./write.ts";

// Where the journals are, plus what a write needs from the outside world.
export interface Context extends Place {
  fetch: Fetch;
  today: () => string; // YYYY-MM-DD, local time
  github?: () => GitHubAuth; // the GitHub token and where it came from (decision 0053); without it, the environment alone
}

export interface Journal {
  path: string;
  scope: "personal" | "project";
  warnings: string[];
  error: string | null; // set when this journal can't be used; nothing may be written to it
}

// The journal to write to (spec §3). A project journal that doesn't exist yet is created on the
// first write, at the git root, or where --project names (spec §2 note step 5); outside a git
// repository without --project, there is none. The personal journal's folder is never taken as
// the project journal, nor as its project root.
export function locateJournal(scope: Journal["scope"], place: Place): Journal {
  const personal = resolvePersonalJournal({ home: place.home, env: place.env, cwd: place.cwd, flag: place.homeFlag });
  if (scope === "personal") return { path: personal.path, scope, warnings: personal.warnings, error: null };
  const found = findProjectJournal({ cwd: place.cwd, home: place.home, personalJournal: personal.path, flag: place.projectFlag });
  const path = found ?? (place.projectFlag ? flagJournal(place.cwd, place.projectFlag) : join(findProjectRoot(place.cwd, place.home), ".magpie"));
  const hint = "Run this inside a project, or pass --project <dir>.";
  const error = samePath(path, personal.path) || samePath(dirname(path), personal.path)
    ? `${path} is your personal journal, so it can't be the project journal. ${hint}`
    : samePath(path, homeJournal(place.home))
      ? `${path} is reserved for the default personal journal, so it can't be the project journal. ${hint}`
      : isLink(path)
        ? `${linkProblem(path).message}, so it can't be the project journal (decision 0032).`
        : !found && !place.projectFlag && !gitRoot(place.cwd, place.home)
          ? "No project journal here: outside a git repository, use --project <path>."
          : null;
  return { path, scope, warnings: personal.warnings, error };
}

export interface Item {
  purl: string;
  source: string;
  skillPath?: string;
  verdict?: string;
  useWhen?: string[]; // import's use: text, a draft
  avoidWhen?: string[]; // import's avoid: text, a draft
  ownUseWhen?: string[]; // note's --use-when, the user's own items
  ownAvoidWhen?: string[]; // note's --avoid-when, the user's own items
  myNotes?: string;
  alternatives?: string[]; // note's --alternative targets, as the user gave them (decision 0029)
  tags?: string[]; // a new note's tags as chosen in Add's preview, in place of the drafted ones
  domains?: string[]; // note's --domain: the domains the user confirmed (decision 0040)
}

export interface ItemResult {
  id: string;
  path: string | null;
  result: Capture["result"];
  name: string | null;
  status: Capture["status"];
  error: string | null;
  warnings: string[];
  notices: string[]; // things done on the way, such as creating the project journal
  text: string | null; // the note's text after this item (written, or what a dry run would write); null when failed
  alternatives: { added: string[]; present: string[] }; // the --alternative targets, as given
  tagsMdAdded: string[]; // the new note's tags appended to tags.md (or, in a dry run, that would be)
  items: Items; // what the --use-when and --avoid-when items did
  asksFirst: boolean; // the user's own Avoid when items made or kept this an avoid note (decision 0024)
  domainsAdded: string[]; // the --domain values written to `domains`
}

// What ranks a new note's topics (decision 0030): the tag list, and the topics and tags of every
// other note in the journal.
export function knownTags(notes: NoteEntry[], tagList: readonly string[], path: string | null): KnownTags {
  return { tagList, shared: new Set(notes.filter((note) => note.path !== path).flatMap((note) => note.carries)) };
}

// Creates or updates the note for one item. `notes` is the journal's note list; a new note is
// added to it, so a later item can find it. `tagList` is the journal's tag list; a new note's tags
// that it lacks are appended to tags.md and to it. With `dryRun`, nothing is written: the text that
// would have been written is kept in `notes`, and `tagList` grows the same way, so later items see
// the same state as a real run.
export async function saveItem(journal: Journal, notes: NoteEntry[], item: Item, context: Context, dryRun = false, tagList = journalTagList(journal.path)): Promise<ItemResult> {
  const entry = noteFor(notes, item.purl);
  const path = entry?.path ?? join(journal.path, "notes", fileNameFor(item.purl));
  const warnings: string[] = [];
  const notices: string[] = [];
  const fail = (error: string, at: string | null, status: Capture["status"] = null, name: string | null = null): ItemResult =>
    ({ id: entry?.id ?? item.purl, path: at, result: "failed", name, status, error, warnings, notices, text: null, alternatives: { added: [], present: [] }, tagsMdAdded: [], items: { changed: [], draftsReplaced: [], present: [] }, asksFirst: false, domainsAdded: [] });

  // A link, or a file over the size limit, at the note's place or above it: never read nor written
  // (decision 0032, rule 5). Listing left it out, so without this it would look like a free name.
  const blocked = journalPathProblem(journal.path, path);
  if (blocked) return fail(`Won't write ${path}: ${blocked.message}.`, null);
  const atPath = notes.find((note) => note.path === path);
  if (!entry && (atPath || existsSync(path))) {
    return fail(fileNameClash(item.purl, atPath?.id) ?? `${path} has no readable id, so it was left unchanged.`, path);
  }
  const existing = entry ? (entry.text ?? readFileSync(entry.path, "utf8")) : null;

  let metadata: RepoMetadata | null = null;
  const verdictTaken = existing !== null && Boolean(item.verdict?.trim()) && readNote(existing).verdict !== "";
  if (item.purl.startsWith("pkg:github/") && !verdictTaken) {
    const fetched = await fetchRepository(item.purl, { fetch: context.fetch, token: githubAuth(context).token });
    if (fetched.ok) {
      metadata = fetched.metadata;
      warnings.push(...fetched.warnings);
    } else if (fetched.problem.kind === "not-found" || fetched.problem.kind === "auth") {
      return fail(fetched.problem.message, entry?.path ?? null);
    } else {
      warnings.push(`Couldn't fetch GitHub metadata: ${fetched.problem.message} ${existing ? "The note's GitHub fields were not refreshed." : "The note was saved without it."}`);
    }
  }

  const known = { ...knownTags(notes, tagList, path), aliases: journalAliases(journal.path) };
  const capture = captureNote(existing, { ...item, metadata, today: context.today(), known });
  warnings.push(...capture.warnings);
  if (capture.result === "failed") return fail(capture.error ?? "The note was not saved.", entry?.path ?? null, capture.status, capture.name);

  // The alternatives go into the same write as the rest, so a failure writes nothing.
  let text = capture.text;
  const alternatives = { added: [] as string[], present: [] as string[] };
  if (item.alternatives?.length) {
    const base = (text ?? existing) as string; // capture writes nothing only for an existing note
    const plan = planAlternatives(journal.path, notes, path, base, item, capture.name);
    if ("error" in plan) return fail(plan.error, entry?.path ?? null, capture.status, capture.name);
    if (plan.entries.length) {
      const edited = addAlternatives(base, plan.entries);
      if (edited.warnings.length) return fail(edited.warnings[0], entry?.path ?? null, capture.status, capture.name);
      text = edited.text;
    }
    Object.assign(alternatives, { added: plan.added, present: plan.present });
  }
  const result = capture.result === "unchanged" && text !== null ? "updated" : capture.result;

  let tagsMdAdded: string[] = [];
  if (text !== null && dryRun) {
    tagsMdAdded = [...new Set(capture.tags)].filter((tag) => !tagList.includes(tag));
  } else if (text !== null) {
    try {
      if (createJournal(journal.path, journal.scope) && journal.scope === "project") notices.push(`Created the project journal: ${journal.path}`);
      assertWritable(journal.path, path);
      writeFileSync(path, text);
    } catch (error) {
      return fail(`Couldn't write ${path}: ${(error as Error).message}`, null);
    }
    try {
      tagsMdAdded = appendTags(journal.path, capture.tags);
    } catch (error) {
      warnings.push(`Couldn't add the note's tags to tags.md: ${(error as Error).message}`);
    }
  }
  tagList.push(...tagsMdAdded);
  if (text !== null) {
    const carries = carried(readNote(text).frontmatter);
    if (entry) Object.assign(entry, { carries }, dryRun ? { text } : {});
    else notes.push({ path, id: item.purl, packages: metadata?.packages ?? [], carries, ...(dryRun ? { text } : {}) });
  }
  return {
    id: entry?.id ?? item.purl,
    path,
    result,
    name: capture.name,
    status: capture.status,
    error: null,
    warnings,
    notices,
    text: text ?? existing,
    alternatives,
    tagsMdAdded,
    items: capture.items,
    asksFirst: Boolean(item.ownAvoidWhen?.some((i) => i.trim())),
    domainsAdded: capture.domainsAdded,
  };
}

// --alternative targets for the note in `path` (decision 0029). A target resolves within the journal
// by the link rules, a PURL by the note with that id or package. It is written as [[<file stem>]]:
// its note's, or for a PURL without a note the stem its note would have (spec §4), so a note created
// later resolves it; any other target as given. One already in the field, by its note or by its text
// (ignoring case), isn't added again. A note can't be its own alternative.
function planAlternatives(journal: string, notes: NoteEntry[], path: string, text: string, item: Item, name: string | null):
  { entries: string[]; added: string[]; present: string[] } | { error: string } {
  const links = linkEntries(journal);
  const resolve = targetResolver(links.files.filter((file) => links.data[file].id !== null).map((file) => ({ file, name: links.data[file].name })));
  const stemOf = (file: string) => file.slice(0, -".md".length);
  const locate = (target: string): { file: string | null; written: string } => {
    if (!target.toLowerCase().startsWith("pkg:")) {
      const file = resolve(target).file;
      return { file, written: file ? stemOf(file) : target };
    }
    const purl = resolveTarget(target); // runNote rejects a PURL that doesn't parse
    const found = purl.kind === "ok" ? noteFor(notes, purl.purl) : undefined;
    const file = found ? basename(found.path) : null;
    return { file, written: file ? stemOf(file) : purl.kind === "ok" ? stemOf(fileNameFor(purl.purl)) : target };
  };
  const own = basename(path);
  const isSelf = (target: string, at: { file: string | null; written: string }) =>
    at.file === own || [stemOf(own), item.purl, name ?? ""].some((same) => [target, at.written].some((t) => t.toLowerCase() === same.toLowerCase()));

  const field = readNote(text).frontmatter.alternatives;
  const seen = (Array.isArray(field) ? field.filter((entry): entry is string => typeof entry === "string") : [])
    .flatMap((entry) => alternativeLinks([entry]).slice(0, 1))
    .map(({ target }) => {
      const at = locate(target);
      return { file: at.file, texts: [target.toLowerCase(), at.written.toLowerCase()] };
    });
  const plan = { entries: [] as string[], added: [] as string[], present: [] as string[] };
  for (const given of item.alternatives ?? []) {
    const target = given.trim();
    const at = locate(target);
    if (isSelf(target, at)) return { error: `${name ?? item.purl} can't be an alternative to itself.` };
    const texts = [target.toLowerCase(), at.written.toLowerCase()];
    if (seen.some((s) => (at.file !== null && s.file === at.file) || s.texts.some((t) => texts.includes(t)))) {
      plan.present.push(given);
      continue;
    }
    seen.push({ file: at.file, texts });
    plan.entries.push(`[[${at.written}]]`);
    plan.added.push(given);
  }
  return plan;
}

export type Resolved = { ok: true; purl: string; skillPath?: string } | { ok: false; error: string };

// Who reads an ambiguous name's message (decision 0058): the CLI names --type, an agent the MCP
// field `type`, the app its "Type of a bare name" field. The app never sees a CLI flag.
export type Surface = "cli" | "agent" | "app";

export const PACKAGE_TYPES: readonly PackageType[] = ["npm", "pypi", "cargo"];
const PROMPT_TRIES = 3;

// The package types a bare name has a note under, in either journal (decision 0058, step 3).
export function notedTypes(name: string, place: Place): PackageType[] {
  const personal = resolvePersonalJournal({ home: place.home, env: place.env, cwd: place.cwd, flag: place.homeFlag });
  const project = findProjectJournal({ cwd: place.cwd, home: place.home, personalJournal: personal.path, flag: place.projectFlag });
  const notes = [personal.path, project].flatMap((path) => (path ? listNotes(path) : []));
  return PACKAGE_TYPES.filter((type) => {
    const resolution = resolveTarget(name, { type });
    return resolution.kind === "ok" && noteFor(notes, resolution.purl) !== undefined;
  });
}

// Decision 0058: a bare name's type is, in order, the given type, the project's manifests, the one
// type an existing note in either journal has it under; otherwise it is ambiguous. Then a terminal
// (`ask`) asks, npm preselected, again on an answer that isn't a type; elsewhere it fails with a
// message for its `surface`.
export async function resolveInput(target: string, type: PackageType | undefined, place: Place, options: { ask?: (question: string) => Promise<string>; surface?: Surface } = {}): Promise<Resolved> {
  const { ask, surface = "cli" } = options;
  const bare = !/^(pkg:|https?:\/\/)/i.test(target.trim());
  if (type && !bare && surface === "app") type = undefined; // the app's field is for bare names only
  if (type && !bare) return { ok: false, error: surface === "agent" ? "type only applies to a bare package name." : "--type only applies to a bare package name." };
  let resolution = resolveTarget(target, { manifests: bare ? findManifests(place.cwd) : [], type });
  if (resolution.kind === "ambiguous" && !resolution.candidates.length) {
    const noted = notedTypes(target, place);
    if (noted.length === 1) resolution = resolveTarget(target, { type: noted[0] });
  }
  if (resolution.kind === "ambiguous") {
    const choices: PackageType[] = resolution.candidates.length ? resolution.candidates : [...PACKAGE_TYPES];
    if (!ask) return { ok: false, error: ambiguousMessage(target, choices, surface) };
    const preset = choices.includes("npm") ? "npm" : choices[0];
    let answer: PackageType | null = null;
    for (let tries = 0; answer === null && tries < PROMPT_TRIES; tries++) {
      // One line only: a pasted next command is never taken as more than an answer to check.
      const line = (await ask(`Which package type is ${target}? ${choices.join(", ")} [${preset}]: `)).split(/\r?\n/)[0].trim().toLowerCase();
      answer = line === "" ? preset : choices.includes(line as PackageType) ? (line as PackageType) : null;
    }
    if (answer === null) return { ok: false, error: `No package type chosen for ${target}. Add --type ${choices.join("|")}.` };
    resolution = resolveTarget(target, { type: answer });
  }
  if (resolution.kind === "rejected") return { ok: false, error: resolution.reason };
  if (resolution.kind === "ambiguous") return { ok: false, error: ambiguousMessage(target, PACKAGE_TYPES, surface) };
  return { ok: true, purl: resolution.purl, skillPath: resolution.skillPath };
}

function ambiguousMessage(target: string, choices: readonly PackageType[], surface: Surface): string {
  const could = `${target} could be ${choices.join(", ")}.`;
  if (surface === "app") return `${could} Choose its type above.`;
  if (surface === "agent") return `${could} Pass type (${choices.join(", ")}), or a PURL such as pkg:${choices[0]}/${target}.`;
  return `${could} Add --type ${choices.join("|")}.`;
}

export interface NoteRequest {
  target: string;
  text?: string;
  type?: PackageType;
  to: Journal["scope"];
  alternatives?: string[]; // --alternative, repeatable
  useWhen?: string[]; // --use-when, repeatable: the user's own items
  avoidWhen?: string[]; // --avoid-when, repeatable: the user's own items
  tags?: string[]; // Add's preview: the new note's tags, as the user left them
  domains?: string[]; // --domain, repeatable: domains the user confirmed (decision 0040)
}

// The --json document of magpie note (spec §2).
export interface NoteJson {
  id: string | null;
  journal: Journal["scope"];
  path: string | null;
  created: boolean;
  journal_created: boolean; // this write created the journal's folder; a project journal is shared once committed
  status: Capture["status"];
  warnings: string[];
  alternatives_added: string[];
  alternatives_present: string[];
  tags_md_added: string[];
  sections_changed: string[];
  drafts_replaced: string[];
  items_present: string[];
  domains_added: string[]; // the --domain values written to `domains` (decision 0040)
  error?: string;
}

export interface NoteRun {
  outcome: Outcome;
  document: NoteJson;
  journal: Journal;
  saved: ItemResult | null; // null when the command stopped before saving
}

// magpie note <name-or-url> ["text"]: resolve the target, then save it in the journal.
export async function runNote(request: NoteRequest, context: Context, ask?: (question: string) => Promise<string>, surface: Surface = "cli"): Promise<NoteRun> {
  const journal = locateJournal(request.to, context);
  const stop = (error: string, outcome: Outcome): NoteRun => ({
    outcome,
    journal,
    saved: null,
    document: noteForAgent({ ...emptyNoteJson(journal.scope), warnings: journal.warnings, error }),
  });
  if (journal.error) return stop(journal.error, "failed");
  const itemsError = itemsProblem("--use-when", request.useWhen) ?? itemsProblem("--avoid-when", request.avoidWhen) ?? domainsProblem("--domain", request.domains);
  if (itemsError) return stop(itemsError, "usage");
  const bad = request.alternatives?.find((target) => !/^[^[\]|#\r\n]+$/.test(target.trim()));
  if (bad !== undefined) return stop(`--alternative takes a name, a PURL or a file stem, without [[ ]], | or #: ${JSON.stringify(bad)}.`, "usage");
  for (const target of request.alternatives ?? []) {
    const purl = target.trim().toLowerCase().startsWith("pkg:") ? resolveTarget(target.trim()) : null;
    if (purl && purl.kind !== "ok") return stop(`--alternative ${target}: ${purl.kind === "rejected" ? purl.reason : "not a PURL"}`, "usage");
  }
  const resolved = await resolveInput(request.target, request.type, context, { ask, surface });
  if (!resolved.ok) return stop(resolved.error, "usage");

  const existed = existsSync(journal.path);
  const item = { purl: resolved.purl, skillPath: resolved.skillPath, source: request.target, verdict: request.text, alternatives: request.alternatives, ownUseWhen: request.useWhen, ownAvoidWhen: request.avoidWhen, tags: request.tags, domains: request.domains && canonicalDomains(request.domains) };
  const saved = await saveItem(journal, listNotes(journal.path), item, context);
  const document: NoteJson = {
    id: saved.id,
    journal: journal.scope,
    path: saved.path,
    created: saved.result === "created",
    journal_created: !existed && existsSync(journal.path),
    status: saved.status,
    warnings: [...journal.warnings, ...saved.notices, ...saved.warnings],
    alternatives_added: saved.alternatives.added,
    alternatives_present: saved.alternatives.present,
    tags_md_added: saved.tagsMdAdded,
    sections_changed: saved.items.changed,
    drafts_replaced: saved.items.draftsReplaced,
    items_present: saved.items.present,
    domains_added: saved.domainsAdded,
  };
  if (saved.error !== null) document.error = saved.error;
  return { outcome: saved.error === null ? "ok" : "failed", document: noteForAgent(document), journal, saved };
}

// magpie note's --json document when nothing was saved; the caller adds `error`.
export function emptyNoteJson(scope: Journal["scope"]): NoteJson {
  return { id: null, journal: scope, path: null, created: false, journal_created: false, status: null, warnings: [], alternatives_added: [], alternatives_present: [], tags_md_added: [], sections_changed: [], drafts_replaced: [], items_present: [], domains_added: [] };
}

// The --json document as agent-facing output shows it (decision 0032, rule 2), for the CLI and the
// API alike: names, paths and warnings can carry a note's or GitHub's text. People get `saved`.
const noteForAgent = (document: NoteJson): NoteJson =>
  forAgent(document, { id: CAPS.id, path: Infinity, warnings: { each: CAPS.other, count: Infinity }, tags_md_added: { each: CAPS.tag, count: CAPS.tags }, items_present: { each: CAPS.item, count: 2 * CAPS.items } });

export interface ImportRequest {
  text: string; // the import file's contents
  to: Journal["scope"];
  dryRun?: boolean;
}

export interface LineResult {
  line: number;
  target: string;
  id: string | null;
  result: Capture["result"];
  error: string | null;
  warnings: string[];
}

// The --json document of magpie import (spec §2).
export interface ImportJson {
  items: { line: number; id: string | null; result: Capture["result"]; error: string | null; warnings: string[] }[];
  created: number;
  updated: number;
  failed: number;
  tags_md_added: string[]; // the new notes' tags appended to tags.md, in order
  skipped: SkippedLine[]; // prose, and a package an earlier line already names; in line order
  error?: string;
}

export interface ImportRun {
  outcome: Outcome;
  document: ImportJson;
  journal: Journal;
  results: LineResult[];
  notices: string[];
}

export function importFailure(error: string): ImportJson {
  return { items: [], created: 0, updated: 0, failed: 0, tags_md_added: [], skipped: [], error };
}

// magpie import: one item per line that names a package. One bad line never stops the rest; import
// never prompts. A package named again with nothing more is skipped; a later line with text adds it
// to the note the earlier line made, as for a note already in the journal.
export async function runImport(request: ImportRequest, context: Context): Promise<ImportRun> {
  const journal = locateJournal(request.to, context);
  if (journal.error) return { outcome: "failed", document: importFailure(journal.error), journal, results: [], notices: [] };

  const notes = listNotes(journal.path);
  const tagList = journalTagList(journal.path);
  const tagsMdAdded: string[] = [];
  const manifests = findManifests(context.cwd);
  const notices = new Set<string>();
  const results: LineResult[] = [];
  const { items, skipped } = parseImport(request.text);
  const seen = new Map<string, number>(); // PURL and skill → the first line that names it
  for (const item of items) {
    const failed = (error: string, id: string | null = null): LineResult => ({ line: item.line, target: item.target, id, result: "failed", error, warnings: [] });
    if (item.error) {
      results.push(failed(item.error));
      continue;
    }
    let resolution = resolveTarget(item.target, { manifests });
    if (resolution.kind === "ambiguous" && !resolution.candidates.length) {
      const noted = notedTypes(item.target, context); // decision 0058, step 3
      if (noted.length === 1) resolution = resolveTarget(item.target, { type: noted[0] });
    }
    if (resolution.kind === "ambiguous") {
      const types: PackageType[] = resolution.candidates.length ? resolution.candidates : ["npm", "pypi", "cargo"];
      results.push(failed(`${item.target} could be ${types.join(", ")}; write a PURL instead, such as pkg:${types[0]}/${item.target}.`));
      continue;
    }
    if (resolution.kind === "rejected") {
      results.push(failed(resolution.reason));
      continue;
    }
    const { useWhen, avoidWhen, verdict, myNotes } = item;
    const key = `${resolution.purl} ${resolution.skillPath ?? ""}`;
    const first = seen.get(key);
    const bare = verdict === undefined && !useWhen.length && !avoidWhen.length && !myNotes;
    if (first !== undefined && bare) {
      skipped.push({ line: item.line, reason: `Line ${first} names the same package.` });
      continue;
    }
    if (first === undefined) seen.set(key, item.line);
    const saved = await saveItem(journal, notes, { purl: resolution.purl, skillPath: resolution.skillPath, source: item.target, verdict, useWhen, avoidWhen, myNotes }, context, request.dryRun, tagList);
    tagsMdAdded.push(...saved.tagsMdAdded);
    for (const notice of saved.notices) notices.add(notice);
    results.push({ line: item.line, target: item.target, id: saved.id, result: saved.result, error: saved.error, warnings: saved.warnings });
  }

  const count = (result: Capture["result"]) => results.filter((r) => r.result === result).length;
  const document: ImportJson = {
    items: results.map(({ line, id, result, error, warnings }) => ({ line, id, result, error, warnings })),
    created: count("created"),
    updated: count("updated"),
    failed: count("failed"),
    tags_md_added: tagsMdAdded,
    skipped: skipped.sort((a, b) => a.line - b.line),
  };
  return { outcome: count("failed") ? "failed" : "ok", document, journal, results, notices: [...notices] };
}
