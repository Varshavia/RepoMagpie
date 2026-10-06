// The shared JSON documents (spec §2, "Shared JSON documents"; decision 0023): Settings, Tag list,
// Note list, Note and Note preview, and the edit of one note. The local app's API returns them as
// they are. Notes are found only by their id, or by a file name equal to one in the journal's
// notes/ listing: no request text is ever joined to a path. Never prints.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { editNote, noteVersion } from "./edit.ts";
import { journalTagList, listNotes, STARTER_TAGS, type Place } from "./journals.ts";
import { DRAFT_MARKER, readNote } from "./note.ts";
import { noteSignature, readCacheEntries, writeCache } from "./note-cache.ts";
import type { Outcome } from "./outcome.ts";
import { locateJournal, resolveInput, saveItem, type Context, type Journal } from "./save.ts";
import { packageVersion } from "./version.ts";

type Scope = Journal["scope"];
type Result<T> = { outcome: Outcome; document: T };

const SCOPES: readonly string[] = ["personal", "project"];

// --- Settings ---

export interface SettingsJson {
  version: string;
  home: string; // the home directory, so the app can show paths under it with ~
  journals: { personal: { path: string; exists: boolean }; project: { path: string; exists: boolean } | null };
  github_token_set: boolean;
}

export function settingsDocument(place: Place): SettingsJson {
  const personal = locateJournal("personal", place);
  const project = locateJournal("project", place);
  return {
    version: packageVersion(),
    home: place.home,
    journals: {
      personal: { path: personal.path, exists: existsSync(personal.path) },
      project: project.error ? null : { path: project.path, exists: existsSync(project.path) },
    },
    github_token_set: Boolean(place.env.GITHUB_TOKEN),
  };
}

// --- Tag list ---

export interface TagListJson {
  journal: Scope;
  tags: string[];
  exists: boolean; // whether the journal has its tags.md
  error?: string;
}

export function tagListDocument(scope: Scope, place: Place): Result<TagListJson> {
  const journal = locateJournal(scope, place);
  if (journal.error) return { outcome: "failed", document: { journal: scope, tags: [], exists: false, error: journal.error } };
  return { outcome: "ok", document: { journal: scope, tags: journalTagList(journal.path), exists: existsSync(join(journal.path, "tags.md")) } };
}

// "Create tag list" in the app: the starter list, written to a journal without tags.md, only on the
// user's click (spec §3, schema rule 5). An existing tags.md is never overwritten.
export function createTagList(scope: Scope, place: Place): Result<TagListJson> {
  const journal = locateJournal(scope, place);
  if (journal.error) return tagListDocument(scope, place);
  try {
    mkdirSync(journal.path, { recursive: true });
    writeFileSync(join(journal.path, "tags.md"), STARTER_TAGS, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      return { outcome: "failed", document: { journal: scope, tags: [], exists: false, error: `Couldn't write tags.md: ${(error as Error).message}` } };
    }
  }
  return tagListDocument(scope, place);
}

// --- Note list ---

export interface NoteSummary {
  id: string | null;
  file: string;
  name: string | null;
  kind: string | null;
  tags: string[];
  status: "inbox" | "reviewed";
  verdict: string;
  tried: boolean;
  rating: number | null;
  explored: string | null;
  read_only: boolean;
}

export interface NoteListJson {
  journal: Scope;
  count: number;
  notes: NoteSummary[];
  error?: string;
}

export interface NoteFilters {
  status?: "inbox" | "reviewed";
  kind?: string;
  tags?: string[]; // every tag must be present
}

export function noteListDocument(scope: Scope, filters: NoteFilters, place: Place): Result<NoteListJson> {
  const journal = locateJournal(scope, place);
  if (journal.error) return { outcome: "failed", document: { journal: scope, count: 0, notes: [], error: journal.error } };
  const notes = summaries(journal.path)
    .filter((n) => (!filters.status || n.status === filters.status) && (!filters.kind || n.kind === filters.kind) && (filters.tags ?? []).every((tag) => n.tags.includes(tag)))
    .sort((a, b) => compare((a.name ?? a.file).toLowerCase(), (b.name ?? b.file).toLowerCase()) || compare(a.file, b.file));
  return { outcome: "ok", document: { journal: scope, count: notes.length, notes } };
}

// Every note's summary. The note-list cache (spec §7) keeps one per file with its modification time
// and size; only new and changed files are read again, so a saved note doesn't cost a full re-read.
const NOTE_LIST_CACHE = "note-list.json";
const NOTE_LIST_VERSION = 1;

