import assert from "node:assert/strict";
import { test } from "node:test";
import { isDomain } from "../src/core/domains.ts";
import { README_LIMIT } from "../src/core/github.ts";
import { KINDS } from "../src/core/note.ts";
import { classify, fixture as file } from "./eval-classification.ts";

const fixture = file.repositories;

// The classification eval's fixture (scripts/fixtures/classification.json) stays consistent, so
// npm run eval:classification measures what it says. The eval itself only reports; it isn't a test.

test("each repository is listed once, with a known kind and at most 3 known domains, each once", () => {
  const names = fixture.map((c) => c.full_name);
  assert.ok(names.length >= 60);
  assert.equal(new Set(names).size, names.length);
  for (const { full_name, expected } of fixture) {
    assert.ok(KINDS.includes(expected.kind), full_name);
    assert.ok(expected.domains.length <= 3 && expected.domains.every(isDomain), full_name);
    assert.equal(new Set(expected.domains).size, expected.domains.length, full_name);
  }
});

test("each repository has every signal the classifier reads; README excerpts fit the limit", () => {
  for (const c of fixture) {
    assert.ok(Array.isArray(c.topics) && Array.isArray(c.keywords) && Array.isArray(c.packages), c.full_name);
    assert.equal(typeof c.skill_folders, "number", c.full_name);
    for (const flag of [c.is_template, c.plugin, c.bin, c.action]) assert.equal(typeof flag, "boolean", c.full_name);
    assert.ok(c.readme === null || (typeof c.readme === "string" && c.readme.length <= README_LIMIT), c.full_name);
  }
});

test("classify: the run before reads only what beta.13 read", () => {
  const c = { ...fixture[0], keywords: ["database"], readme: "Run end-to-end tests and e2e testing.", action: true };
  const before = classify(c, false);
  assert.deepEqual(before, classify({ ...c, keywords: [], readme: null, action: false }, false));
});
