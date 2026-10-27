import assert from "node:assert/strict";
import { test } from "node:test";
import { isDomain } from "../src/core/domains.ts";
import { README_LIMIT } from "../src/core/github.ts";
import { KINDS } from "../src/core/note.ts";
import { classify, fixture as file, holdout as heldOut, score } from "./eval-classification.ts";

const fixture = file.repositories;
const holdout = heldOut.repositories;

// The classification eval's fixture (scripts/fixtures/classification.json) stays consistent, so
// npm run eval:classification measures what it says. The eval itself only reports; it isn't a test.

test("each repository is listed once, with a known kind and at most 3 known domains, each once", () => {
  const names = fixture.map((c) => c.full_name);
  assert.ok(names.length >= 60);
  assert.equal(new Set(names).size, names.length);
  for (const { full_name, expected } of fixture) {
    const domains = expected.domains ?? [];
    assert.ok(KINDS.includes(expected.kind) && expected.domains, full_name);
    assert.ok(domains.length <= 3 && domains.every(isDomain), full_name);
    assert.equal(new Set(domains).size, domains.length, full_name);
  }
});

// The held-out set: 30 repositories none of the first set has, chosen for spread (brief O2, A2), each
// with a kind and its reason, and no domains (they are scored on the first set only).
test("the held-out set: 30 new repositories, a known kind and a reason each, the spread it was chosen for", () => {
  const names = holdout.map((c) => c.full_name.toLowerCase());
  assert.equal(names.length, 30);
  assert.equal(new Set(names).size, 30);
  const first = new Set(fixture.map((c) => c.full_name.toLowerCase()));
  assert.deepEqual(names.filter((name) => first.has(name)), []);
  for (const { full_name, expected } of holdout) {
    assert.ok(KINDS.includes(expected.kind), full_name);
    assert.ok(expected.reason && !expected.domains, full_name);
  }
  const count = (kind: string) => holdout.filter((c) => c.expected.kind === kind).length;
  for (const kind of ["library", "framework", "app", "cli"]) assert.ok(count(kind) >= 4, kind);
  for (const kind of ["platform", "skill-pack"]) assert.ok(count(kind) >= 3, kind);
  for (const kind of ["plugin", "template", "awesome-list", "other"]) assert.ok(count(kind) >= 2, kind);
  assert.ok(holdout.filter((c) => c.action).length >= 2);
  assert.ok(holdout.filter((c) => c.expected.kind !== "skill-pack" && (c.skill_folders ?? 0) >= 3).length >= 3);
});

test("score: domains count only where a case has expected domains", () => {
  const s = score(holdout, true);
  assert.deepEqual([s.suggested, s.expected, s.exact], [0, 0, 0]);
});

test("each repository has every signal the classifier reads; README excerpts fit the limit", () => {
  for (const c of [...fixture, ...holdout]) {
    assert.ok(Array.isArray(c.topics) && Array.isArray(c.keywords) && Array.isArray(c.packages), c.full_name);
    assert.equal(typeof c.skill_folders, "number", c.full_name);
    assert.ok(Array.isArray(c.root_folders) && c.root_folders.every((folder) => !folder.startsWith(".")), c.full_name);
    for (const flag of [c.is_template, c.plugin, c.bin, c.action]) assert.equal(typeof flag, "boolean", c.full_name);
    assert.ok(c.readme === null || (typeof c.readme === "string" && c.readme.length <= README_LIMIT), c.full_name);
  }
});

test("classify: the run before reads only what beta.13 read", () => {
  const c = { ...fixture[0], keywords: ["database"], readme: "Run end-to-end tests and e2e testing.", action: true };
  const before = classify(c, false);
  assert.deepEqual(before, classify({ ...c, keywords: [], readme: null, action: false }, false));
});