function summaries(journal: string): NoteSummary[] {
  const { files, signature } = noteSignature(journal);
  const cached = readCacheEntries(journal, NOTE_LIST_CACHE, NOTE_LIST_VERSION);
  const data: Record<string, NoteSummary> = {};
  let changed = !cached || Object.keys(cached.files).length !== files.length;
  for (const file of files) {
    const before = cached?.files[file];
    const hit = before && before[0] === signature[file][0] && before[1] === signature[file][1] ? cached?.data[file] : undefined;
    if (hit) data[file] = hit as NoteSummary;
    else {
      data[file] = summary(file, readNote(readFileSync(join(journal, "notes", file), "utf8")));
      changed = true;
    }
  }
  if (changed && files.length) writeCache(journal, NOTE_LIST_CACHE, NOTE_LIST_VERSION, signature, data);
  return files.map((file) => data[file]);
}

function summary(file: string, note: ReturnType<typeof readNote>): NoteSummary {
  const fm = note.frontmatter;
  const id = readableId(note);
  return {
    id,
    file,
    name: typeof fm.name === "string" ? fm.name : null,
    kind: typeof fm.kind === "string" ? fm.kind : null,
    tags: textList(fm.tags),
    status: note.status,
    verdict: note.verdict,
    tried: fm.tried === true,
    rating: Number.isInteger(fm.rating) ? (fm.rating as number) : null,
    explored: typeof fm.explored === "string" ? fm.explored : null,
    read_only: id === null,
  };
}

// --- Note ---

export interface NoteJson {
  id: string | null;
  journal: Scope;
  file: string | null;
  path: string | null;
  version: string | null;
  read_only: boolean;
  status: "inbox" | "reviewed" | null;
  verdict: string | null;
  frontmatter: Record<string, unknown>;
  sections: { name: string | null; heading: string; body: string; draft: boolean }[];
  skills: { name: string; text: string }[];
  warnings: string[];
  error?: string;
}

// How the app addresses a note: by its id, or (for a read-only note) by its file name.
export type NoteAddress = { id: string } | { file: string };

// The note's path, when the address names a note in the journal's notes/ listing.
export function locateNote(scope: Scope, address: NoteAddress, place: Place): { journal: Journal; path: string | null } {
  const journal = locateJournal(scope, place);
  if (journal.error) return { journal, path: null };
  if ("id" in address) return { journal, path: listNotes(journal.path).find((entry) => entry.id === address.id)?.path ?? null };
  const file = noteFiles(journal.path).find((name) => name === address.file);
  return { journal, path: file ? join(journal.path, "notes", file) : null };
}

// The journal's tags.md, when it exists ("Edit tag list" in the app opens it).
export function tagListPath(scope: Scope, place: Place): string | null {
  const journal = locateJournal(scope, place);
  if (journal.error) return null;
  const path = join(journal.path, "tags.md");
  return existsSync(path) ? path : null;
}

export function noteDocument(scope: Scope, address: NoteAddress, place: Place): Result<NoteJson> {
  const { journal, path } = locateNote(scope, address, place);
  if (journal.error) return { outcome: "failed", document: { ...emptyNote(scope), error: journal.error } };
  if (!path) return { outcome: "not-found", document: { ...emptyNote(scope), error: "No note with that id or file name in this journal." } };
  return { outcome: "ok", document: noteJson(scope, path, readFileSync(path)) };
}

export function emptyNote(scope: Scope): NoteJson {
  return { id: null, journal: scope, file: null, path: null, version: null, read_only: false, status: null, verdict: null, frontmatter: {}, sections: [], skills: [], warnings: [] };
}

