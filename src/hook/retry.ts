// The retry record (decision 0036). Where an agent can't ask, the hook denies the first try of an
// install the user noted to avoid, and lets the same install through until 10 minutes after that
// deny. <personal journal>/.cache/hook-retry.json holds a SHA-256 per stopped install with the
// time of its deny: no command text and no package names. It is never written through a link, and
// is written whole, then renamed into place. Two hooks writing at the same moment: the last one
// wins, and the other's install is denied once more.
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { removeFolder } from "../core/copy-folder.ts";
import { isRecord, journalPathProblem, replaceFile } from "../core/note-cache.ts";

export const RETRY_WINDOW = 10 * 60_000; // ms
const MAX_BYTES = 256 * 1024; // a larger record isn't read: it is replaced
const MAX_ENTRIES = 1_000;
const KEY = /^[0-9a-f]{64}$/;

export const retryFile = (journal: string) => join(journal, ".cache", "hook-retry.json");

// The same install: the same agent, the same folder and the same packages (type and name, sorted),
// however the command wrote them (npm, npm.cmd, & npm …).
export function retryKey(agent: string, folder: string, installs: { type: string; name: string }[]): string {
  const packages = [...new Set(installs.map((install) => `${install.type}:${install.name}`))].sort();
  return createHash("sha256").update(JSON.stringify([agent, folder, packages])).digest("hex");
}

// "pass": this install was denied less than 10 minutes ago. "deny": it wasn't, and the deny is now
// recorded. "unavailable": the record can't be read or written, so the caller must not deny.
export function retryDecision(journal: string, key: string, now = Date.now()): "pass" | "deny" | "unavailable" {
  const file = retryFile(journal);
  try {
    if (!statSync(journal).isDirectory() || journalPathProblem(journal, file, false)) return "unavailable";
  } catch {
    return "unavailable"; // no personal journal
  }
  const entries = read(file);
  if (entries === null) return "unavailable";
  const fresh = (time: number) => time <= now && now - time < RETRY_WINDOW;
  if (Object.hasOwn(entries, key) && fresh(entries[key])) return "pass";

  const kept = Object.entries(entries).filter(([k, time]) => k !== key && fresh(time)).sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES - 1);
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    mkdirSync(join(journal, ".cache"), { recursive: true });
    if (journalPathProblem(journal, file, false)) return "unavailable"; // .cache became a link
    writeFileSync(temporary, JSON.stringify({ version: 1, entries: Object.fromEntries([[key, now], ...kept]) }), { flag: "wx", mode: 0o600 });
    replaceFile(temporary, file);
    return "deny";
  } catch {
    try {
      removeFolder(temporary);
    } catch {
      // Nothing more to do.
    }
    return "unavailable";
  }
}

// The record's entries; {} for a missing, oversized or malformed record (the next deny replaces
// it), null when it exists but can't be read. On macOS and Linux, also {} for a record another user
// owns or could have written (group or others may write it): its entries would let installs through
// unasked. On Windows the folder's permissions decide, as for the notes.
function read(file: string): Record<string, number> | null {
  let text: string;
  try {
    const stats = lstatSync(file);
    if (!stats.isFile() || stats.size > MAX_BYTES) return stats.isFile() ? {} : null;
    if (process.getuid && (stats.uid !== process.getuid() || (stats.mode & 0o022) !== 0)) return {};
    text = readFileSync(file, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? {} : null;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.entries)) return {};
  return Object.fromEntries(Object.entries(data.entries).filter((entry): entry is [string, number] => KEY.test(entry[0]) && Number.isFinite(entry[1])));
}
