// magpie note <name-or-url> ["text"] (spec §2), and the journal and save steps import reuses.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { captureNote, type Capture } from "../core/capture.ts";
import { fetchRepository, type RepoMetadata } from "../core/github.ts";
import { fileNameClash, fileNameFor, resolveTarget, type PackageType } from "../core/identity.ts";
import {
  createProjectJournal,
  findManifests,
  findProjectJournal,
  findProjectRoot,
  listNotes,
  noteFor,
  readTagList,
  resolvePersonalJournal,
  samePath,
  type NoteEntry,
} from "../core/journals.ts";
import { readNote } from "../core/note.ts";
import type { Io } from "./program.ts";

export interface GlobalOptions {
  json?: boolean;
  home?: string;
  project?: string;
}

export interface Journal {
  path: string;
  scope: "personal" | "project";
  warnings: string[];
  error: string | null; // set when this journal can't be used; nothing may be written to it
}

// The journal to write to (spec §3). A project journal that doesn't exist yet is created on the
// first write, at the git root or in the working directory (spec §2 note step 5). The personal
// journal's folder is never taken as the project journal.
export function locateJournal(scope: Journal["scope"], options: GlobalOptions, io: Io): Journal {
  const personal = resolvePersonalJournal({ home: io.home, env: io.env, cwd: io.cwd, flag: options.home });
  if (scope === "personal") return { path: personal.path, scope, warnings: personal.warnings, error: null };
  const found = findProjectJournal({ cwd: io.cwd, personalJournal: personal.path, flag: options.project });
  const path = found ?? join(findProjectRoot(io.cwd), ".magpie");
  const error = samePath(path, personal.path)
    ? `${path} is your personal journal, so it can't be the project journal. Run this inside a project, or pass --project <dir>.`
    : null;
  return { path, scope, warnings: personal.warnings, error };
}

export interface Item {
  purl: string;
  source: string;
  skillPath?: string;
  verdict?: string;
  useWhen?: string[];
  avoidWhen?: string[];
  myNotes?: string;
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
}

// Creates or updates the note for one item. `notes` is the journal's note list; a new note is
// added to it, so a later item can find it. With `dryRun`, nothing is written: the text that
// would have been written is kept in `notes`, so later items see the same state as a real run.
export async function saveItem(journal: Journal, notes: NoteEntry[], item: Item, io: Io, dryRun = false): Promise<ItemResult> {
  const entry = noteFor(notes, item.purl);
  const path = entry?.path ?? join(journal.path, "notes", fileNameFor(item.purl));
  const warnings: string[] = [];
  const notices: string[] = [];
  const fail = (error: string, at: string | null, status: Capture["status"] = null, name: string | null = null): ItemResult =>
    ({ id: entry?.id ?? item.purl, path: at, result: "failed", name, status, error, warnings, notices });

  const atPath = notes.find((note) => note.path === path);
  if (!entry && (atPath || existsSync(path))) {
    return fail(fileNameClash(item.purl, atPath?.id) ?? `${path} has no readable id, so it was left unchanged.`, path);
  }
  const existing = entry ? (entry.text ?? readFileSync(entry.path, "utf8")) : null;

  let metadata: RepoMetadata | null = null;
  const verdictTaken = existing !== null && Boolean(item.verdict?.trim()) && readNote(existing).verdict !== "";
  if (item.purl.startsWith("pkg:github/") && !verdictTaken) {
    const fetched = await fetchRepository(item.purl, { fetch: io.fetch, token: io.env.GITHUB_TOKEN || undefined });
    if (fetched.ok) {
      metadata = fetched.metadata;
      warnings.push(...fetched.warnings);
    } else if (fetched.problem.kind === "not-found" || fetched.problem.kind === "auth") {
      return fail(fetched.problem.message, entry?.path ?? null);
    } else {
      warnings.push(`Couldn't fetch GitHub metadata: ${fetched.problem.message} ${existing ? "The note's GitHub fields were not refreshed." : "The note was saved without it."}`);
    }
  }

  const capture = captureNote(existing, { ...item, metadata, today: io.today(), tagList: readTagList(journal.path) });
  warnings.push(...capture.warnings);
  if (capture.result === "failed") return fail(capture.error ?? "The note was not saved.", entry?.path ?? null, capture.status, capture.name);
  if (capture.text !== null && dryRun) {
    if (entry) entry.text = capture.text;
    else notes.push({ path, id: item.purl, packages: metadata?.packages ?? [], text: capture.text });
  } else if (capture.text !== null) {
    try {
      if (journal.scope === "project" && createProjectJournal(journal.path)) notices.push(`Created the project journal: ${journal.path}`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, capture.text);
    } catch (error) {
      return fail(`Couldn't write ${path}: ${(error as Error).message}`, null);
    }
    if (!entry) notes.push({ path, id: item.purl, packages: metadata?.packages ?? [] });
  }
  return { id: entry?.id ?? item.purl, path, result: capture.result, name: capture.name, status: capture.status, error: null, warnings, notices };
}

