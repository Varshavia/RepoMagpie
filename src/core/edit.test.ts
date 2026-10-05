import { test } from "node:test";
import assert from "node:assert/strict";
import { editNote, noteVersion } from "./edit.ts";
import { readNote } from "./note.ts";
import { acceptDraft, setHumanFields, setSection, setVerdict } from "./write.ts";

// A note as a person might keep it: a comment, a block list, a drafted section.
const NOTE = `---
id: pkg:npm/pdfkit   # the subject
name: pdfkit
explored: 2026-10-01
kind: library
tags:
  - pdf
tried: false
rating:
status: inbox
---

## Verdict
<!-- one line -->

## Use when
<!-- magpie:draft -->
- quick one-page PDFs

## What it does
<!-- magpie:draft -->
A PDF library.

## My notes
Mine.
`;

test("a Verdict for an empty Verdict section is written as setVerdict writes it", () => {
  const r = editNote(NOTE, { verdict: "avoid: async streams painful" });
  assert.deepEqual(r, { ok: true, text: setVerdict(NOTE, "avoid: async streams painful").text, changed: true });
});

test("changing an existing Verdict replaces the section's body, as setSection does", () => {
  const reviewed = setVerdict(NOTE, "first").text;
  const r = editNote(reviewed, { verdict: "second" });
  assert.deepEqual(r, { ok: true, text: setSection(reviewed, "Verdict", "second").text, changed: true });
});

test("an empty Verdict clears it and the note goes back to inbox", () => {
  const reviewed = setVerdict(NOTE, "first").text;
  const r = editNote(reviewed, { verdict: "" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(readNote(r.text).frontmatter.status, "inbox");
});

test("the same Verdict again changes nothing", () => {
  const reviewed = setVerdict(NOTE, "first").text;
  assert.deepEqual(editNote(reviewed, { verdict: " first " }), { ok: true, text: reviewed, changed: false });
});

test("sections, fields and accepted drafts are applied together; the rest stays byte for byte", () => {
  const r = editNote(NOTE, {
    sections: { "My notes": "Tried it." },
    fields: { tags: ["pdf", "testing"], tried: true, rating: 4 },
    accept_drafts: ["What it does"],
  });
  let expected = setHumanFields(NOTE, { tags: ["pdf", "testing"], tried: true, rating: 4 }).text;
  expected = setSection(expected, "My notes", "Tried it.").text;
  expected = acceptDraft(expected, "What it does").text;
  assert.deepEqual(r, { ok: true, text: expected, changed: true });
  assert.ok(r.ok && r.text.includes("id: pkg:npm/pdfkit   # the subject\n"));
});

test("no edits change nothing", () => {
  assert.deepEqual(editNote(NOTE, {}), { ok: true, text: NOTE, changed: false });
});

test("every bad edit is refused as a whole: nothing is applied", () => {
  const bad: Record<string, unknown>[] = [
    { verdict: "two\nlines" },
    { verdict: 3 },
    { sections: { "Use when": "- ok" }, fields: { kind: "gadget" } },
    { sections: { "My own section": "x" } },
    { sections: { Verdict: "use verdict instead" } },
    { sections: { "Use when": 5 } },
    { sections: ["Use when"] },
    { fields: { name: "PDFKit" } },
    { fields: { status: "reviewed" } },
    { fields: "kind" },
    { accept_drafts: ["Unknown"] },
    { accept_drafts: "What it does" },
    { status: "reviewed" },
    { id: "pkg:npm/other" },
  ];
  for (const edits of bad) {
    const r = editNote(NOTE, edits);
    assert.equal(r.ok, false, JSON.stringify(edits));
    if (!r.ok) assert.ok(r.error.length > 0);
  }
});

test("a note whose frontmatter can't be read is never edited", () => {
  const broken = NOTE.replace("name: pdfkit", "name: [pdfkit");
  const r = editNote(broken, { sections: { "My notes": "x" } });
  assert.equal(r.ok, false);
});

test("a version is sha256:<hex> of the file's bytes", () => {
  assert.equal(noteVersion("a"), "sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb");
  assert.equal(noteVersion(Buffer.from("a")), noteVersion("a"));
  assert.notEqual(noteVersion(NOTE), noteVersion(NOTE.replace(/\n/g, "\r\n")));
});
