import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImport } from "./import.ts";

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

test("only lines that start with '- ' are items; line numbers count every line; CRLF works", () => {
  const items = parseImport("# My list\r\n\r\nSome prose.\r\n  - indented bullet\r\n* star bullet\r\n- pdfkit — verdict: ok\r\n-no space\r\n- chalk\r\n");
  assert.deepEqual(items.map((i) => [i.line, i.target]), [[6, "pdfkit"], [8, "chalk"]]);
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
