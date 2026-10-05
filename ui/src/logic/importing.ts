// Import (docs/ui.md §7): words for the dry-run table and the summary, from magpie import --json.
// Which lines are items, and what each does, is core's; this only labels the results.

type Result = "created" | "updated" | "unchanged" | "failed";

// Lines that start with "- " at the left margin are items (spec, magpie import).
export function countItems(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.startsWith("- ")).length;
}

// The target written on a line (1-based): the text after "- ", up to the separator.
export function lineTarget(text: string, line: number): string {
  const raw = text.split(/\r?\n/)[line - 1] ?? "";
  return raw.replace(/^- /, "").split(/\s+(?:—|--)\s+/)[0].trim();
}

const WILL: Record<Result, string> = { created: "will create", updated: "will update", unchanged: "no change", failed: "will fail" };

export function resultWord(result: Result, dryRun: boolean): string {
  return dryRun ? WILL[result] : result;
}

export function summary(items: { result: Result }[], dryRun: boolean): string {
  const n = (r: Result) => items.filter((i) => i.result === r).length;
  return dryRun
    ? `magpie wrote nothing yet: ${n("created")} to create, ${n("updated")} to update, ${n("unchanged")} unchanged, ${n("failed")} failing.`
    : `${n("created")} created, ${n("updated")} updated, ${n("unchanged")} unchanged, ${n("failed")} failed.`;
}
