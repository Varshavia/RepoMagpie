import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { alternativeLinks, findLinks, linkIndex } from "./links.ts";

// --- findLinks: the [[wikilink]] syntax (decision 0027) ---

test("findLinks: [[target]], [[target|label]], [[target#heading]] and [[target#heading|label]]", () => {
  assert.deepEqual(findLinks("use [[puppeteer]], [[npm--pdfkit|pdfkit]], [[zod#Verdict]] or [[a#b|the label]]"), [
    { target: "puppeteer", label: null },
    { target: "npm--pdfkit", label: "pdfkit" },
    { target: "zod", label: null },
    { target: "a", label: "the label" },
  ]);
});

test("findLinks: spaces are trimmed; an empty target, or only a heading, is no link; an empty label is none", () => {
  assert.deepEqual(findLinks("[[ pdfkit | the lib ]] [[]] [[ ]] [[|x]] [[#Verdict]] [[zod|]] [[a|b|c]]"), [
    { target: "pdfkit", label: "the lib" },
    { target: "zod", label: null },
    { target: "a", label: "b|c" },
  ]);
});

test("findLinks: no link across a line break or inside brackets; the inner pair of [[a[[b]] is the link", () => {
  assert.deepEqual(findLinks("[[split\nlink]] [[a[[b]] [x] [[c]"), [{ target: "b", label: null }]);
});

test("findLinks: links in inline code are not links; an unmatched backtick is plain text", () => {
  assert.deepEqual(findLinks("`[[a]]` and ``x [[b]] ` y`` and ```[[c]]``` but `[[d]]"), [{ target: "d", label: null }]);
  assert.deepEqual(findLinks("[`x`[e]] [[f]]"), [{ target: "f", label: null }]);
});

test("findLinks: links in fenced code blocks are not links; after the fence closes they are", () => {
  const text = ["[[before]]", "```js", "[[in-code]]", "~~~", "[[still-code]]", "```", "[[after]]", "  ~~~", "[[tilde-code]]", "  ~~~", "[[end]]", "```", "[[unclosed]]"].join("\n");
  assert.deepEqual(findLinks(text).map((l) => l.target), ["before", "after", "end"]);
});

test("alternativeLinks: wikilinks as strings, a plain string names its target; any other value is unreadable", () => {
  assert.deepEqual(alternativeLinks(["[[npm--puppeteer]]", "[[zod|Zod]]", " wkhtmltopdf ", "", "[[]]"]), [
    { target: "npm--puppeteer", label: null },
    { target: "zod", label: "Zod" },
    { target: "wkhtmltopdf", label: null },
  ]);
  for (const value of [undefined, null, "[[npm--puppeteer]]", [1, "[[zod]]"], { a: "[[zod]]" }]) assert.deepEqual(alternativeLinks(value), []);
});

// --- linkIndex: outgoing and incoming links in one journal ---

const PDFKIT = `---
id: pkg:npm/pdfkit
name: pdfkit
---

## Verdict
avoid: async streams painful; use [[puppeteer]]

## My notes
Not links: \`[[npm--puppeteer]]\` and
\`\`\`md
[[npm--puppeteer]]
\`\`\`
Gone: [[ghost]]. Two of them: [[playwright]].

## Related
- [[npm--puppeteer|the PDF printer]]
- [[PDFKIT]]
- [[NPM--Playwright#Install]]
`;

const PUPPETEER = `---
id: pkg:npm/puppeteer
name: puppeteer
alternatives: ["[[npm--pdfkit]]", "wkhtmltopdf"]
---

## Use when
- instead of [[npm--pdfkit#Verdict|pdfkit's verdict]]
`;

const NOTES: Record<string, string> = {
  "npm--pdfkit.md": PDFKIT,
  "npm--puppeteer.md": PUPPETEER,
  "npm--playwright.md": "---\nid: pkg:npm/playwright\nname: playwright\n---\n\n## Verdict\n",
  "github--microsoft--playwright.md": "---\nid: pkg:github/microsoft/playwright\nname: playwright\n---\n\n## Hand-written\nsee [[npm--pdfkit]]\n",
  // A name equal to another note's file stem: the stem wins (rule 1 before rule 2).
  "github--acme--pdf-tools.md": "---\nid: pkg:github/acme/pdf-tools\nname: npm--puppeteer\n---\n\n## Related\n",
  // Unreadable notes: skipped, so they link nowhere and nothing links to them.
  "npm--broken.md": "---\nid: [broken\n---\n\n## Related\n[[npm--pdfkit]]\n",
  "npm--bare.md": "## Related\n[[npm--pdfkit]]\n",
};

function journal(notes: Record<string, string> = NOTES): { root: string; note: (file: string) => string } {
  const root = join(scratchBase("links"), "journal");
  mkdirSync(join(root, "notes"), { recursive: true });
  for (const [file, text] of Object.entries(notes)) writeFileSync(join(root, "notes", file), text);
  return { root, note: (file) => join(root, "notes", file) };
}

const pdfkit = { id: "pkg:npm/pdfkit", name: "pdfkit" };
const puppeteer = { id: "pkg:npm/puppeteer", name: "puppeteer" };

