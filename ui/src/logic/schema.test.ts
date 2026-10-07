import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_MARKER as CORE_DRAFT_MARKER, KINDS as CORE_KINDS } from "../../../src/core/note.ts";
import { readablePurl as coreReadablePurl } from "../../../src/core/identity.ts";
import { isAvoid as coreIsAvoid, verdictSaysAvoid as coreVerdictSaysAvoid } from "../../../src/core/recall.ts";
import { DRAFT_MARKER, hookWouldAsk, isAvoid, KINDS, packageLabel, readablePurl, TAG_PATTERN, verdictSaysAvoid } from "./schema.ts";

// The app can't bundle core's modules (they read files), so it mirrors some of core's values and
// rules. These tests keep the mirror equal to core: core stays the single source.

test("KINDS and the draft marker equal core's", () => {
  assert.deepEqual(KINDS, CORE_KINDS);
  assert.equal(DRAFT_MARKER, CORE_DRAFT_MARKER);
});

test("isAvoid agrees with core's rule (decision 0024) on every case", () => {
  const cases = [
    { verdict: "avoid: async streams painful", avoid_when: [] },
    { verdict: "Avoid — unmaintained", avoid_when: [] },
    { verdict: "avoidable in small scripts", avoid_when: [] },
    { verdict: "fine for invoices", avoid_when: ["large PDFs"] },
    { verdict: null, avoid_when: [] },
    { verdict: "", avoid_when: [] },
    { verdict: "I avoid it", avoid_when: [] },
  ];
  for (const c of cases) assert.equal(isAvoid(c), coreIsAvoid(c), JSON.stringify(c));
});

test("verdictSaysAvoid agrees with core's (adopt, spec §2) on every case", () => {
  const cases = ["avoid: async streams painful", "Avoid — unmaintained", "avoidable in small scripts", "fine for invoices", "I avoid it", "", null];
  for (const c of cases) assert.equal(verdictSaysAvoid(c), coreVerdictSaysAvoid(c), JSON.stringify(c));
  assert.equal(verdictSaysAvoid("AVOID"), true);
  assert.equal(verdictSaysAvoid("fine; avoid the old API"), false);
});

test("the hook asks only for an exact avoid match; a name-only match informs", () => {
  assert.equal(hookWouldAsk({ confidence: "exact", verdict: "avoid: slow", avoid_when: [] }), true);
  assert.equal(hookWouldAsk({ confidence: "name-only", verdict: "avoid: slow", avoid_when: [] }), false);
  assert.equal(hookWouldAsk({ confidence: "exact", verdict: "fine", avoid_when: [] }), false);
});

test("readablePurl equals core's; packageLabel gives the type and the package name as people write it", () => {
  for (const purl of ["pkg:npm/%40playwright/cli", "pkg:npm/pdfkit", "pkg:github/microsoft/playwright-cli", "pkg:pypi/requests", "pkg:npm/%E0%A4%A"]) {
    assert.equal(readablePurl(purl), coreReadablePurl(purl), purl);
  }
  assert.deepEqual(packageLabel("pkg:npm/%40playwright/cli"), { type: "npm", name: "@playwright/cli" });
  assert.deepEqual(packageLabel("pkg:github/microsoft/playwright-cli"), { type: "github", name: "microsoft/playwright-cli" });
  assert.deepEqual(packageLabel("pkg:cargo/serde"), { type: "cargo", name: "serde" });
  assert.deepEqual(packageLabel("not a purl"), { type: "", name: "not a purl" });
});

test("tags are lowercase kebab-case, as core's tag list reads them", () => {
  for (const ok of ["pdf", "agent-skills", "e2e", "a1-b2"]) assert.match(ok, TAG_PATTERN, ok);
  for (const bad of ["PDF", "agent_skills", "-x", "x-", "a--b", "two words", ""]) assert.doesNotMatch(bad, TAG_PATTERN, bad);
});
