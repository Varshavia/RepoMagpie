import { test } from "node:test";
import assert from "node:assert/strict";
import type { NoteJson } from "../../../src/core/documents.ts";
import { formOf, oneLine, parseTags, patchFor, tagProblems } from "./edits.ts";

// The edit the app sends (PATCH /api/note, spec "Editing a note"): only what the person changed,
// with the version the note was read with.

const NOTE: NoteJson = {
  id: "pkg:npm/left-pad", journal: "personal", file: "npm--left-pad.md", path: "/j/notes/npm--left-pad.md", version: "sha256:abc",
  read_only: false, status: "inbox", verdict: "", frontmatter: { id: "pkg:npm/left-pad", kind: "library", tags: ["text"], tried: false, rating: null },
  sections: [], skills: [], warnings: [],
};

test("formOf reads the human-owned fields from the note", () => {
  assert.deepEqual(formOf(NOTE), { verdict: "", kind: "library", tags: ["text"], tried: false, rating: null });
  assert.deepEqual(formOf({ ...NOTE, verdict: null, frontmatter: { tags: "oops", rating: 9 } }), { verdict: "", kind: "", tags: [], tried: false, rating: null });
});

test("patchFor sends only what changed, with journal, id and version", () => {
  const form = formOf(NOTE);
  assert.equal(patchFor(NOTE, form), null);
  assert.deepEqual(patchFor(NOTE, { ...form, verdict: "  fine for padding  " }), { journal: "personal", id: "pkg:npm/left-pad", version: "sha256:abc", verdict: "fine for padding" });
  assert.deepEqual(patchFor(NOTE, { ...form, tried: true, rating: 4, tags: ["text", "strings"] }), {
    journal: "personal", id: "pkg:npm/left-pad", version: "sha256:abc", fields: { tags: ["text", "strings"], tried: true, rating: 4 },
  });
  assert.deepEqual(patchFor(NOTE, { ...form, kind: "cli" }), { journal: "personal", id: "pkg:npm/left-pad", version: "sha256:abc", fields: { kind: "cli" } });
});

test("a read-only note, or one without a version, can't be patched", () => {
  assert.equal(patchFor({ ...NOTE, read_only: true }, { ...formOf(NOTE), verdict: "x" }), null);
  assert.equal(patchFor({ ...NOTE, version: null }, { ...formOf(NOTE), verdict: "x" }), null);
});

test("oneLine: the Verdict is one line", () => {
  assert.equal(oneLine(" avoid:\n  slow \r\n streams "), "avoid: slow streams");
});

test("parseTags: commas or spaces, lowercase, no repeats; tagProblems names the ones core refuses", () => {
  assert.deepEqual(parseTags("PDF, testing  testing,agent-skills,"), ["pdf", "testing", "agent-skills"]);
  assert.deepEqual(tagProblems(["pdf", "agent_skills", "x-"]), ["agent_skills", "x-"]);
});
