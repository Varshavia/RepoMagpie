import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImportJson } from "../../../src/core/save.ts";
import { countItems, rows, summary, writes } from "./importing.ts";

// Import (docs/ui.md §7): the check's table and the summary, from magpie import --json.

const TEXT = "# my list\nhttps://github.com/a/b\n- pkg:npm/pdfkit — verdict: avoid\nleft-pad\nhttps://github.com/a/b.git\n";
const DOC: ImportJson = {
  items: [
    { line: 2, id: "pkg:github/a/b", result: "created", error: null, warnings: ["GitHub didn't answer; the note has no metadata."] },
    { line: 3, id: "pkg:npm/pdfkit", result: "unchanged", error: null, warnings: [] },
    { line: 4, id: null, result: "failed", error: "left-pad could be npm, pypi, cargo; write a PURL instead, such as pkg:npm/left-pad.", warnings: [] },
  ],
  created: 1,
  updated: 0,
  failed: 1,
  tags_md_added: [],
  skipped: [{ line: 1, reason: "Not a URL or a package name." }, { line: 5, reason: "Line 2 names the same package." }],
};

test("countItems: the lines core's parser reads as items", () => {
  assert.equal(countItems(TEXT), 4);
  assert.equal(countItems("Some prose.\n\n"), 0);
});

test("rows: every line in order, as pasted, with what it becomes and its status", () => {
  assert.deepEqual(
    rows(DOC, TEXT, true).map((r) => [r.line, r.text, r.becomes, r.status, r.why]),
    [
      [1, "# my list", null, "skipped", "Not a URL or a package name."],
      [2, "https://github.com/a/b", "pkg:github/a/b", "new", "GitHub didn't answer; the note has no metadata."],
      [3, "- pkg:npm/pdfkit — verdict: avoid", "pkg:npm/pdfkit", "already in your journal", ""],
      [4, "left-pad", null, "can't import", DOC.items[2].error],
      [5, "https://github.com/a/b.git", null, "skipped", "Line 2 names the same package."],
    ],
  );
  assert.deepEqual(rows(DOC, TEXT, false).map((r) => r.status), ["skipped", "created", "already in your journal", "failed", "skipped"]);
});

test("writes: Import is offered only for lines that create or add to a note", () => {
  assert.equal(writes(DOC), 1);
  assert.equal(writes({ ...DOC, created: 0 }), 0);
  assert.equal(writes({ ...DOC, created: 0, updated: 2 }), 2);
});

test("summary: the counts that aren't 0", () => {
  assert.equal(summary(DOC, true), "Nothing written yet: 1 new, 1 already in your journal, 1 can't import, 2 skipped.");
  assert.equal(summary(DOC, false), "1 created, 1 already in your journal, 1 failed, 2 skipped.");
  assert.equal(summary({ ...DOC, items: [], skipped: [] }, true), "No lines to import.");
});
