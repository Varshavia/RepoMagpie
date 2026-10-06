import { test } from "node:test";
import assert from "node:assert/strict";
import { noItemsHint, parseImport } from "./import.ts";

// The import line format (spec §2): - <url-or-name> — verdict: ... | use: ... | avoid: ...

test("a full line: target, then labelled parts", () => {
  assert.deepEqual(parseImport("- pdfkit — verdict: avoid: async streams painful; use puppeteer | use: one-page PDFs | avoid: large reports"), [
    { line: 1, target: "pdfkit", verdict: "avoid: async streams painful; use puppeteer", useWhen: ["one-page PDFs"], avoidWhen: ["large reports"], error: null },
  ]);
});

test("the separator may be ' -- '; labels are case-insensitive", () => {
  const [item] = parseImport("- https://github.com/microsoft/playwright-cli -- Verdict: default | USE: browser checks");
  assert.equal(item.target, "https://github.com/microsoft/playwright-cli");
  assert.equal(item.verdict, "default");
  assert.deepEqual(item.useWhen, ["browser checks"]);
});

test("text without a label goes to My notes, one line per part", () => {
  const [item] = parseImport("- pdfkit — tried it in 2025 | verdict: ok | slow on big files");
  assert.equal(item.myNotes, "tried it in 2025\nslow on big files");
  assert.equal(item.verdict, "ok");
});

test("repeated use: and avoid: parts become one bullet each", () => {
  const [item] = parseImport("- pdfkit — use: a | use: b | avoid: c");
  assert.deepEqual(item.useWhen, ["a", "b"]);
  assert.deepEqual(item.avoidWhen, ["c"]);
});

test("a target alone is an item without text", () => {
  assert.deepEqual(parseImport("- pkg:npm/pdfkit"), [{ line: 1, target: "pkg:npm/pdfkit", useWhen: [], avoidWhen: [], error: null }]);
});

test("only list lines at the left margin are items; line numbers count every line; CRLF works", () => {
  const items = parseImport("# My list\r\n\r\nSome prose.\r\n  - indented bullet\r\n1. numbered\r\n- pdfkit — verdict: ok\r\n-no space\r\n- chalk\r\n");
  assert.deepEqual(items.map((i) => [i.line, i.target]), [[6, "pdfkit"], [8, "chalk"]]);
});

// Lenient read: a list copied out of a chat or another editor.
test("items may start with '* ', '+ ' or an escaped '\\- '", () => {
  const items = parseImport("* pdfkit — verdict: ok\n+ chalk\n\\- pkg:npm/left-pad — use: padding\n\\* not an item\n");
  assert.deepEqual(items.map((i) => [i.line, i.target]), [[1, "pdfkit"], [2, "chalk"], [3, "pkg:npm/left-pad"]]);
  assert.equal(items[0].verdict, "ok");
  assert.deepEqual(items[2].useWhen, ["padding"]);
});

test("a UTF-8 BOM is ignored; a non-breaking space after the marker counts as a space", () => {
  const items = parseImport("﻿- pdfkit — verdict: ok\n- chalk — verdict: fine\n");
  assert.deepEqual(items.map((i) => [i.line, i.target, i.verdict]), [[1, "pdfkit", "ok"], [2, "chalk", "fine"]]);
});

test("no items: the hint says what the first line with text starts with", () => {
  const rule = 'Each item is a line that starts with "- ".';
  assert.equal(noItemsHint("\n\n1. pdfkit — verdict: ok\n- later"), `${rule} Line 3 starts with "1.".`);
  assert.equal(noItemsHint("﻿• pdfkit\n"), `${rule} Line 1 starts with "•".`);
  assert.equal(noItemsHint("  - pdfkit\n"), `${rule} Line 1 starts with spaces, then "-".`);
  assert.equal(noItemsHint("-pdfkit — verdict: ok"), `${rule} Line 1 starts with "-pdfkit".`);
  assert.equal(noItemsHint("https://github.com/microsoft/playwright-cli"), `${rule} Line 1 starts with "https://github.com/m…".`);
  assert.equal(noItemsHint(" \n\t\n"), `${rule} The text is empty.`);
});

test("an empty label value is ignored", () => {
  const [item] = parseImport("- pdfkit — verdict: | use:");
  assert.equal(item.verdict, undefined);
  assert.deepEqual(item.useWhen, []);
  assert.equal(item.error, null);
});

test("lines that can't be parsed carry an error: no target, two verdicts", () => {
  const items = parseImport("- — verdict: ok\n- pdfkit — verdict: one | verdict: two");
  assert.match(items[0].error ?? "", /No package or URL/);
  assert.match(items[1].error ?? "", /more than one verdict/);
});
