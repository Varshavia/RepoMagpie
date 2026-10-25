import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isDomain } from "../src/core/domains.ts";

// The retrieval baseline's fixture (scripts/fixtures/retrieval.json) stays consistent, so
// npm run eval:retrieval measures what it says. The baseline itself only reports; it isn't a test.

const fixture = JSON.parse(readFileSync(new URL("fixtures/retrieval.json", import.meta.url), "utf8")) as {
  repositories: { full_name: string; description: string | null; topics: string[] }[];
  needs: { need: string; expected: string[]; category: string; split: string; structured: { query: string; domains: string[]; tags: string[] } }[];
  use_when: { about: string; items: Record<string, string[]> };
};

test("each need has a category, a split and a structured form an agent could pass: a query, known domains (at most 3), tags", () => {
  const count = (pick: (n: (typeof fixture.needs)[number]) => boolean) => fixture.needs.filter(pick).length;
  for (const category of ["concern", "technology", "turkish"]) assert.equal(count((n) => n.category === category), 20, category);
  assert.ok(count((n) => n.category === "use-case") >= 20);
  assert.equal(count((n) => !["concern", "technology", "use-case", "turkish"].includes(n.category)), 0);
  for (const category of ["concern", "technology", "use-case", "turkish"]) {
    const tuning = count((n) => n.category === category && n.split === "tuning");
    const heldOut = count((n) => n.category === category && n.split === "held-out");
    assert.ok(Math.abs(tuning - heldOut) <= 1 && tuning + heldOut === count((n) => n.category === category), category);
  }
  for (const { need, structured } of fixture.needs) {
    assert.ok(structured.query.trim().length > 0, need);
    assert.ok(structured.domains.length <= 3 && structured.domains.every(isDomain), need);
    assert.ok(structured.tags.every((t) => t.length > 0 && t.length <= 64), need);
  }
});
const kinds = JSON.parse(readFileSync(new URL("../src/core/fixtures/kinds.json", import.meta.url), "utf8")) as { repositories: { full_name: string }[] };

test("every expected repository is in the journal; names and needs are unique", () => {
  const names = fixture.repositories.map((r) => r.full_name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(fixture.needs.map((n) => n.need)).size, fixture.needs.length);
  for (const { need, expected } of fixture.needs) {
    assert.ok(expected.length > 0, need);
    for (const name of expected) assert.ok(names.includes(name), `${need}: ${name}`);
  }
  assert.ok(fixture.needs.length >= 80 && names.length >= 60);
});

test("the synthetic Use when items say so, and name every repository once, with one or two short lines each", () => {
  assert.match(fixture.use_when.about, /^Synthetic/);
  assert.deepEqual(Object.keys(fixture.use_when.items).sort(), fixture.repositories.map((r) => r.full_name).sort());
  for (const [name, items] of Object.entries(fixture.use_when.items)) {
    assert.ok(items.length >= 1 && items.length <= 2, name);
    for (const item of items) assert.ok(item.length <= 100 && !/[\r\n]/.test(item), `${name}: ${item}`);
  }
});

test("the journal starts with kinds.json's repositories, which give their kind guess's inputs", () => {
  assert.deepEqual(fixture.repositories.slice(0, kinds.repositories.length).map((r) => r.full_name), kinds.repositories.map((r) => r.full_name));
});