test("linkIndex: outgoing links in file order, resolved by file stem, then by a unique name, case-insensitively", () => {
  const index = linkIndex(journal().root);
  assert.deepEqual(index.outgoing["npm--pdfkit.md"], [
    { target: "puppeteer", label: null, ...puppeteer, from: "Verdict" },
    { target: "ghost", label: null, id: null, name: null, reason: "missing", from: "My notes" },
    { target: "playwright", label: null, id: null, name: null, reason: "ambiguous", from: "My notes" },
    { target: "npm--puppeteer", label: "the PDF printer", ...puppeteer, from: "Related" },
    { target: "PDFKIT", label: null, ...pdfkit, from: "Related" },
    { target: "NPM--Playwright", label: null, id: "pkg:npm/playwright", name: "playwright", from: "Related" },
  ]);
  assert.deepEqual(index.outgoing["npm--puppeteer.md"], [
    { target: "npm--pdfkit", label: null, ...pdfkit, from: "alternatives" },
    { target: "wkhtmltopdf", label: null, id: null, name: null, reason: "missing", from: "alternatives" },
    { target: "npm--pdfkit", label: "pdfkit's verdict", ...pdfkit, from: "Use when" },
  ]);
  assert.deepEqual(index.outgoing["github--microsoft--playwright.md"], [{ target: "npm--pdfkit", label: null, ...pdfkit, from: "Hand-written" }]);
  assert.deepEqual(index.outgoing["github--acme--pdf-tools.md"], []);
});

test("linkIndex: incoming links per note, by name, one per note and place; a note's link to itself is not one", () => {
  const index = linkIndex(journal().root);
  assert.deepEqual(index.incoming["npm--pdfkit.md"], [
    { id: "pkg:github/microsoft/playwright", name: "playwright", from: "Hand-written" },
    { ...puppeteer, from: "alternatives" },
    { ...puppeteer, from: "Use when" },
  ]);
  assert.deepEqual(index.incoming["npm--puppeteer.md"], [
    { ...pdfkit, from: "Verdict" },
    { ...pdfkit, from: "Related" },
  ]);
  assert.deepEqual(index.incoming["npm--playwright.md"], [{ ...pdfkit, from: "Related" }]);
  assert.deepEqual(index.incoming["github--acme--pdf-tools.md"], []);
});

test("linkIndex: an unreadable note has no links and is skipped; it doesn't break the index", () => {
  const index = linkIndex(journal().root);
  for (const file of ["npm--broken.md", "npm--bare.md"]) {
    assert.equal(index.outgoing[file], undefined);
    assert.equal(index.incoming[file], undefined);
  }
});

test("linkIndex: a deleted target makes its links missing and its backlinks go", () => {
  const j = journal();
  rmSync(j.note("npm--puppeteer.md"));
  const index = linkIndex(j.root);
  assert.deepEqual(index.outgoing["npm--pdfkit.md"][0], { target: "puppeteer", label: null, id: null, name: null, reason: "missing", from: "Verdict" });
  assert.deepEqual(index.incoming["npm--pdfkit.md"], [{ id: "pkg:github/microsoft/playwright", name: "playwright", from: "Hand-written" }]);
});

test("linkIndex: an empty journal, or one without notes/, has no links", () => {
  assert.deepEqual(linkIndex(journal({}).root), { outgoing: {}, incoming: {} });
  assert.deepEqual(linkIndex(join(scratchBase("links"), "nothing")), { outgoing: {}, incoming: {} });
});

test("link cache: .cache/links.json; unchanged notes come from it, changed and new notes from disk", () => {
  const j = journal();
  const first = linkIndex(j.root);
  const cacheFile = join(j.root, ".cache", "links.json");
  const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as { data: Record<string, { links: { target: string; label: string | null; from: string }[] }> };
  assert.deepEqual(Object.keys(cache.data).sort(), Object.keys(NOTES).sort());

  // An unchanged file's links come from the cache, not from reading it again (the planted link shows it).
  cache.data["npm--playwright.md"].links = [{ target: "npm--pdfkit", label: null, from: "From the cache" }];
  writeFileSync(cacheFile, JSON.stringify(cache));
  assert.deepEqual(linkIndex(j.root).outgoing["npm--playwright.md"], [{ target: "npm--pdfkit", label: null, ...pdfkit, from: "From the cache" }]);

  // A changed file is read again, a new one is read, and the cache follows.
  writeFileSync(j.note("npm--playwright.md"), NOTES["npm--playwright.md"].replace("## Verdict\n", "## Verdict\nfine, unlike [[npm--zod]]\n"));
  writeFileSync(j.note("npm--zod.md"), "---\nid: pkg:npm/zod\nname: zod\n---\n");
  const next = linkIndex(j.root);
  assert.deepEqual(next.outgoing["npm--playwright.md"], [{ target: "npm--zod", label: null, id: "pkg:npm/zod", name: "zod", from: "Verdict" }]);
  assert.deepEqual(next.incoming["npm--zod.md"], [{ id: "pkg:npm/playwright", name: "playwright", from: "Verdict" }]);
  assert.deepEqual(next.outgoing["npm--pdfkit.md"], first.outgoing["npm--pdfkit.md"]);

  // Without the cache, or with one that can't be read, the same index.
  writeFileSync(cacheFile, "{not json");
  assert.deepEqual(linkIndex(j.root), next);
  rmSync(cacheFile);
  assert.deepEqual(linkIndex(j.root), next);
});
