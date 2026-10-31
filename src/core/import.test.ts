import { test } from "node:test";
import assert from "node:assert/strict";
import { NOT_A_TARGET, noItemsHint, parseImport } from "./import.ts";

const BOM = String.fromCharCode(0xfeff); // a byte-order mark, built so this file holds none
const NBSP = String.fromCharCode(0xa0);
const items = (text: string) => parseImport(text).items;
const targets = (text: string) => items(text).map((i) => [i.line, i.target]);

// The import line format (spec §2): - <url-or-name> — verdict: ... | use: ... | avoid: ...

test("a full line: target, then labelled parts", () => {
  assert.deepEqual(parseImport("- pdfkit — verdict: avoid: async streams painful; use puppeteer | use: one-page PDFs | avoid: large reports"), {
    items: [{ line: 1, target: "pdfkit", verdict: "avoid: async streams painful; use puppeteer", useWhen: ["one-page PDFs"], avoidWhen: ["large reports"], error: null }],
    skipped: [],
  });
});

test("the separator may be ' -- '; labels are case-insensitive", () => {
  const [item] = items("- https://github.com/microsoft/playwright-cli -- Verdict: default | USE: browser checks");
  assert.equal(item.target, "https://github.com/microsoft/playwright-cli");
  assert.equal(item.verdict, "default");
  assert.deepEqual(item.useWhen, ["browser checks"]);
});

test("text without a label goes to My notes, one line per part", () => {
  const [item] = items("- pdfkit — tried it in 2025 | verdict: ok | slow on big files");
  assert.equal(item.myNotes, "tried it in 2025\nslow on big files");
  assert.equal(item.verdict, "ok");
});

test("repeated use: and avoid: parts become one bullet each", () => {
  const [item] = items("- pdfkit — use: a | use: b | avoid: c");
  assert.deepEqual(item.useWhen, ["a", "b"]);
  assert.deepEqual(item.avoidWhen, ["c"]);
});

test("a target alone is an item without text", () => {
  assert.deepEqual(items("- pkg:npm/pdfkit"), [{ line: 1, target: "pkg:npm/pdfkit", useWhen: [], avoidWhen: [], error: null }]);
});

// Lenient read: a list pasted from a chat, a README or a browser's address bar.
test("a bare URL, PURL or name per line is an item; the same parts follow the separator", () => {
  const text = "https://github.com/thedotmack/claude-mem.git\npkg:npm/pdfkit\nchalk\n@playwright/cli — verdict: fine\n";
  assert.deepEqual(targets(text), [[1, "https://github.com/thedotmack/claude-mem.git"], [2, "pkg:npm/pdfkit"], [3, "chalk"], [4, "@playwright/cli"]]);
  assert.equal(items(text)[3].verdict, "fine");
});

test("every marker: '- ', '* ', '+ ', '• ', '1. ', '1) ', an escaped '\\- ', after spaces too", () => {
  const text = "- a\n* b\n+ c\n• d\n1. e\n12) f\n\\- g\n  - h\n";
  assert.deepEqual(targets(text), ["a", "b", "c", "d", "e", "f", "g", "h"].map((t, i) => [i + 1, t]));
});

test("a Markdown link's URL is the target; text after a link or URL is left out unless it follows the separator", () => {
  const text = "1. [claude-mem](https://github.com/thedotmack/claude-mem) - memory for agents\n[zod](https://github.com/colinhacks/zod) — verdict: fine\nhttps://github.com/a/b the best one\n";
  assert.deepEqual(targets(text), [[1, "https://github.com/thedotmack/claude-mem"], [2, "https://github.com/colinhacks/zod"], [3, "https://github.com/a/b"]]);
  assert.equal(items(text)[0].myNotes, undefined);
  assert.equal(items(text)[1].verdict, "fine");
});

test("prose is skipped and listed with why; blank lines are neither", () => {
  const { items: found, skipped } = parseImport("Some prose here.\r\n\r\n```\r\n- pdfkit — verdict: ok\r\n-no space\r\n\\* not an item\r\n- \r\n---\r\n");
  assert.deepEqual(found.map((i) => [i.line, i.target]), [[4, "pdfkit"]]);
  assert.deepEqual(skipped, [1, 3, 5, 6, 8].map((line) => ({ line, reason: NOT_A_TARGET })));
});

test("a name in backticks is a name, alone or after a marker, with the parts after it", () => {
  const text = "`pdfkit`\n- `chalk`\n1. `@playwright/cli` — verdict: fine\n`two words`\n";
  const { items: found, skipped } = parseImport(text);
  assert.deepEqual(found.map((i) => [i.line, i.target]), [[1, "pdfkit"], [2, "chalk"], [3, "@playwright/cli"]]);
  assert.equal(found[2].verdict, "fine");
  assert.deepEqual(skipped, [{ line: 4, reason: NOT_A_TARGET }]);
});

test("a heading is skipped without a word: '#', or a short line ending with a colon, bold or not", () => {
  const text = "# My list\n## Security\nTools:\n**Security tools:**\n- __Testing:__\nHere are the repos I mentioned:\npdfkit\n- pdfkit — use:\n";
  const { items: found, skipped } = parseImport(text);
  assert.deepEqual(found.map((i) => [i.line, i.target]), [[7, "pdfkit"], [8, "pdfkit"]], "a line with the separator stays an item");
  assert.deepEqual(skipped, []);
  const long = `${"These are the tools I looked at this year, most of them for work".padEnd(61, ".")}:`;
  assert.deepEqual(parseImport(long).skipped, [{ line: 1, reason: NOT_A_TARGET }], "a long line ending with a colon is prose");
});

test("a UTF-8 BOM is ignored; a non-breaking space counts as a space", () => {
  const found = items(`${BOM}-${NBSP}pdfkit — verdict: ok\n- chalk — verdict: fine\n`);
  assert.deepEqual(found.map((i) => [i.line, i.target, i.verdict]), [[1, "pdfkit", "ok"], [2, "chalk", "fine"]]);
});

test("no items: the hint says what the first line with text starts with", () => {
  const rule = "Put one repo URL or package name on each line.";
  assert.equal(noItemsHint("\n\nHere are my tools:\n"), `${rule} Line 3 starts with "Here".`);
  assert.equal(noItemsHint("Have a look at https://github.com/microsoft/playwright-cli"), `${rule} Line 1 starts with "Have".`);
  assert.equal(noItemsHint("supercalifragilisticexpialidocious, yes"), `${rule} Line 1 starts with "supercalifragilistic…".`);
  assert.equal(noItemsHint(" \n\t\n"), `${rule} The text is empty.`);
});

test("an empty label value is ignored", () => {
  const [item] = items("- pdfkit — verdict: | use:");
  assert.equal(item.verdict, undefined);
  assert.deepEqual(item.useWhen, []);
  assert.equal(item.error, null);
});

test("lines that can't be parsed carry an error: no target, two verdicts", () => {
  const found = items("- — verdict: ok\n- pdfkit — verdict: one | verdict: two");
  assert.match(found[0].error ?? "", /No package or URL/);
  assert.match(found[1].error ?? "", /more than one verdict/);
});
