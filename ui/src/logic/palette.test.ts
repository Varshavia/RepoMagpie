import { test } from "node:test";
import assert from "node:assert/strict";
import { noteResults, rankActions } from "./palette.ts";

// The command palette's actions, matched as you type.

const ACTIONS = [
  { id: "inbox", label: "Go to Inbox", keywords: "review" },
  { id: "add", label: "Add a note", keywords: "new url repository" },
  { id: "import", label: "Import lines", keywords: "bulk" },
  { id: "theme-light", label: "Use the light theme", keywords: "appearance" },
];

const ids = (query: string) => rankActions(ACTIONS, query).map((a) => a.id);

test("no query: every action, in order", () => {
  assert.deepEqual(ids("  "), ["inbox", "add", "import", "theme-light"]);
});

test("every word must appear in the label or keywords", () => {
  assert.deepEqual(ids("im"), ["import"]);
  assert.deepEqual(ids("light THEME"), ["theme-light"]);
  assert.deepEqual(ids("repository"), ["add"]);
  assert.deepEqual(ids("zebra"), []);
});

test("actions with a label word that starts with the query come first; otherwise the order is kept", () => {
  assert.deepEqual(ids("t"), ["inbox", "theme-light", "add", "import"]); // "to", "the"; then "note", "Import"
  assert.deepEqual(ids("li"), ["import", "theme-light"]);
  assert.deepEqual(ids("ox"), ["inbox"]);
});

// The notes part: only the answer to exactly what is typed now, so the palette shows what
// magpie search shows for it, and never "nothing matches" before the search has answered.

test("notes: the answer for the typed query, trimmed", () => {
  assert.deepEqual(noteResults(" design ", { query: "design", results: ["a", "b"] }), { notes: ["a", "b"], pending: false, error: null });
  assert.deepEqual(noteResults("design", { query: "design", results: [] }), { notes: [], pending: false, error: null });
});

test("notes: nothing typed, nothing to search", () => {
  assert.deepEqual(noteResults("  ", null), { notes: [], pending: false, error: null });
  assert.deepEqual(noteResults("", { query: "design", results: ["a"] }), { notes: [], pending: false, error: null });
});

test("notes: before the answer for this query, pending, without another query's results", () => {
  assert.deepEqual(noteResults("design", null), { notes: [], pending: true, error: null });
  assert.deepEqual(noteResults("design", { query: "des", results: ["a"] }), { notes: [], pending: true, error: null });
});

test("notes: a failed search gives its error, not an empty result", () => {
  assert.deepEqual(noteResults("design", { query: "design", results: [], error: "The server answered 500." }), { notes: [], pending: false, error: "The server answered 500." });
});
