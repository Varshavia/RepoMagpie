import { test } from "node:test";
import assert from "node:assert/strict";
import { readNote, validate } from "./note.ts";

// A note in the canonical v1 format (note schema).
const CANONICAL = `---
id: pkg:npm/pdfkit
name: pdfkit
url: https://www.npmjs.com/package/pdfkit
language: JavaScript
license: MIT
topics: []
packages: []
explored: 2026-10-03
kind: library
tags: [pdf]
tried: true
rating: 2
status: reviewed
---

## Verdict
avoid: async streams painful; use puppeteer

## Use when
- quick one-page PDFs from a script

## Avoid when
- you need streamed output for large PDFs

## What it does
Generates PDF documents from JavaScript.

## How to use
\`npm install pdfkit\`

## Notable skills

## My notes

## Related
`;

const SECTIONS = ["Verdict", "Use when", "Avoid when", "What it does", "How to use", "Notable skills", "My notes", "Related"];

const problemsAbout = (text: string, where: string) => validate(readNote(text)).filter((p) => p.where === where);

test("reads a canonical note: frontmatter, sections in order, verdict, reviewed", () => {
  const note = readNote(CANONICAL);
  assert.equal(note.hasFrontmatter, true);
  assert.equal(note.frontmatter.id, "pkg:npm/pdfkit");
  assert.equal(note.frontmatter.tried, true);
  assert.deepEqual(note.sections.map((s) => s.name), SECTIONS);
  assert.equal(note.verdict, "avoid: async streams painful; use puppeteer");
  assert.equal(note.status, "reviewed");
  assert.deepEqual(note.warnings, []);
  assert.deepEqual(validate(note), []);
});

test("a Verdict with only a comment is empty, so the note is inbox", () => {
  const note = readNote(CANONICAL.replace("avoid: async streams painful; use puppeteer", "<!-- one line: what you decided -->"));
  assert.equal(note.verdict, "");
  assert.equal(note.status, "inbox");
});

test("a note without frontmatter is read; validate reports it", () => {
  const note = readNote("## Verdict\nfine for small CLIs\n");
  assert.equal(note.hasFrontmatter, false);
  assert.deepEqual(note.frontmatter, {});
  assert.equal(note.status, "reviewed");
  assert.deepEqual(validate(note).map((p) => p.where), ["frontmatter"]);
});

