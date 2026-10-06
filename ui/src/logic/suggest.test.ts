import { test } from "node:test";
import assert from "node:assert/strict";
import { whyLine as cliWhyLine } from "../../../src/cli/suggest.ts";
import type { SuggestJson } from "../../../src/core/suggest.ts";
import { keywordLine, suggestItems, suggestKey, whyLine } from "./suggest.ts";

// The Suggest screen's list (docs/ui.md §7): candidates, Verdict first as the API sends them, then
// the dependencies you noted to avoid.

const DOC: SuggestJson = {
  source: "manifests",
  keywords: ["pdf", "cli"],
  candidates: [
    { id: "pkg:npm/commander", journal: "project", name: "commander", verdict: "our CLI parser", status: "reviewed", tags: [], score: 3, why: { keywords: ["cli"], dependencies: [] }, path: "/p/.magpie/notes/npm--commander.md" },
    { id: "pkg:npm/commander", journal: "personal", name: "commander", verdict: "fine", status: "reviewed", tags: [], score: 2, why: { keywords: ["cli"], dependencies: [] }, path: "/h/notes/npm--commander.md" },
    { id: "pkg:npm/tsx", journal: "personal", name: "tsx", verdict: null, status: "inbox", tags: [], score: 1, why: { keywords: ["pdf"], dependencies: [] }, path: "/h/notes/npm--tsx.md" },
  ],
  in_use_avoid: [{
    query: "@foo/pdf", id: "pkg:npm/%40foo/pdf", journal: "personal", confidence: "exact", verdict: "avoid: slow", avoid_when: [], use_when: [], drafts: [], status: "reviewed", path: "/h/notes/npm--foo--pdf.md",
  }],
};

test("candidates in the API's order, then the in-use avoid notes, each with a unique key", () => {
  const items = suggestItems(DOC);
  assert.deepEqual(items.map((i) => [i.kind, i.journal, i.name, i.verdict]), [
    ["candidate", "project", "commander", "our CLI parser"],
    ["candidate", "personal", "commander", "fine"],
    ["candidate", "personal", "tsx", null],
    ["avoid", "personal", "@foo/pdf", "avoid: slow"],
  ]);
  const keys = items.map(suggestKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0], "project id pkg:npm/commander", "the same key form as search results");
});

test("an avoid row keeps its confidence and its type", () => {
  const avoid = suggestItems({ ...DOC, in_use_avoid: [{ ...DOC.in_use_avoid[0], confidence: "name-only", id: "pkg:github/foo/pdf" }] }).at(-1);
  assert.equal(avoid?.nameOnly, true);
  assert.equal(avoid?.type, "github");
  assert.equal(avoid?.name, "foo/pdf");
});

test("each candidate carries its why line; an avoid row has none", () => {
  const items = suggestItems(DOC);
  assert.deepEqual(items.map((i) => i.why), ["Why: matched cli", "Why: matched cli", "Why: matched pdf", null]);
});

test("the why line equals magpie suggest's, word for word", () => {
  const cases = [
    { keywords: ["cli"], dependencies: [] },
    { keywords: ["playwright", "test", "coding", "agent"], dependencies: ["@playwright/test"] },
    { keywords: ["react", "dom", "ui"], dependencies: ["react", "react-dom"] },
    { keywords: ["types", "node"], dependencies: ["@types/node"] },
    { keywords: ["is", "number"], dependencies: ["is-number"] },
  ];
  for (const why of cases) assert.equal(whyLine(why), cliWhyLine(why), JSON.stringify(why));
});

test("the keyword line names the first keywords and counts the rest", () => {
  assert.equal(keywordLine(["pdf", "cli"]), "pdf, cli");
  assert.equal(keywordLine(Array.from({ length: 15 }, (_, i) => `k${i}`), 12), "k0, k1, k2, k3, k4, k5, k6, k7, k8, k9, k10, k11 and 3 more");
  assert.equal(keywordLine([]), "");
});
