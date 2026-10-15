import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The retrieval baseline's fixture (scripts/fixtures/retrieval.json) stays consistent, so
// npm run eval:retrieval measures what it says. The baseline itself only reports; it isn't a test.

const fixture = JSON.parse(readFileSync(new URL("fixtures/retrieval.json", import.meta.url), "utf8")) as {
  repositories: { full_name: string; description: string | null; topics: string[] }[];
  needs: { need: string; expected: string[] }[];
};
const kinds = JSON.parse(readFileSync(new URL("../src/core/fixtures/kinds.json", import.meta.url), "utf8")) as { repositories: { full_name: string }[] };

test("every expected repository is in the journal; names and needs are unique", () => {
  const names = fixture.repositories.map((r) => r.full_name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(fixture.needs.map((n) => n.need)).size, fixture.needs.length);
  for (const { need, expected } of fixture.needs) {
    assert.ok(expected.length > 0, need);
    for (const name of expected) assert.ok(names.includes(name), `${need}: ${name}`);
  }
  assert.ok(fixture.needs.length >= 20 && names.length >= 30);
});

test("the journal starts with kinds.json's repositories, which give their kind guess's inputs", () => {
  assert.deepEqual(fixture.repositories.slice(0, kinds.repositories.length).map((r) => r.full_name), kinds.repositories.map((r) => r.full_name));
});
