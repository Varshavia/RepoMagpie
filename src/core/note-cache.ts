// Caches derived from a journal's notes, in <journal>/.cache/ (spec §7, decision 0001): valid while
// every note file has the modification time and size recorded with it; rebuildable and safe to
// delete. A cache that can't be read is rebuilt; one that can't be written only costs time.
// Stores file names, not paths, so a journal can be moved. Never prints.
// Also the file rules of decision 0032 (rules 5 and 6), here because every read of a journal's notes
// lists them through noteSignature: a link inside a journal is never followed nor written through,
// and a note file over 256 KB is skipped. What was skipped is kept for the command to report once.
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { removeFolder } from "./copy-folder.ts";
import { readNote, type Note } from "./note.ts";

export type Signature = Record<string, [number, number]>; // note file name → [mtimeMs, size]

// The largest note file or tags.md read, in bytes. The example vault's largest note is 1.5 KB; a
// note with pages of "My notes" is a few dozen KB.
export const NOTE_SIZE_LIMIT = 256 * 1024;

// A path in a journal that can't be read or written, and why, in a sentence that names it.
export interface PathProblem {
  path: string;
  message: string;
}
export const linkProblem = (path: string): PathProblem =>
  ({ path, message: `${path} is a link (a symbolic link or junction); RepoMagpie never follows a link inside a journal` });
const sizeProblem = (path: string): PathProblem => ({ path, message: `${path} is over 256 KB` });

// Why a path inside a journal can't be read or written: a link (a symbolic link or a junction)
// anywhere below the journal's folder, a path outside it, or, with `sizeLimit`, a file over
// NOTE_SIZE_LIMIT. The journal's folder itself may be a link the user made. Null when it can be
// used; a path that doesn't exist yet is fine, since there is nothing to follow.
export function journalPathProblem(journal: string, path: string, sizeLimit = true): PathProblem | null {
  const rel = relative(journal, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return { path, message: `${path} is outside the journal ${journal}` };
  let at = journal;
  for (const part of rel.split(sep)) {
    at = join(at, part);
    let stats;
    try {
      stats = lstatSync(at);
    } catch {
      return null;
    }
    if (stats.isSymbolicLink()) return linkProblem(at);
    if (sizeLimit && at === join(journal, rel) && stats.isFile() && stats.size > NOTE_SIZE_LIMIT) return sizeProblem(at);
  }
  return null;
}

// Throws before a write into a journal that would go through a link, or replace a file over the
// size limit (decision 0032, rules 5 and 6): the error names the path and why.
export function assertWritable(journal: string, path: string, sizeLimit = true): void {
  const problem = journalPathProblem(journal, path, sizeLimit);
  if (problem) throw new Error(`Won't write ${path}: ${problem.message}.`);
}

// What was skipped in this process, by path, and what has been reported already.
const skipped = new Map<string, string>();
const reported = new Set<string>();

export function skip(problem: PathProblem): void {
  skipped.set(problem.path, problem.message);
}

// The problems skipped since the last call, each reported once per process.
export function takeSkipped(): string[] {
  const fresh = [...skipped].filter(([path]) => !reported.has(path));
  for (const [path] of fresh) reported.add(path);
  return fresh.map(([, message]) => message);
}

// The note files of a journal that may be read, sorted, and their signature. A notes/ folder that
// is a link gives none; a note that is a link or over the size limit is left out. Both are skipped
// for the report, and listed in `skipped` for the local app. `folderName` lists another flat folder of
// the journal by the same rules: the trash (decision 0037).
export function noteSignature(journal: string, folderName = "notes"): { files: string[]; signature: Signature; skipped: string[] } {
  const folder = join(journal, folderName);
  const files: string[] = [];
  const signature: Signature = {};
  const skipped: string[] = [];
  const left = (problem: PathProblem) => {
    skip(problem);
    skipped.push(problem.message);
  };
  const problem = journalPathProblem(journal, folder, false);
  if (problem) {
    left(problem);
    return { files, signature, skipped };
  }
  let names: string[];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith(".md")).sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    const path = join(folder, name);
    let stats;
    try {
      stats = lstatSync(path);
    } catch {
      continue; // gone since the folder was read
    }
    if (stats.isSymbolicLink()) left(linkProblem(path));
    else if (stats.isFile() && stats.size > NOTE_SIZE_LIMIT) left(sizeProblem(path));
    else if (stats.isFile()) {
      files.push(name);
      signature[name] = [stats.mtimeMs, stats.size];
    }
  }
  return { files, signature, skipped };
}

// A cache file's path, unless it or the cache folder is a link: then that cache is neither read nor
// written, which only costs time.
function cacheFile(journal: string, name: string): string | null {
  const file = join(journal, ".cache", name);
  const problem = journalPathProblem(journal, file, false);
  if (problem) skip(problem);
  return problem ? null : file;
}

