import { test } from "node:test";
import assert from "node:assert/strict";
import type { NoteJson } from "../../../src/core/documents.ts";
import { addTopicSuggestions, formOf, fromTopicsSummary, oneLine, parseTags, patchFor, tagProblems, topicSuggestions, triedLine } from "./edits.ts";

// "From GitHub topics" (docs/ui.md §7): topics that could become tags.
test("topicSuggestions: topics not among the tags, in GitHub's order, at most 8, without the repository's name", () => {
  const topics = ["playwright", "testing", "browser-automation", "e2e", "cli", "agents", "mcp", "typescript", "automation", "chromium"];
  assert.deepEqual(topicSuggestions(topics, ["testing"], "pkg:github/microsoft/playwright"), ["browser-automation", "e2e", "cli", "agents", "mcp", "typescript", "automation", "chromium"]);
  assert.deepEqual(topicSuggestions(["playwright-cli", "cli"], [], "pkg:github/microsoft/playwright-cli"), ["cli"]);
  // Only topics that are valid tags; no topics, no chips.
  assert.deepEqual(topicSuggestions(["Not Valid", "a--b", "ok", 3, "ok"], [], "pkg:github/a/b"), ["ok"]);
  assert.deepEqual(topicSuggestions(undefined, [], "pkg:npm/pdfkit"), []);
  assert.deepEqual(topicSuggestions([], [], null), []);
  // Not a topic on the stop list (decision 0030); no ranking here.
  assert.deepEqual(topicSuggestions(["hacktoberfest", "pdf", "open-source", "hacktoberfest2024", "opensource", "good-first-issue", "llm"], [], "pkg:github/a/b"), ["pdf", "llm"]);
});

test("fromTopicsSummary: what 'Add GitHub topics as tags' will do, from its dry run", () => {
  const doc = (notes: number, newTags: number, skipped = 0) => ({
    journal: "personal" as const,
    notes: Array.from({ length: notes }, (_, i) => ({ id: `pkg:github/a/n${i}`, path: `/j/notes/n${i}.md`, added: ["x"] })),
    skipped: Array.from({ length: skipped }, (_, i) => ({ path: `/j/notes/bad${i}.md`, reason: "Its frontmatter can't be read, or has no id." })),
    tags_md_added: Array.from({ length: newTags }, (_, i) => `t${i}`),
  });
  assert.equal(fromTopicsSummary(doc(17, 41)), "Adds up to 8 tags to 17 notes, and 41 new tags to your tag list.");
  assert.equal(fromTopicsSummary(doc(1, 1)), "Adds up to 8 tags to 1 note, and 1 new tag to your tag list.");
  assert.equal(fromTopicsSummary(doc(2, 0)), "Adds up to 8 tags to 2 notes. Your tag list already has them.");
  assert.equal(fromTopicsSummary(doc(0, 0)), "Nothing to add: every note has its GitHub topics as tags, or 8 tags already.");
  assert.equal(fromTopicsSummary(doc(3, 2, 2)), "Adds up to 8 tags to 3 notes, and 2 new tags to your tag list. 2 notes can't be read, so they stay as they are.");
  assert.equal(fromTopicsSummary(doc(0, 0, 1)), "Nothing to add: every note has its GitHub topics as tags, or 8 tags already. 1 note can't be read, so it stays as it is.");
});

test("addTopicSuggestions: core's ranked topics without the tags chosen so far, at most 8; a removed tag comes back", () => {
  const ranked = ["llm", "pdf", "a", "b", "c", "d", "e", "f", "g", "h"];
  assert.deepEqual(addTopicSuggestions(ranked, ranked.slice(0, 8)), ["g", "h"]);
  assert.deepEqual(addTopicSuggestions(ranked, ["pdf", "a", "b", "c", "d", "e", "f"]), ["llm", "g", "h"]);
  assert.deepEqual(addTopicSuggestions(ranked, []), ranked.slice(0, 8));
  assert.deepEqual(addTopicSuggestions([], ["x"]), []);
});

// The edit the app sends (PATCH /api/note, spec "Editing a note"): only what the person changed,
// with the version the note was read with.

const NOTE: NoteJson = {
  id: "pkg:npm/left-pad", journal: "personal", file: "npm--left-pad.md", path: "/j/notes/npm--left-pad.md", version: "sha256:abc",
  read_only: false, status: "inbox", verdict: "", frontmatter: { id: "pkg:npm/left-pad", kind: "library", tags: ["text"], tried: false, rating: null },
  sections: [], skills: [], links: [], backlinks: [], warnings: [],
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

// The line under a note's title in the note view (docs/ui.md §7): whether you ran it, and your rating.
test("triedLine: Tried and the rating; nothing for a note neither tried nor rated", () => {
  assert.equal(triedLine({ tried: true, rating: 4 }), "Tried · rated 4 of 5");
  assert.equal(triedLine({ tried: true, rating: null }), "Tried");
  assert.equal(triedLine({ tried: false, rating: 2 }), "Not tried · rated 2 of 5");
  assert.equal(triedLine({ tried: false, rating: null }), null);
});
