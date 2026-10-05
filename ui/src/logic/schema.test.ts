import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_MARKER as CORE_DRAFT_MARKER, KINDS as CORE_KINDS } from "../../../src/core/note.ts";
import { isAvoid as coreIsAvoid } from "../../../src/core/recall.ts";
import { DRAFT_MARKER, hookWouldAsk, isAvoid, KINDS, TAG_PATTERN } from "./schema.ts";

// The app can't bundle core's modules (they read files), so it mirrors two of core's values. These
// tests keep the mirror equal to core: core stays the single source.

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

test("the hook asks only for an exact avoid match; a name-only match informs", () => {
  assert.equal(hookWouldAsk({ confidence: "exact", verdict: "avoid: slow", avoid_when: [] }), true);
  assert.equal(hookWouldAsk({ confidence: "name-only", verdict: "avoid: slow", avoid_when: [] }), false);
  assert.equal(hookWouldAsk({ confidence: "exact", verdict: "fine", avoid_when: [] }), false);
});

test("tags are lowercase kebab-case, as core's tag list reads them", () => {
  for (const ok of ["pdf", "agent-skills", "e2e", "a1-b2"]) assert.match(ok, TAG_PATTERN, ok);
  for (const bad of ["PDF", "agent_skills", "-x", "x-", "a--b", "two words", ""]) assert.doesNotMatch(bad, TAG_PATTERN, bad);
});
