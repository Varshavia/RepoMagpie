import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CACHE_FILE, loadIndex, noteDocuments } from "./search-index.ts";

// Every journal lives in its own temporary folder.
const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function journal(notes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "magpie-index-"));
  roots.push(root);
  mkdirSync(join(root, "notes"));
  for (const [file, text] of Object.entries(notes)) writeFileSync(join(root, "notes", file), text);
  return root;
}

const PDFKIT = `---
id: pkg:npm/pdfkit
name: pdfkit
kind: library
tags: [pdf, documents]
status: reviewed
---

## Verdict
avoid: async streams painful; use puppeteer

## Use when
<!-- magpie:draft -->
- quick one-page PDFs from a script

## Avoid when
- streamed output for large reports <!-- my reminder -->

## What it does
Generates PDF documents.

## Notable skills
- \`pdf-tables\` — draws tables across pages
- \`pdf-fonts\` —
-  \`pdf-images\` -- embeds PNG and JPEG

## My notes
Tried it in 2025.
`;

const INBOX = `---
id: pkg:npm/chalk
name: chalk
kind: library
tags: []
status: inbox
---

## Verdict

## What it does
<!-- magpie:draft -->
Terminal colours.
`;

// --- documents: one per note, one per completed skill line (decision 0006, schema rule 4) ---

test("a note becomes one document with its searchable text, without draft markers or comments", () => {
  const [note] = noteDocuments(PDFKIT, "npm--pdfkit.md");
  assert.deepEqual(note, {
    key: "npm--pdfkit.md",
    type: "note",
    file: "npm--pdfkit.md",
    purl: "pkg:npm/pdfkit",
    name: "pdfkit",
    skill: null,
    kind: "library",
    tags: ["pdf", "documents"],
    status: "reviewed",
    verdict: "avoid: async streams painful; use puppeteer",
    useWhen: "- quick one-page PDFs from a script",
    avoidWhen: "- streamed output for large reports",
    whatItDoes: "Generates PDF documents.",
    myNotes: "Tried it in 2025.",
    skillText: "",
    drafts: ["Use when"],
  });
});

test("each completed skill line is its own document; empty skill lines are ignored", () => {
  const skills = noteDocuments(PDFKIT, "npm--pdfkit.md").slice(1);
  assert.deepEqual(skills.map((s) => [s.key, s.type, s.skill, s.skillText, s.name, s.purl]), [
    ["npm--pdfkit.md#pdf-tables", "skill", "pdf-tables", "draws tables across pages", "pdfkit", "pkg:npm/pdfkit"],
    ["npm--pdfkit.md#pdf-images", "skill", "pdf-images", "embeds PNG and JPEG", "pdfkit", "pkg:npm/pdfkit"],
  ]);
});

test("an inbox note has an empty Verdict; a note with unreadable frontmatter is still indexed by its text", () => {
  const [chalk] = noteDocuments(INBOX, "npm--chalk.md");
  assert.equal(chalk.status, "inbox");
  assert.equal(chalk.verdict, "");
  assert.deepEqual(chalk.drafts, ["What it does"]);
  const [broken] = noteDocuments("---\nid: [\n---\n\n## Verdict\nstill searchable\n", "npm--broken.md");
  assert.equal(broken.purl, null);
  assert.equal(broken.name, "npm--broken");
  assert.equal(broken.verdict, "still searchable");
});

// --- the index: prefix and fuzzy matching ---

test("prefix and fuzzy matching", () => {
  const { index } = loadIndex(journal({ "npm--pdfkit.md": PDFKIT, "npm--chalk.md": INBOX }));
  assert.equal(index.search("pdfk")[0]?.id, "npm--pdfkit.md"); // prefix
  assert.equal(index.search("puppeter")[0]?.id, "npm--pdfkit.md"); // fuzzy
  assert.ok(index.search("tables").some((r) => r.id === "npm--pdfkit.md#pdf-tables")); // skill text
  assert.equal(index.search("colours")[0]?.id, "npm--chalk.md");
});

test("stored fields come back with each result", () => {
  const { index } = loadIndex(journal({ "npm--pdfkit.md": PDFKIT }));
  const [hit] = index.search("puppeteer");
  assert.equal(hit.name, "pdfkit");
  assert.equal(hit.verdict, "avoid: async streams painful; use puppeteer");
  assert.equal(hit.file, "npm--pdfkit.md");
});

