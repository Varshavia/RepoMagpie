// Deleting a note (decision 0037): its file moves to the journal's trash, <journal>/.trash/, never
// removed outright, with a UTC stamp before its extension (npm--pdfkit.20261023-093900Z.md), so two
// deletes of the same note never collide. Nothing reads .trash/ as notes: every listing reads notes/
// only (noteSignature). A note is found as GET /api/note finds it, by id or by a file name in the
// notes/ listing; no request text is joined to a path. When a version is given, it must be the
// file's (decision 0023). Undo (restoreNote) moves a file back under its original name. Only a person
// deletes: the CLI asks, the app confirms, and no agent tool calls this. Never prints.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { locateNote, type NoteAddress } from "./documents.ts";
import { noteVersion } from "./edit.ts";
import { manifestTypes, readablePurl, resolveTarget, type PackageType } from "./identity.ts";
import { findManifests, type Place } from "./journals.ts";
import { linkEntries, linkIndex, type Backlink } from "./links.ts";
import { readableId, readNote } from "./note.ts";
import { assertWritable, journalPathProblem, noteSignature, replaceFile } from "./note-cache.ts";
import type { Outcome } from "./outcome.ts";
import { openRecallSources, recall } from "./recall.ts";
import { locateJournal, type Journal } from "./save.ts";
import { CAPS, forAgent } from "./text.ts";

type Scope = Journal["scope"];
type Result<T> = { outcome: Outcome; document: T };

export const TRASH = ".trash";

// The --json document of repomagpie delete, and the answer of POST /api/note/delete (spec §2).
export interface DeleteJson {
  id: string | null; // null for a read-only note, addressed by its file name
  name: string | null;
  journal: Scope;
  file: string | null;
  path: string | null;
  version: string | null; // the version that was (or, in a dry run, would be) deleted
  trash: string | null; // where the file went, or would go
  deleted: boolean; // false in a dry run and on failure
  backlinks: Backlink[]; // the notes that link to it; "from": "alternatives" lists it as an alternative
  warnings: string[];
  error?: string;
}

export interface DeleteRequest {
  journal: Scope;
  address: NoteAddress;
  version?: string; // the version the person saw; the app always sends it
  dryRun?: boolean; // what would happen, without moving anything: the confirm dialog and the CLI prompt
}

const CONFLICT = "This note changed on disk since you opened it. Reload to see the new version.";

export function emptyDelete(scope: Scope): DeleteJson {
  return { id: null, name: null, journal: scope, file: null, path: null, version: null, trash: null, deleted: false, backlinks: [], warnings: [] };
}

export function deleteNote(request: DeleteRequest, place: Place, now = new Date()): Result<DeleteJson> {
  const { journal, path } = locateNote(request.journal, request.address, place);
  const fail = (outcome: Outcome, error: string, document: Partial<DeleteJson> = {}): Result<DeleteJson> =>
    ({ outcome, document: forDocument({ ...emptyDelete(request.journal), warnings: journal.warnings, ...document, error }) });
  if (journal.error) return fail("failed", journal.error);
  if (!path || journalPathProblem(journal.path, path)) return fail("not-found", "No note with that id or file name in this journal.");

  const bytes = readFileSync(path);
  const note = readNote(bytes.toString("utf8"));
  const id = readableId(note);
  const file = basename(path);
  const found: Partial<DeleteJson> = {
    id,
    name: typeof note.frontmatter.name === "string" ? note.frontmatter.name : id ? readablePurl(id) : null,
    file,
    path,
    version: noteVersion(bytes),
    backlinks: linkIndex(journal.path, linkEntries(journal.path)).incoming[file] ?? [],
  };
  if (request.version !== undefined && request.version !== found.version) return fail("conflict", CONFLICT, found);

  const trashFolder = join(journal.path, TRASH);
  const blocked = journalPathProblem(journal.path, join(trashFolder, file), false); // .trash/ as a link
  if (blocked) return fail("failed", `Won't move ${path} to the trash: ${blocked.message}.`, found);
  const trash = join(trashFolder, freeName(trashFolder, trashName(file, now)));
  if (request.dryRun) return { outcome: "ok", document: forDocument({ ...emptyDelete(request.journal), warnings: journal.warnings, ...found, trash }) };

  const warnings = [...journal.warnings];
  if (request.journal === "project") {
    try {
      ignoreTrash(journal.path);
    } catch (error) {
      warnings.push(`Couldn't add ${TRASH}/ to ${join(journal.path, ".gitignore")}: ${(error as Error).message} git may list the trash as new files.`);
    }
  }
  try {
    // Checked again just before the move, so a change made while the person decided is never lost.
    if (noteVersion(readFileSync(path)) !== found.version) return fail("conflict", CONFLICT, found);
    mkdirSync(trashFolder, { recursive: true });
    assertWritable(journal.path, trash, false);
    if (lstatExists(trash)) throw new Error(`${trash} appeared meanwhile`);
    replaceFile(path, trash); // tried again while antivirus holds the file (EPERM, EACCES, EBUSY)
  } catch (error) {
    return fail("failed", `Couldn't move ${path} to the trash: ${(error as Error).message}`, { ...found, warnings });
  }
  return { outcome: "ok", document: forDocument({ ...emptyDelete(request.journal), ...found, warnings, trash, deleted: true }) };
}

// The answer of POST /api/note/restore: Undo in the app.
export interface RestoreJson {
  journal: Scope;
  trash: string | null; // the file in the trash
  path: string | null; // where it goes back to: notes/<its original name>
  id: string | null;
  name: string | null;
  restored: boolean;
  error?: string;
}