test("missing sections are allowed", () => {
  const note = readNote(CANONICAL.replace(/\n## Notable skills\n\n## My notes\n\n## Related\n/, "\n"));
  assert.deepEqual(note.sections.map((s) => s.name), SECTIONS.slice(0, 5));
  assert.deepEqual(validate(note), []);
});

test("unknown sections are kept, in place, with no canonical name", () => {
  const note = readNote(CANONICAL.replace("## My notes", "## Benchmarks\n200 pages in 3 s\n\n## My notes"));
  const i = note.sections.findIndex((s) => s.heading === "Benchmarks");
  assert.equal(note.sections[i].name, null);
  assert.match(note.sections[i].body, /200 pages in 3 s/);
  assert.equal(note.sections[i + 1].name, "My notes");
  assert.deepEqual(validate(note), []);
});

test("headings match canonical names regardless of case and spacing", () => {
  const note = readNote("---\nid: pkg:npm/pdfkit\n---\n##   verdict  \nok\n");
  assert.equal(note.sections[0].name, "Verdict");
  assert.equal(note.verdict, "ok");
});

test("a '## ' line inside a fenced code block does not start a section", () => {
  const note = readNote(CANONICAL.replace("`npm install pdfkit`", "```md\n## not a heading\n```"));
  assert.deepEqual(note.sections.map((s) => s.name), SECTIONS);
  assert.match(note.sections[4].body, /## not a heading/);
});

test("text before the first section is kept as the preamble", () => {
  const note = readNote(CANONICAL.replace("---\n\n## Verdict", "---\nA stray line.\n\n## Verdict"));
  assert.match(note.preamble, /A stray line\./);
});

test("CRLF line endings read the same", () => {
  const note = readNote(CANONICAL.replace(/\n/g, "\r\n"));
  assert.deepEqual(note.sections.map((s) => s.name), SECTIONS);
  assert.equal(note.verdict, "avoid: async streams painful; use puppeteer");
  assert.deepEqual(validate(note), []);
});

test("unparsable frontmatter: a warning, an empty frontmatter, and the body still read", () => {
  const note = readNote("---\nid: [unclosed\n---\n## Verdict\nok\n");
  assert.equal(note.hasFrontmatter, true);
  assert.deepEqual(note.frontmatter, {});
  assert.equal(note.warnings.length, 1);
  assert.equal(note.verdict, "ok");
  assert.ok(validate(note).some((p) => p.where === "frontmatter"));
});

test("a section that starts with the draft marker is a draft", () => {
  const note = readNote(CANONICAL.replace("- quick one-page PDFs", "<!-- magpie:draft -->\n- quick one-page PDFs"));
  assert.equal(note.sections.find((s) => s.name === "Use when")?.draft, true);
  assert.equal(note.sections.find((s) => s.name === "Avoid when")?.draft, false);
  assert.deepEqual(validate(note), []);
});

// validate(): one problem per broken rule, located by field or section; it never throws.
const FIELD_PROBLEMS: [string, string, string][] = [
  ["missing id", "id: pkg:npm/pdfkit\n", "frontmatter.id"],
  ["missing name", "name: pdfkit\n", "frontmatter.name"],
  ["missing explored", "explored: 2026-10-03\n", "frontmatter.explored"],
  ["missing kind", "kind: library\n", "frontmatter.kind"],
  ["missing tags", "tags: [pdf]\n", "frontmatter.tags"],
  ["missing tried", "tried: true\n", "frontmatter.tried"],
  ["missing status", "status: reviewed\n", "frontmatter.status"],
];

for (const [label, line, where] of FIELD_PROBLEMS) {
  test(`validate: ${label}`, () => {
    assert.equal(problemsAbout(CANONICAL.replace(line, ""), where).length, 1);
  });
}

const VALUE_PROBLEMS: [string, string, string, string][] = [
  ["id with a version", "id: pkg:npm/pdfkit", "id: pkg:npm/pdfkit@0.15.0", "frontmatter.id"],
  ["id of an unsupported type", "id: pkg:npm/pdfkit", "id: pkg:maven/org.x/y", "frontmatter.id"],
  ["id that is not a PURL", "id: pkg:npm/pdfkit", "id: pdfkit", "frontmatter.id"],
  ["kind outside the list", "kind: library", "kind: gadget", "frontmatter.kind"],
  ["tag not kebab-case", "tags: [pdf]", "tags: [Not Kebab]", "frontmatter.tags"],
  ["tags not a list", "tags: [pdf]", "tags: pdf", "frontmatter.tags"],
  ["tried not a boolean", "tried: true", "tried: yes please", "frontmatter.tried"],
  ["rating above 5", "rating: 2", "rating: 7", "frontmatter.rating"],
  ["rating not a whole number", "rating: 2", "rating: 2.5", "frontmatter.rating"],
  ["status outside the list", "status: reviewed", "status: done", "frontmatter.status"],
  ["explored not YYYY-MM-DD", "explored: 2026-10-03", "explored: 03/10/2026", "frontmatter.explored"],
  ["packages entry not a PURL", "packages: []", "packages: [npm:pdfkit]", "frontmatter.packages"],
  ["packages entry with a version", "packages: []", "packages: [pkg:npm/pdfkit@1.0]", "frontmatter.packages"],
  ["topics not a list", "topics: []", "topics: pdf", "frontmatter.topics"],
  ["license not a string", "license: MIT", "license: 42", "frontmatter.license"],
  ["alternatives not a list", "status: reviewed", 'status: reviewed\nalternatives: "[[npm--puppeteer]]"', "frontmatter.alternatives"],
  ["alternatives with an item that is not text", "status: reviewed", 'status: reviewed\nalternatives: ["[[npm--puppeteer]]", 3]', "frontmatter.alternatives"],
];

test("validate: alternatives as quoted wikilinks are fine; a malformed one leaves the note readable", () => {
  assert.deepEqual(validate(readNote(CANONICAL.replace("status: reviewed", 'status: reviewed\nalternatives: ["[[npm--puppeteer]]", "[[zod|Zod]]"]'))), []);
  const broken = readNote(CANONICAL.replace("status: reviewed", "status: reviewed\nalternatives: {a: b}"));
  assert.deepEqual(broken.warnings, []);
  assert.equal(broken.frontmatter.id, "pkg:npm/pdfkit");
  assert.deepEqual(validate(broken).map((p) => p.where), ["frontmatter.alternatives"]);
});

for (const [label, from, to, where] of VALUE_PROBLEMS) {
  test(`validate: ${label}`, () => {
    assert.equal(problemsAbout(CANONICAL.replace(from, to), where).length, 1);
  });
}

test("validate: an empty rating is allowed", () => {
  assert.deepEqual(validate(readNote(CANONICAL.replace("rating: 2", "rating:"))), []);
});

test("validate: status reviewed with an empty Verdict", () => {
  const text = CANONICAL.replace("avoid: async streams painful; use puppeteer", "");
  assert.equal(problemsAbout(text, "frontmatter.status").length, 1);
});

test("validate: status inbox with a written Verdict", () => {
  assert.equal(problemsAbout(CANONICAL.replace("status: reviewed", "status: inbox"), "frontmatter.status").length, 1);
});

test("validate: a Verdict longer than one line", () => {
  const text = CANONICAL.replace("use puppeteer\n", "use puppeteer\nand another line\n");
  assert.equal(problemsAbout(text, "section.Verdict").length, 1);
});

test("validate: the draft marker in the Verdict", () => {
  const text = CANONICAL.replace("avoid: async", "<!-- magpie:draft -->\navoid: async");
  assert.ok(problemsAbout(text, "section.Verdict").length >= 1);
});

test("validate: the draft marker in Avoid when is allowed (import's avoid: text)", () => {
  const text = CANONICAL.replace("- you need streamed output", "<!-- magpie:draft -->\n- you need streamed output");
  assert.deepEqual(validate(readNote(text)), []);
});

test("validate: the draft marker in a section AI may not draft", () => {
  const text = CANONICAL.replace("## My notes\n", "## My notes\n<!-- magpie:draft -->\nsomething\n");
  assert.equal(problemsAbout(text, "section.My notes").length, 1);
});

test("validate: canonical sections out of order", () => {
  const text = CANONICAL.replace("## Use when", "## TMP").replace("## Avoid when", "## Use when").replace("## TMP", "## Avoid when");
  assert.equal(problemsAbout(text, "sections").length, 1);
});

test("validate: a canonical section twice", () => {
  assert.equal(problemsAbout(CANONICAL + "\n## Verdict\nagain\n", "sections").length, 1);
});

test("validate: the file name must match the id", () => {
  const note = readNote(CANONICAL);
  assert.deepEqual(validate(note, { fileName: "npm--pdfkit.md" }), []);
  assert.equal(validate(note, { fileName: "npm--other.md" }).filter((p) => p.where === "file").length, 1);
});

test("readNote and validate never throw", () => {
  for (const text of ["", "---", "---\n---", "---\n:\n---\n", "## \n", "\u0000\u0001", "---\n- a\n- b\n---\n## Verdict\nx\n"]) {
    const note = readNote(text);
    assert.ok(Array.isArray(validate(note)));
  }
});