// --- the cache in <journal>/.cache/ (spec §7) ---

test("the first load builds the index and writes the cache; the next load reads it", () => {
  const path = journal({ "npm--pdfkit.md": PDFKIT });
  assert.equal(loadIndex(path).rebuilt, true);
  assert.ok(existsSync(join(path, ".cache", CACHE_FILE)));
  const second = loadIndex(path);
  assert.equal(second.rebuilt, false);
  assert.equal(second.index.search("puppeteer")[0]?.id, "npm--pdfkit.md");
});

test("an edited, added or deleted note invalidates the cache", () => {
  const path = journal({ "npm--pdfkit.md": PDFKIT });
  loadIndex(path);

  writeFileSync(join(path, "notes", "npm--pdfkit.md"), PDFKIT.replace("use puppeteer", "use playwright instead"));
  const edited = loadIndex(path);
  assert.equal(edited.rebuilt, true);
  assert.equal(edited.index.search("playwright")[0]?.id, "npm--pdfkit.md");

  writeFileSync(join(path, "notes", "npm--chalk.md"), INBOX);
  assert.equal(loadIndex(path).index.search("colours")[0]?.id, "npm--chalk.md");

  rmSync(join(path, "notes", "npm--chalk.md"));
  const removed = loadIndex(path);
  assert.equal(removed.rebuilt, true);
  assert.equal(removed.index.search("colours").length, 0);
});

test("an edit that keeps the size but changes the modification time invalidates the cache", () => {
  const path = journal({ "npm--pdfkit.md": PDFKIT });
  loadIndex(path);
  const file = join(path, "notes", "npm--pdfkit.md");
  writeFileSync(file, PDFKIT.replace("puppeteer", "puppetzzz"));
  utimesSync(file, new Date(), new Date(Date.now() + 5_000));
  assert.equal(loadIndex(path).index.search("puppetzzz")[0]?.id, "npm--pdfkit.md");
});

test("the cache is safe to delete", () => {
  const path = journal({ "npm--pdfkit.md": PDFKIT });
  loadIndex(path);
  rmSync(join(path, ".cache"), { recursive: true });
  const r = loadIndex(path);
  assert.equal(r.rebuilt, true);
  assert.equal(r.index.search("puppeteer").length > 0, true);
});

test("a corrupt cache is rebuilt silently and replaced", () => {
  for (const garbage of ["{ not json", "null", JSON.stringify({ version: 1, files: {}, index: "nonsense" }), JSON.stringify({ version: 999 })]) {
    const path = journal({ "npm--pdfkit.md": PDFKIT });
    loadIndex(path);
    writeFileSync(join(path, ".cache", CACHE_FILE), garbage);
    const r = loadIndex(path);
    assert.equal(r.rebuilt, true);
    assert.equal(r.index.search("puppeteer")[0]?.id, "npm--pdfkit.md");
    assert.equal(loadIndex(path).rebuilt, false); // the cache was rewritten
  }
});

test("a cache that can't be written doesn't stop the search", () => {
  const path = journal({ "npm--pdfkit.md": PDFKIT });
  writeFileSync(join(path, ".cache"), "a file where the cache folder should be");
  const r = loadIndex(path);
  assert.equal(r.index.search("puppeteer")[0]?.id, "npm--pdfkit.md");
});

test("a journal without notes, or that doesn't exist, gives an empty index and writes nothing", () => {
  const empty = mkdtempSync(join(tmpdir(), "magpie-index-"));
  roots.push(empty);
  assert.equal(loadIndex(empty).index.documentCount, 0);
  assert.equal(loadIndex(join(empty, "missing")).index.documentCount, 0);
  assert.equal(existsSync(join(empty, ".cache")), false);
});

test("the cache stores file names, not absolute paths, so a moved journal keeps working", () => {
  const path = journal({ "npm--pdfkit.md": PDFKIT });
  loadIndex(path);
  assert.ok(!readFileSync(join(path, ".cache", CACHE_FILE), "utf8").includes(JSON.stringify(path).slice(1, -1)));
});