// Moves a file from the trash back to notes/ under its original name (the trash name without its
// stamp). `trash` must be a name in the trash folder's listing; it is never joined to a path. A note
// with that name in notes/ now is never replaced: the file stays in the trash.
export function restoreNote(request: { journal: Scope; trash: string }, place: Place): Result<RestoreJson> {
  const located = locateJournal(request.journal, place);
  const empty: RestoreJson = { journal: request.journal, trash: null, path: null, id: null, name: null, restored: false };
  const fail = (outcome: Outcome, error: string, document: Partial<RestoreJson> = {}): Result<RestoreJson> =>
    ({ outcome, document: forRestore({ ...empty, ...document, error }) });
  if (located.error) return fail("failed", located.error);
  const folder = join(located.path, TRASH);
  const listed = trashFiles(located.path).find((name) => name === request.trash);
  const original = listed?.match(STAMPED)?.[1];
  if (!listed || !original) return fail("not-found", "No file with that name in this journal's trash.");

  const from = join(folder, listed);
  const to = join(located.path, "notes", `${original}.md`);
  const note = readNote(readFileSync(from, "utf8"));
  const id = readableId(note);
  const found = { trash: from, path: to, id, name: typeof note.frontmatter.name === "string" ? note.frontmatter.name : id ? readablePurl(id) : null };
  const label = found.name ?? `${original}.md`;
  if (lstatExists(to)) return fail("failed", `A note named ${original}.md is in notes/ now, so ${label} stays in the trash: ${from}`, found);
  try {
    assertWritable(located.path, to);
    mkdirSync(join(located.path, "notes"), { recursive: true });
    replaceFile(from, to);
  } catch (error) {
    return fail("failed", `Couldn't move ${from} back to notes/: ${(error as Error).message}`, found);
  }
  return { outcome: "ok", document: forRestore({ ...empty, ...found, restored: true }) };
}

// The notes repomagpie delete <name> may mean (spec §2): exact matches of the name, a PURL or a URL
// in both journals, as recall finds them, project journal first; a bare name's type comes from the
// nearest manifests, else every type. `nameOnly` lists the notes recall would match by name only,
// which are never deleted by that name: the message names them.
export interface DeleteCandidate {
  journal: Scope;
  file: string;
  id: string;
  name: string;
  verdict: string | null;
}

export function deleteCandidates(query: string, scope: Scope | undefined, place: Place): { candidates: DeleteCandidate[]; nameOnly: DeleteCandidate[]; warnings: string[] } {
  const url = /^https?:\/\//i.test(query.trim()) ? resolveTarget(query) : null;
  const wanted = url?.kind === "ok" ? url.purl : query;
  const fromManifests = manifestTypes(findManifests(place.cwd));
  const types: PackageType[] = fromManifests.length ? fromManifests : ["npm", "pypi", "cargo"];
  const { sources, warnings } = openRecallSources(place);
  const matches = recall(sources.filter((source) => !scope || source.scope === scope), wanted, types)
    .map((m) => ({ journal: m.journal, file: basename(m.path), id: m.id, name: m.name, verdict: m.verdict, exact: m.confidence === "exact" }));
  const strip = ({ exact: _exact, ...candidate }: (typeof matches)[number]): DeleteCandidate => candidate;
  return { candidates: matches.filter((m) => m.exact).map(strip), nameOnly: matches.filter((m) => !m.exact).map(strip), warnings };
}

// <stem>.<YYYYMMDD-HHMMSS>Z<-n>.md
const STAMPED = /^(.+)\.\d{8}-\d{6}Z(?:-\d+)?\.md$/;

function trashName(file: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.\d+Z$/, "Z");
  return `${file.slice(0, -".md".length)}.${stamp}.md`;
}

// The name, or with -2, -3, … before .md when the trash holds it already (two deletes in one second).
function freeName(folder: string, name: string): string {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : name.replace(/\.md$/, `-${n}.md`);
    if (!lstatExists(join(folder, candidate))) return candidate;
  }
}

// The files in the trash, by name, without links and files over the size limit: the same listing as
// a journal's notes, of .trash/ instead of notes/.
function trashFiles(journal: string): string[] {
  return noteSignature(journal, TRASH).files;
}

// A project journal's .gitignore lists .trash/ (spec §3): added to one written before the trash
// existed, with the file's own line endings; the rest stays byte for byte. Never through a link.
export function ignoreTrash(journal: string): void {
  const file = join(journal, ".gitignore");
  assertWritable(journal, file);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text.split(/\r?\n/).some((line) => /^\/?\.trash\/?$/.test(line.trim()))) return;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  writeFileSync(file, `${text === "" || text.endsWith("\n") ? text : text + eol}${text === "" ? `.cache/${eol}` : ""}${TRASH}/${eol}`);
}

function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

// Names come from notes and paths may carry them: hidden characters as markers (decision 0032), as in
// every document a command prints.
const BACKLINK_CAPS = { id: CAPS.id, name: CAPS.name, from: CAPS.other };
const forDocument = (document: DeleteJson): DeleteJson =>
  forAgent({ ...document, backlinks: document.backlinks.map((b) => forAgent(b, BACKLINK_CAPS)) }, { id: CAPS.id, name: CAPS.name, path: Infinity, trash: Infinity, warnings: { each: Infinity, count: Infinity }, error: Infinity });
const forRestore = (document: RestoreJson): RestoreJson => forAgent(document, { id: CAPS.id, name: CAPS.name, path: Infinity, trash: Infinity, error: Infinity });
