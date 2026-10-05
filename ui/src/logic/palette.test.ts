import { test } from "node:test";
import assert from "node:assert/strict";
import { rankActions } from "./palette.ts";

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
