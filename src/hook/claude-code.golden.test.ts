import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { goldenOutputs } from "./fixtures/claude-code-cases.ts";

// Claude Code's hook output, byte for byte, as it was before the hook was split into an
// agent-neutral core and adapters (decision 0036). The golden file holds each case's SHA-256 (or
// null for no output), taken from the hook before the split; claude-code.test.ts shows the texts.

const GOLDEN: Record<string, string | null> = JSON.parse(readFileSync(new URL("./fixtures/claude-code-golden.json", import.meta.url), "utf8"));

test("every golden case prints exactly what it printed before the split", () => {
  const outputs = goldenOutputs(scratchBase("hook-golden"));
  assert.deepEqual(Object.keys(outputs), Object.keys(GOLDEN));
  for (const [name, out] of Object.entries(outputs)) {
    assert.equal(out === null ? null : createHash("sha256").update(out).digest("hex"), GOLDEN[name], `${name}: ${out}`);
  }
});