// A journal file other than a note (tags.md) when it can be read: not a link, not over the size
// limit, and there. Otherwise null, and a link or an oversized file is skipped for the report.
export function readableJournalFile(journal: string, path: string): string | null {
  const problem = journalPathProblem(journal, path);
  if (problem) skip(problem);
  if (problem) return null;
  try {
    return lstatSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

// The cached data, when the cache file exists, has this version and matches the signature.
export function readCache(journal: string, name: string, version: number, signature: Signature): unknown {
  const file = cacheFile(journal, name);
  if (!file) return undefined;
  try {
    const cached = JSON.parse(readFileSync(file, "utf8")) as { version?: number; files?: unknown; data?: unknown } | null;
    if (cached?.version === version && JSON.stringify(cached.files) === JSON.stringify(signature)) return cached.data;
  } catch {
    // No cache, or one that can't be read.
  }
  return undefined;
}

// The cached signature and per-file data, whatever the notes are now, for a cache whose entries are
// reused file by file (the note list). Undefined when there is none, or it can't be read.
export function readCacheEntries(journal: string, name: string, version: number): { files: Signature; data: Record<string, unknown> } | undefined {
  const file = cacheFile(journal, name);
  if (!file) return undefined;
  try {
    const cached = JSON.parse(readFileSync(file, "utf8")) as { version?: number; files?: unknown; data?: unknown } | null;
    const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
    if (cached?.version === version && isObject(cached.files) && isObject(cached.data)) return { files: cached.files as Signature, data: cached.data };
  } catch {
    // No cache, or one that can't be read.
  }
  return undefined;
}

// Data derived from each note file, cached per file with its modification time and size (the note
// list, the link index, the graph): only new and changed files are derived again, so a saved note
// doesn't cost a full re-read. `derive` gets the file's name and `parse`, which reads and parses it
// (readNote) at most once per modification time and size in this process, whichever cache asks
// first; it throws as readFileSync does. The result is stored as JSON. `valid`, when given, checks a
// cached entry's shape; one that fails is derived again, so a damaged cache can't break the caller.
// `listed`: the journal's noteSignature, when the caller has it already (one listing for two caches).
export function noteEntries<T>(journal: string, name: string, version: number, derive: (file: string, parse: () => Note) => T, valid?: (entry: unknown) => boolean, listed = noteSignature(journal)): { files: string[]; data: Record<string, T>; skipped: string[] } {
  const { files, signature, skipped } = listed;
  const cached = readCacheEntries(journal, name, version);
  const data: Record<string, T> = {};
  let changed = !cached || Object.keys(cached.files).length !== files.length;
  for (const file of files) {
    const before = cached?.files[file];
    const hit = before && before[0] === signature[file][0] && before[1] === signature[file][1] ? cached?.data[file] : undefined;
    if (hit && (!valid || valid(hit))) data[file] = hit as T;
    else {
      data[file] = derive(file, () => parsedNote(journal, file, signature[file]));
      changed = true;
    }
  }
  if (changed && files.length) writeCache(journal, name, version, signature, data);
  forgetGone(journal, files);
  return { files, data, skipped };
}

// The notes parsed in this process, by journal and file, with the modification time and size they
// were read at (decision 0049): the three caches' cold builds read and parse each note once, not
// three times. Never written anywhere; a file listed no more is forgotten.
const parsed = new Map<string, Map<string, { at: [number, number]; note: Note }>>();

function parsedNote(journal: string, file: string, at: [number, number]): Note {
  let notes = parsed.get(journal);
  if (!notes) parsed.set(journal, (notes = new Map()));
  const kept = notes.get(file);
  if (kept && kept.at[0] === at[0] && kept.at[1] === at[1]) return kept.note;
  const note = readNote(readFileSync(join(journal, "notes", file), "utf8"));
  notes.set(file, { at, note });
  return note;
}

function forgetGone(journal: string, files: string[]): void {
  const notes = parsed.get(journal);
  if (!notes) return;
  const listed = new Set(files);
  for (const file of notes.keys()) if (!listed.has(file)) notes.delete(file);
}

// For the tests: parse every note again, as a new process would.
export function forgetParsed(): void {
  parsed.clear();
}

// Shape checks for the `valid` argument of noteEntries.
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isTextOrNull = (v: unknown): boolean => v === null || typeof v === "string";
export const isTexts = (v: unknown): boolean => Array.isArray(v) && v.every((item) => typeof item === "string");

// Writes the cache whole, then renames it into place, so a reader never sees half a file. On
// Windows another process (antivirus, the search indexer) can hold the file being replaced for a
// moment, and the rename fails with EPERM, EACCES or EBUSY: it is tried again after 5, 10, 15 and
// 20 ms, while the wait still fits in 50 ms from the first try, since the hook reads these caches
// (Windows rounds each wait up to its timer tick, about 15.6 ms, so there it gets three tries more).
// Then it gives up, as for any other error, and removes the temporary file.
const HELD = new Set(["EPERM", "EACCES", "EBUSY"]);
const RENAME_WAITS = [5, 10, 15, 20];
const RENAME_BUDGET = 50; // ms

export function writeCache(journal: string, name: string, version: number, signature: Signature, data: unknown): void {
  const file = cacheFile(journal, name);
  if (!file) return;
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(join(journal, ".cache"), { recursive: true });
    writeFileSync(temporary, JSON.stringify({ version, files: signature, data }));
    replaceFile(temporary, file);
  } catch {
    // A cache that can't be written only costs time on the next run.
    try {
      removeFolder(temporary);
    } catch {
      // The temporary file can't be removed either (no .cache folder, or it is held too).
    }
  }
}

// Renames temporary over file, with the waits above while another process holds it; throws after.
export function replaceFile(temporary: string, file: string): void {
  const started = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(temporary, file);
      return;
    } catch (error) {
      const wait = RENAME_WAITS[attempt];
      if (!HELD.has((error as NodeJS.ErrnoException).code ?? "") || wait === undefined || performance.now() - started + wait > RENAME_BUDGET) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait); // a synchronous pause
    }
  }
}
