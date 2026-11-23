import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultChecked, languagesOf, NO_FILTERS, shownStars, skipped, starsSummary, type StarRow } from "./stars.ts";

// "Import my GitHub stars" (decision 0068): the table's filters, its default checks and its summary.

const star = (name: string, over: Partial<StarRow> = {}): StarRow => ({
  name, id: `pkg:github/${name}`, url: `https://github.com/${name}`, description: null, language: "TypeScript", license: "MIT", topics: [], archived: false, pushed_at: null, starred: "2026-11-01", in_journal: [], in_trash: [], ...over,
});

const STARS = [
  star("a/new-ts", { starred: "2026-11-20", topics: ["cli"] }),
  star("a/noted", { starred: "2026-11-10", in_journal: ["personal"] }),
  star("a/go", { starred: "2026-10-01", language: "Go", topics: ["cli", "web"] }),
  star("a/none", { starred: "2026-01-01", language: null }),
  star("a/deleted", { starred: "2025-12-01", in_trash: ["personal"] }),
];

test("shownStars: the filters keep stars already in a journal or its trash too; defaultChecked takes only new ones", () => {
  assert.deepEqual(shownStars(STARS, NO_FILTERS).map((s) => s.name), ["a/new-ts", "a/noted", "a/go", "a/none", "a/deleted"]);
  assert.deepEqual(shownStars(STARS, { ...NO_FILTERS, topic: "CLI" }).map((s) => s.name), ["a/new-ts", "a/go"]);
  assert.deepEqual(shownStars(STARS, { ...NO_FILTERS, language: "TypeScript", since: "2026-11-01" }).map((s) => s.name), ["a/new-ts", "a/noted"]);
  assert.deepEqual([...defaultChecked(STARS, NO_FILTERS)], ["a/new-ts", "a/go", "a/none"]);
  assert.deepEqual([...defaultChecked(STARS, { ...NO_FILTERS, language: "Go" })], ["a/go"]);
  assert.deepEqual([...defaultChecked(STARS, { ...NO_FILTERS, since: "not a date" })], ["a/new-ts", "a/go", "a/none"], "a half-typed date filters nothing");
  assert.deepEqual(STARS.filter(skipped).map((s) => s.name), ["a/noted", "a/deleted"]);
});

test("defaultChecked: the 100 most recently starred new ones, as import --stars", () => {
  const many = Array.from({ length: 150 }, (_, i) => star(`b/r${i}`));
  assert.equal(defaultChecked(many, NO_FILTERS).size, 100);
  assert.ok(defaultChecked(many, NO_FILTERS).has("b/r99") && !defaultChecked(many, NO_FILTERS).has("b/r100"));
});

test("starsSummary and languagesOf", () => {
  assert.equal(starsSummary({ total: 2431, new: 2311, in_journal: 120, in_trash: 0, complete: true }), "2,431 stars: 2,311 new, 120 already in your journal.");
  assert.equal(starsSummary({ total: 200, new: 200, in_journal: 0, in_trash: 0, complete: false }), "200 stars read (not all): 200 new, 0 already in your journal.");
  assert.equal(starsSummary({ total: 2431, new: 2309, in_journal: 120, in_trash: 2, complete: true }), "2,431 stars: 2,309 new, 120 already in your journal, 2 skipped because they're in the trash.");
  assert.deepEqual(languagesOf(STARS), ["TypeScript", "Go"]);
});
