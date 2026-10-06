// Import (docs/ui.md §7): words for the dry-run table and the summary, from magpie import --json.
// Which lines are items, and what each does, is core's; this labels the results and mirrors the
// item rule for the count while you type.

type Result = "created" | "updated" | "unchanged" | "failed";

// Core's item rule (core/import.ts, lenient read), mirrored because the app can't bundle core;
// importing.test.ts keeps the two equal. An item starts with "- ", "* ", "+ " or "\- " at the left
// margin; a non-breaking space counts as the space; a UTF-8 BOM is ignored.
const ITEM_MARKER = /^(?:\\?-|\*|\+)[  ]/;
const lines = (text: string) => text.replace(/^﻿/, "").split(/\r?\n/);

export function countItems(text: string): number {
  return lines(text).filter((line) => ITEM_MARKER.test(line)).length;
}

// The target written on a line (1-based): the text after the marker, up to the separator.
export function lineTarget(text: string, line: number): string {
  const rest = (lines(text)[line - 1] ?? "").replace(ITEM_MARKER, "");
  const split = rest.match(/^(.*?)(?:^|\s)(?:—|--)(?:\s|$)(.*)$/);
  return (split ? split[1] : rest).trim();
}

// For a text without items: the rule, and what the first line with text starts with instead.
export function noItemsHint(text: string): string {
  const rule = 'Each item is a line that starts with "- ".';
  const all = lines(text);
  const index = all.findIndex((line) => line.trim());
  if (index === -1) return `${rule} The text is empty.`;
  const first = all[index].trim().split(/\s/)[0];
  const start = first.length > 20 ? `${first.slice(0, 20)}…` : first;
  return `${rule} Line ${index + 1} starts with ${/^\s/.test(all[index]) ? "spaces, then " : ""}"${start}".`;
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
