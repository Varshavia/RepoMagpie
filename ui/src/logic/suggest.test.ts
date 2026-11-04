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
    { id: "pkg:npm/commander", journal: "project", name: "commander", verdict: "our CLI parser", status: "reviewed", tags: [], score: 3, why: { keywords: ["cli"], dependencies: [] }, path: "/p/.magpie/notes/npm--commander.md", alternatives: [] },
    { id: "pkg:npm/commander", journal: "personal", name: "commander", verdict: "fine", status: "reviewed", tags: [], score: 2, why: { keywords: ["cli"], dependencies: [] }, path: "/h/notes/npm--commander.md", alternatives: [] },
    { id: "pkg:npm/tsx", journal: "personal", name: "tsx", verdict: null, status: "inbox", tags: [], score: 1, why: { keywords: ["pdf"], dependencies: [] }, path: "/h/notes/npm--tsx.md", alternatives: [] },
  ],
  in_use_avoid: [{
    query: "@foo/pdf", id: "pkg:npm/%40foo/pdf", journal: "personal", confidence: "exact", verdict: "avoid: slow", avoid_when: [], use_when: [], drafts: [], status: "reviewed", path: "/h/notes/npm--foo--pdf.md", alternatives: [],
    matched: true,
  }],
};

const main = (items: ReturnType<typeof suggestItems>) => items.filter((i) => !i.section);

test("one row per package: candidates in the API's order, then the matched in-use avoid notes, then the section; each key unique", () => {
  const items = suggestItems(DOC);
  assert.deepEqual(items.map((i) => [i.kind, i.section, i.journals.join(" · "), i.name, i.verdict]), [
    ["candidate", false, "project · personal", "commander", "our CLI parser"],
    ["candidate", false, "personal", "tsx", null],
    ["avoid", false, "personal", "@foo/pdf", "avoid: slow"],
    ["avoid", true, "personal", "@foo/pdf", "avoid: slow"],
  ]);
  const keys = items.map(suggestKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0], "project id pkg:npm/commander", "the same key form as search results");
  assert.equal(keys[3], "personal id pkg:npm/%40foo/pdf avoided");
});

test("the merge: the project's note shows whichever journal comes first; notes without an id stay apart", () => {
  const [project, personal] = DOC.candidates;
  const items = main(suggestItems({ ...DOC, candidates: [personal, project, { ...personal, id: null, name: "x" }, { ...personal, id: null, name: "y" }], in_use_avoid: [] }));
  assert.deepEqual(items.map((i) => [i.journal, i.journals.join(" · "), i.name, i.verdict]), [
    ["project", "project · personal", "commander", "our CLI parser"],
    ["personal", "personal", "x", "fine"],
    ["personal", "personal", "y", "fine"],
  ]);
});

test("in-use avoid notes: in the list only when the need matched them, one row per package; all of them in the section", () => {
  const avoid = DOC.in_use_avoid[0];
  const doc: SuggestJson = {
    ...DOC,
    in_use_avoid: [
      { ...avoid, id: "pkg:npm/lodash", journal: "project", matched: false },
      { ...avoid, id: "pkg:npm/lodash", journal: "personal", matched: false },
      { ...avoid, id: "pkg:npm/moment", journal: "personal", matched: true },
    ],
  };
  const items = suggestItems(doc);
  assert.deepEqual(main(items).filter((i) => i.kind === "avoid").map((i) => i.name), ["moment"]);
  assert.deepEqual(items.filter((i) => i.section).map((i) => `${i.name} ${i.journals.join(" · ")}`), ["lodash project · personal", "moment personal"]);
});

test("an avoid row keeps its confidence and its type", () => {
  const avoid = suggestItems({ ...DOC, in_use_avoid: [{ ...DOC.in_use_avoid[0], confidence: "name-only", id: "pkg:github/foo/pdf" }] }).at(-1);
  assert.equal(avoid?.nameOnly, true);
  assert.equal(avoid?.type, "github");
  assert.equal(avoid?.name, "foo/pdf");
});

// The Instead line (decision 0029), as magpie suggest prints it: an exact in-use avoid note's
// alternatives, at most 3 and a count of the rest; none for a name-only match or a candidate.
const alternative = (name: string) => ({ name, id: `pkg:npm/${name}`, journal: "personal" as const, verdict: "fine", status: "reviewed" as const, avoid: false, path: `/h/notes/npm--${name}.md` });

test("an exact in-use avoid row carries up to 3 alternatives and the count of the rest; name-only and candidate rows none", () => {
  const five = ["a", "b", "c", "d", "e"].map(alternative);
  const doc: SuggestJson = {
    ...DOC,
    candidates: DOC.candidates.map((c) => ({ ...c, alternatives: [alternative("x")] })),
    in_use_avoid: [
      { ...DOC.in_use_avoid[0], alternatives: five },
      { ...DOC.in_use_avoid[0], id: "pkg:github/foo/pdf", confidence: "name-only", alternatives: [alternative("y")] },
      { ...DOC.in_use_avoid[0], id: "pkg:npm/bar", alternatives: [] },
    ],
  };
  const items = main(suggestItems(doc));
  assert.deepEqual(items.map((i) => [i.instead.map((a) => a.name), i.moreInstead]), [
    [[], 0], [[], 0],
    [["a", "b", "c"], 2],
    [[], 0],
    [[], 0],
  ]);
});

test("each candidate carries its why line; an avoid row has none", () => {
  const items = suggestItems(DOC);
  assert.deepEqual(items.map((i) => i.why), ["Why: matched cli", "Why: matched pdf", null, null]);
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
