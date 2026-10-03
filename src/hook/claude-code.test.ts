import { test } from "node:test";
import assert from "node:assert/strict";
import { hookOutput } from "./claude-code.ts";

// Until recall exists, the hook has nothing to say: it fails open (spec section 6).
test("hookOutput returns nothing for an install command", () => {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm install pdfkit" } });
  assert.equal(hookOutput(input), null);
});

test("hookOutput returns nothing for input it can't parse", () => {
  assert.equal(hookOutput("not json"), null);
});
