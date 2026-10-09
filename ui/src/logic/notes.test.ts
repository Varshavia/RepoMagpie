import { test } from "node:test";
import assert from "node:assert/strict";
import type { NoteSummary } from "../../../src/core/documents.ts";
import { filterNotes, nextAfter, noteKey, shownTags, SIDEBAR_TAGS, sidebarCounts, tagListState } from "./notes.ts";

// The sidebar's Tags section from the Tag list document: an empty state for a journal with notes but
// no tags.md ("Create tag list"), or with a tags.md that lists no tags ("Edit tag list").
test("tagListState: missing, empty, or ready", () => {
  assert.equal(tagListState({ tags: [], exists: false }), "missing");
  assert.equal(tagListState({ tags: [], exists: true }), "empty");
  assert.equal(tagListState({ tags: ["pdf"], exists: true }), "ready");
  // A journal not created yet: no tags.md, but the starter list comes with its first note.
  assert.equal(tagListState({ tags: ["pdf"], exists: false }), "ready");
});

// The sidebar's counts and the centre list come from one Note list document per journal.

const note = (over: Partial<NoteSummary>): NoteSummary => ({
  id: "pkg:npm/x", file: "npm--x.md", name: "x", kind: "library", tags: [], status: "reviewed", verdict: "fine",
  tried: false, rating: null, explored: "2026-10-01", read_only: false, ...over,
});

const NOTES = [
  note({ id: "pkg:npm/pdfkit", file: "npm--pdfkit.md", name: "pdfkit", tags: ["pdf"] }),
  note({ id: "pkg:npm/left-pad", file: "npm--left-pad.md", name: "left-pad", status: "inbox", verdict: "" }),
  note({ id: "pkg:github/a/cli", file: "github--a--cli.md", name: "a/cli", kind: "cli", tags: ["pdf", "testing"], status: "inbox", verdict: "" }),
  note({ id: null, file: "npm--broken.md", name: null, kind: null, status: "inbox", verdict: "", read_only: true }),
];

test("sidebarCounts: all, inbox, kinds by name, tags by count then name", () => {
  assert.deepEqual(sidebarCounts(NOTES), {
    all: 4,
    inbox: 3,
    kinds: [{ name: "cli", count: 1 }, { name: "library", count: 2 }],
    tags: [{ name: "pdf", count: 2 }, { name: "testing", count: 1 }],
  });
});

// The sidebar's Tags section at scale (decision 0030): the 15 tags with the most notes, or all of them.
test("shownTags: the first 15 (counts come sorted), all when asked; the tag open in the centre stays visible", () => {
  const tags = Array.from({ length: 40 }, (_, i) => ({ name: `t${String(i).padStart(2, "0")}`, count: 40 - i }));
  assert.equal(SIDEBAR_TAGS, 15);
  assert.deepEqual(shownTags(tags, false, null), tags.slice(0, 15));
  assert.deepEqual(shownTags(tags, true, null), tags);
  assert.deepEqual(shownTags(tags, false, "t30"), [...tags.slice(0, 15), tags[30]]);
  assert.deepEqual(shownTags(tags, false, "t03"), tags.slice(0, 15));
  assert.deepEqual(shownTags(tags, false, "gone"), tags.slice(0, 15));
  assert.deepEqual(shownTags(tags.slice(0, 15), false, null), tags.slice(0, 15));
});

test("filterNotes: inbox, all, one kind, one tag; the document's order is kept", () => {
  const names = (list: NoteSummary[]) => list.map((n) => n.file);
  assert.deepEqual(names(filterNotes(NOTES, { list: "inbox" })), ["npm--left-pad.md", "github--a--cli.md", "npm--broken.md"]);
  assert.deepEqual(names(filterNotes(NOTES, { list: "all" })), names(NOTES));
  assert.deepEqual(names(filterNotes(NOTES, { list: "kind", value: "cli" })), ["github--a--cli.md"]);
  assert.deepEqual(names(filterNotes(NOTES, { list: "tag", value: "pdf" })), ["npm--pdfkit.md", "github--a--cli.md"]);
});

test("noteKey: journal and id, or journal and file for a read-only note", () => {
  assert.equal(noteKey("personal", NOTES[0]), "personal id pkg:npm/pdfkit");
  assert.equal(noteKey("project", NOTES[3]), "project file npm--broken.md");
});

test("nextAfter: after saving, the next row; at the end the one before; none when the list is done", () => {
  const keys = ["a", "b", "c"];
  assert.equal(nextAfter(keys, "b"), "c");
  assert.equal(nextAfter(keys, "c"), "b");
  assert.equal(nextAfter(["a"], "a"), null);
  assert.equal(nextAfter(keys, "gone"), "a");
  assert.equal(nextAfter([], "gone"), null);
});
