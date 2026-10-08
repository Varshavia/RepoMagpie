// Caches derived from a journal's notes, in <journal>/.cache/ (spec §7, decision 0001): valid while
// every note file has the modification time and size recorded with it; rebuildable and safe to
// delete. A cache that can't be read is rebuilt; one that can't be written only costs time.
// Stores file names, not paths, so a journal can be moved. Never prints.
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Signature = Record<string, [number, number]>; // note file name → [mtimeMs, size]

// The note files of a journal, sorted, and their signature.
export function noteSignature(journal: string): { files: string[]; signature: Signature } {
  const folder = join(journal, "notes");
  let files: string[];
  try {
    files = readdirSync(folder).filter((name) => name.endsWith(".md")).sort();
  } catch {
    files = [];
  }
  const signature: Signature = {};
  for (const file of files) {
    const { mtimeMs, size } = statSync(join(folder, file));
    signature[file] = [mtimeMs, size];
  }
  return { files, signature };
}

// The cached data, when the cache file exists, has this version and matches the signature.
export function readCache(journal: string, name: string, version: number, signature: Signature): unknown {
  try {
    const cached = JSON.parse(readFileSync(join(journal, ".cache", name), "utf8")) as { version?: number; files?: unknown; data?: unknown } | null;
    if (cached?.version === version && JSON.stringify(cached.files) === JSON.stringify(signature)) return cached.data;
  } catch {
    // No cache, or one that can't be read.
  }
  return undefined;
}

// The cached signature and per-file data, whatever the notes are now, for a cache whose entries are
// reused file by file (the note list). Undefined when there is none, or it can't be read.
export function readCacheEntries(journal: string, name: string, version: number): { files: Signature; data: Record<string, unknown> } | undefined {
  try {
    const cached = JSON.parse(readFileSync(join(journal, ".cache", name), "utf8")) as { version?: number; files?: unknown; data?: unknown } | null;
    const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
    if (cached?.version === version && isObject(cached.files) && isObject(cached.data)) return { files: cached.files as Signature, data: cached.data };
  } catch {
    // No cache, or one that can't be read.
  }
  return undefined;
}

// Data derived from each note file, cached per file with its modification time and size (the note
// list, the link index): only new and changed files are derived again, so a saved note doesn't cost
// a full re-read. `derive` gets the file's name and path; the result is stored as JSON. `valid`, when
// given, checks a cached entry's shape; one that fails is derived again, so a damaged cache can't break
// the caller.
export function noteEntries<T>(journal: string, name: string, version: number, derive: (file: string, path: string) => T, valid?: (entry: unknown) => boolean): { files: string[]; data: Record<string, T> } {
  const { files, signature } = noteSignature(journal);
  const cached = readCacheEntries(journal, name, version);
  const data: Record<string, T> = {};
  let changed = !cached || Object.keys(cached.files).length !== files.length;
  for (const file of files) {
    const before = cached?.files[file];
    const hit = before && before[0] === signature[file][0] && before[1] === signature[file][1] ? cached?.data[file] : undefined;
    if (hit && (!valid || valid(hit))) data[file] = hit as T;
    else {
      data[file] = derive(file, join(journal, "notes", file));
      changed = true;
    }
  }
  if (changed && files.length) writeCache(journal, name, version, signature, data);
  return { files, data };
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
  const file = join(journal, ".cache", name);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(join(journal, ".cache"), { recursive: true });
    writeFileSync(temporary, JSON.stringify({ version, files: signature, data }));
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
  } catch {
    // A cache that can't be written only costs time on the next run.
    try {
      rmSync(temporary, { force: true });
    } catch {
      // The temporary file can't be removed either (no .cache folder, or it is held too).
    }
  }
}