export interface NoteOptions extends GlobalOptions {
  type?: PackageType;
  to: Journal["scope"];
}

export async function noteCommand(target: string, text: string | undefined, options: NoteOptions, io: Io): Promise<number> {
  const journal = locateJournal(options.to, options, io);
  const json = Boolean(options.json);
  const stop = (error: string, code: number) => {
    if (json) io.out(`${JSON.stringify({ id: null, journal: journal.scope, path: null, created: false, status: null, warnings: journal.warnings, error })}\n`);
    else io.err(`magpie note: ${error}\n`);
    return code;
  };
  if (journal.error) return stop(journal.error, 1);
  const resolved = await resolveInput(target, options.type, json, io);
  if (!resolved.ok) return stop(resolved.error, 2);

  const r = await saveItem(journal, listNotes(journal.path), { purl: resolved.purl, skillPath: resolved.skillPath, source: target, verdict: text }, io);
  const warnings = [...journal.warnings, ...r.notices, ...r.warnings];
  if (json) {
    const document = { id: r.id, journal: journal.scope, path: r.path, created: r.result === "created", status: r.status, warnings };
    io.out(`${JSON.stringify(r.error === null ? document : { ...document, error: r.error })}\n`);
    return r.error === null ? 0 : 1;
  }

  for (const warning of [...journal.warnings, ...r.warnings]) io.err(`warning: ${warning}\n`);
  for (const notice of r.notices) io.err(`${notice}\n`);
  const where = journal.scope === "personal" ? "your personal journal" : "the project journal";
  const name = r.name ?? r.id;
  if (r.result === "created") io.err(`✔ Saved to ${where}: ${name}\n`);
  else if (r.result === "updated") io.err(`✔ Updated in ${where}: ${name}\n`);
  else if (r.result === "unchanged") io.err(`Already in ${where}: ${name}\n`);
  else io.err(`magpie note: ${r.error}\n`);
  if (r.path) io.out(`${r.path}\n`);
  return r.result === "failed" ? 1 : 0;
}

type Resolved = { ok: true; purl: string; skillPath?: string } | { ok: false; error: string };

// Spec §4: a bare name is typed by the nearest manifests, by --type, or by asking in a terminal.
async function resolveInput(target: string, type: PackageType | undefined, json: boolean, io: Io): Promise<Resolved> {
  const bare = !/^(pkg:|https?:\/\/)/i.test(target.trim());
  if (type && !bare) return { ok: false, error: "--type only applies to a bare package name." };
  let resolution = resolveTarget(target, { manifests: bare ? findManifests(io.cwd) : [], type });
  if (resolution.kind === "ambiguous") {
    const choices: PackageType[] = resolution.candidates.length ? resolution.candidates : ["npm", "pypi", "cargo"];
    if (!io.interactive || json) return { ok: false, error: `${target} could be ${choices.join(", ")}. Add --type ${choices.join("|")}.` };
    const answer = (await io.ask(`Which package type is ${target}? (${choices.join(", ")}) `)).trim() as PackageType;
    if (!choices.includes(answer)) return { ok: false, error: `Not one of ${choices.join(", ")}: ${answer || "(nothing)"}.` };
    resolution = resolveTarget(target, { type: answer });
  }
  if (resolution.kind === "rejected") return { ok: false, error: resolution.reason };
  if (resolution.kind === "ambiguous") return { ok: false, error: `Add --type for ${target}.` };
  return { ok: true, purl: resolution.purl, skillPath: resolution.skillPath };
}
