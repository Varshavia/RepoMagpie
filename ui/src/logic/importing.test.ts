import { test } from "node:test";
import assert from "node:assert/strict";
import { countItems, lineTarget, resultWord, summary } from "./importing.ts";

// Import (docs/ui.md §7): the dry-run table and the summary, from magpie import --json.

const TEXT = "# my list\n- pkg:npm/pdfkit — verdict: avoid | use: one-page PDFs\n- https://github.com/a/b -- verdict: fine\n  - not an item\n- left-pad\n";

test("countItems: lines that start with '- ' at the left margin", () => {
  assert.equal(countItems(TEXT), 3);
  assert.equal(countItems(""), 0);
});

test("lineTarget: the target on that line, without the dash and the parts", () => {
  assert.equal(lineTarget(TEXT, 2), "pkg:npm/pdfkit");
  assert.equal(lineTarget(TEXT, 3), "https://github.com/a/b");
  assert.equal(lineTarget(TEXT, 5), "left-pad");
  assert.equal(lineTarget(TEXT, 9), "");
});

test("resultWord: what will happen in a dry run, what happened otherwise", () => {
  assert.equal(resultWord("created", true), "will create");
  assert.equal(resultWord("updated", true), "will update");
  assert.equal(resultWord("unchanged", true), "no change");
  assert.equal(resultWord("failed", true), "will fail");
  assert.equal(resultWord("created", false), "created");
  assert.equal(resultWord("failed", false), "failed");
});

test("summary counts every result, unchanged included", () => {
  const items = [{ result: "created" }, { result: "created" }, { result: "unchanged" }, { result: "failed" }] as const;
  assert.equal(summary([...items], true), "magpie wrote nothing yet: 2 to create, 0 to update, 1 unchanged, 1 failing.");
  assert.equal(summary([...items], false), "2 created, 0 updated, 1 unchanged, 1 failed.");
});
