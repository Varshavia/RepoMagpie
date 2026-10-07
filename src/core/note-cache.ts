// Caches derived from a journal's notes, in <journal>/.cache/ (spec §7, decision 0001): valid while
// every note file has the modification time and size recorded with it; rebuildable and safe to
// delete. A cache that can't be read is rebuilt; one that can't be written only costs time.
// Stores file names, not paths, so a journal can be moved. Never prints.
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
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
// a full re-read. `derive` gets the file's name and path; the result is stored as JSON.
export function noteEntries<T>(journal: string, name: string, version: number, derive: (file: string, path: string) => T): { files: string[]; data: Record<string, T> } {
  const { files, signature } = noteSignature(journal);
  const cached = readCacheEntries(journal, name, version);
  const data: Record<string, T> = {};
  let changed = !cached || Object.keys(cached.files).length !== files.length;
  for (const file of files) {
    const before = cached?.files[file];
    const hit = before && before[0] === signature[file][0] && before[1] === signature[file][1] ? cached?.data[file] : undefined;
    if (hit) data[file] = hit as T;
    else {
      data[file] = derive(file, join(journal, "notes", file));
      changed = true;
    }
  }
  if (changed && files.length) writeCache(journal, name, version, signature, data);
  return { files, data };
}

// Writes the cache whole, then renames it into place, so a reader never sees half a file.
export function writeCache(journal: string, name: string, version: number, signature: Signature, data: unknown): void {
  try {
    mkdirSync(join(journal, ".cache"), { recursive: true });
    const file = join(journal, ".cache", name);
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version, files: signature, data }));
    renameSync(temporary, file);
  } catch {
    // A cache that can't be written only costs time on the next run.
  }
}
