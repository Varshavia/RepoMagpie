import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratchBase } from "./fixtures/scratch.ts";
import { runSuggest } from "./suggest.ts";

// Roadmap v0.1, magpie suggest, "Done when": sample projects described in words get the notes
// expected among the candidates. The journal is a scratch copy of the example vault (its caches
// are written there, never into examples/vault/), outside any project.
const vault = fileURLToPath(new URL("../../examples/vault/notes/", import.meta.url));
const root = scratchBase("suggest-quality");
cpSync(vault, join(root, "journal", "notes"), { recursive: true });
const place = { home: join(root, "home"), env: { MAGPIE_HOME: join(root, "journal") }, cwd: root };
const top = (description: string, n: number) => runSuggest({ description, limit: n }, place).document.candidates.map((c) => c.id);

test('"a React landing page with a strong visual design": taste-skill, awesome-design-md and vercel-labs/agent-skills in the top 5', () => {
  const found = top("a React landing page with a strong visual design", 5);
  for (const expected of ["pkg:github/leonxlnx/taste-skill", "pkg:github/voltagent/awesome-design-md", "pkg:github/vercel-labs/agent-skills"]) {
    assert.ok(found.includes(expected), `${expected} not in the top 5: ${found.join(", ")}`);
  }
});

test('"let my coding agent test a web app in a browser": playwright-cli first', () => {
  const found = top("let my coding agent test a web app in a browser", 5);
  assert.equal(found[0], "pkg:github/microsoft/playwright-cli", `order: ${found.join(", ")}`);
});
