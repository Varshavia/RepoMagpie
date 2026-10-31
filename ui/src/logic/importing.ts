// Import (docs/ui.md §7): the words of the check's table and the summary, from magpie import --json.
// Which lines are items is core's parser, which the app runs too (pure, no imports).
import { importLines, parseImport } from "../../../src/core/import.ts";
import type { ImportJson } from "../../../src/core/save.ts";

export { noItemsHint } from "../../../src/core/import.ts";

type Result = ImportJson["items"][number]["result"] | "skipped";

export function countItems(text: string): number {
  return parseImport(text).items.length;
}

// A row of the table: the line as pasted, the note it becomes, and its status, with why.
export interface Row {
  line: number;
  text: string;
  becomes: string | null; // the note's id
  result: Result;
  status: string;
  why: string; // the error or the reason it was skipped, then any warnings
}

const STATUS: Record<Result, [check: string, done: string]> = {
  created: ["new", "created"],
  updated: ["in your journal; adds to it", "updated"],
  unchanged: ["already in your journal", "already in your journal"],
  failed: ["can't import", "failed"],
  skipped: ["skipped", "skipped"],
};

export function rows(doc: ImportJson, text: string, dryRun: boolean): Row[] {
  const lines = importLines(text);
  const row = (line: number, becomes: string | null, result: Result, why: string): Row => ({ line, text: (lines[line - 1] ?? "").trim(), becomes, result, status: STATUS[result][dryRun ? 0 : 1], why });
  return [
    ...doc.items.map((i) => row(i.line, i.id, i.result, [i.error, ...i.warnings].filter(Boolean).join(" "))),
    ...doc.skipped.map((s) => row(s.line, null, "skipped", s.reason)),
  ].sort((a, b) => a.line - b.line);
}

// The lines an import would write: new notes and notes it adds to.
export function writes(doc: ImportJson): number {
  return doc.created + doc.updated;
}

// "Nothing written yet: 2 new, 1 already in your journal, 1 skipped."; the counts that aren't 0.
export function summary(doc: ImportJson, dryRun: boolean): string {
  const n = (r: Result) => (r === "skipped" ? doc.skipped.length : doc.items.filter((i) => i.result === r).length);
  const word = (r: Result) => (dryRun && r === "updated" ? "to update" : STATUS[r][dryRun ? 0 : 1]);
  const parts = (["created", "updated", "unchanged", "failed", "skipped"] as const).filter((r) => n(r)).map((r) => `${n(r)} ${word(r)}`);
  if (!parts.length) return "No lines to import.";
  return dryRun ? `Nothing written yet: ${parts.join(", ")}.` : `${parts.join(", ")}.`;
}
