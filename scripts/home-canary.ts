// The real personal journal must never change during the test suite (CLAUDE.md section 10).
// A snapshot is read-only: every path under the folder with its size and modification time.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type Snapshot = Map<string, string> | null; // null: the folder doesn't exist

export function snapshot(dir: string): Snapshot {
  try {
    if (!statSync(dir).isDirectory()) return new Map([[".", "not a folder"]]);
  } catch {
    return null;
  }
  const entries = new Map<string, string>();
  for (const name of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const stat = statSync(join(dir, name));
    entries.set(relative(dir, join(dir, name)), stat.isDirectory() ? `dir ${stat.mtimeMs}` : `${stat.size} bytes ${stat.mtimeMs}`);
  }
  return entries;
}

// What changed between two snapshots, one line per path; empty when nothing did.
export function changes(before: Snapshot, after: Snapshot): string[] {
  if (before === null || after === null) return before === after ? [] : [before === null ? "the folder was created" : "the folder was removed"];
  const lines: string[] = [];
  for (const [path, value] of after) {
    if (!before.has(path)) lines.push(`added ${path}`);
    else if (before.get(path) !== value) lines.push(`changed ${path}`);
  }
  for (const path of before.keys()) if (!after.has(path)) lines.push(`removed ${path}`);
  return lines;
}