function noteJson(scope: Scope, path: string, bytes: Buffer): NoteJson {
  const note = readNote(bytes.toString("utf8"));
  const id = readableId(note);
  const warnings = [...note.warnings];
  if (!note.hasFrontmatter) warnings.push("The note has no frontmatter.");
  else if (id === null && !note.warnings.length) warnings.push("The note has no id.");
  if (id === null) warnings[warnings.length - 1] += " It is read-only here; open it in an editor to fix it.";
  const skills = (note.sections.find((s) => s.name === "Notable skills")?.body ?? "").split("\n").flatMap((line) => {
    const match = line.match(/^\s*[-*]\s+`([^`]+)`\s*(?:—|--?)\s*(.*)$/);
    return match ? [{ name: match[1], text: match[2].trim() }] : [];
  });
  return {
    id,
    journal: scope,
    file: basename(path),
    path,
    version: noteVersion(bytes),
    read_only: id === null,
    status: note.status,
    verdict: note.verdict,
    frontmatter: note.frontmatter,
    sections: note.sections.map(({ name, heading, body, draft }) => ({ name, heading, body, draft })),
    skills,
    warnings,
  };
}

// --- Editing one note (PATCH; decision 0023) ---

const CONFLICT = "This note changed on disk since you opened it. Reload to see the new version.";

// {journal, id, version, verdict?, sections?, fields?, accept_drafts?}. The version must be the
// file's current one, or nothing is written ("conflict", with the current note).
export function patchNote(request: Record<string, unknown>, place: Place): Result<NoteJson> {
  const { journal: scope, id, version, ...edits } = request;
  const scopeName: Scope = scope === "project" ? "project" : "personal";
  const usage = (error: string): Result<NoteJson> => ({ outcome: "usage", document: { ...emptyNote(scopeName), error } });
  if (typeof scope !== "string" || !SCOPES.includes(scope)) return usage("journal must be personal or project.");
  if (typeof id !== "string") return usage("id must be the note's PURL.");
  if (typeof version !== "string") return usage("version must be the version the note was read with.");

  const read = noteDocument(scopeName, { id }, place);
  if (read.outcome !== "ok" || !read.document.path) return read;
  const path = read.document.path;
  const current = read.document;
  if (current.version !== version) return { outcome: "conflict", document: { ...current, error: CONFLICT } };
  const edit = editNote(readFileSync(path, "utf8"), edits);
  if (!edit.ok) return { outcome: "usage", document: { ...current, error: edit.error } };
  if (!edit.changed) return read;

  const now = readFileSync(path);
  if (noteVersion(now) !== version) return { outcome: "conflict", document: { ...noteJson(scopeName, path, now), error: CONFLICT } };
  try {
    writeFileSync(path, edit.text);
  } catch (error) {
    return { outcome: "failed", document: { ...current, error: `Couldn't write ${path}: ${(error as Error).message}` } };
  }
  return { outcome: "ok", document: noteJson(scopeName, path, Buffer.from(edit.text)) };
}

// --- Note preview ---

export interface NotePreviewJson {
  id: string | null;
  journal: Scope;
  path: string | null;
  exists: boolean;
  verdict: string | null;
  name: string | null;
  url: string | null;
  what_it_does: string | null;
  language: string | null;
  license: string | null;
  topics: string[];
  kind: string | null;
  tags: string[];
  packages: string[];
  skills: string[];
  warnings: string[];
  error?: string;
}

export function emptyPreview(scope: Scope): NotePreviewJson {
  return { id: null, journal: scope, path: null, exists: false, verdict: null, name: null, url: null, what_it_does: null, language: null, license: null, topics: [], kind: null, tags: [], packages: [], skills: [], warnings: [] };
}

// What magpie note <target> would write, without writing: a dry run of the same save, read back.
export async function previewNote(request: { target: string; type?: "npm" | "pypi" | "cargo"; to: Scope }, context: Context): Promise<Result<NotePreviewJson>> {
  const journal = locateJournal(request.to, context);
  const fail = (outcome: Outcome, error: string, id: string | null = null): Result<NotePreviewJson> =>
    ({ outcome, document: { ...emptyPreview(request.to), id, warnings: journal.warnings, error } });
  if (journal.error) return fail("failed", journal.error);
  const resolved = await resolveInput(request.target, request.type, context.cwd);
  if (!resolved.ok) return fail("usage", resolved.error);

  const saved = await saveItem(journal, listNotes(journal.path), { purl: resolved.purl, skillPath: resolved.skillPath, source: request.target }, context, true);
  if (saved.text === null) return fail("failed", saved.error ?? "The note can't be previewed.", saved.id);
  const note = readNote(saved.text);
  const fm = note.frontmatter;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const whatItDoes = (note.sections.find((s) => s.name === "What it does")?.body ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(DRAFT_MARKER, "").trim();
  const exists = saved.result !== "created";
  return {
    outcome: "ok",
    document: {
      id: saved.id,
      journal: request.to,
      path: saved.path,
      exists,
      verdict: exists ? note.verdict : null,
      name: text(fm.name),
      url: text(fm.url),
      what_it_does: whatItDoes || null,
      language: text(fm.language),
      license: text(fm.license),
      topics: textList(fm.topics),
      kind: text(fm.kind),
      tags: textList(fm.tags),
      packages: textList(fm.packages),
      skills: (note.sections.find((s) => s.name === "Notable skills")?.body ?? "").split("\n").flatMap((line) => line.match(/^\s*[-*]\s+`([^`]+)`/)?.[1] ?? []),
      warnings: [...journal.warnings, ...saved.warnings],
    },
  };
}

// --- helpers ---

// The .md files in <journal>/notes/, sorted; none when the folder doesn't exist.
function noteFiles(journal: string): string[] {
  try {
    return readdirSync(join(journal, "notes")).filter((name) => name.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

// A note is editable only with readable frontmatter that has an id (decision 0023).
function readableId(note: ReturnType<typeof readNote>): string | null {
  return note.hasFrontmatter && !note.warnings.length && typeof note.frontmatter.id === "string" ? note.frontmatter.id : null;
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
