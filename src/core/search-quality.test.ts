import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import MiniSearch from "minisearch";
import { searchJournals } from "./search.ts";
import { INDEX_OPTIONS, noteDocuments, type SearchDoc } from "./search-index.ts";

// Roadmap v0.1, magpie search, "Done when": for a fixed set of 10 test questions, the expected
// note is in the top 3. The journal is the example vault; the index is built in memory, so no
// cache is written into examples/vault/.
const vault = fileURLToPath(new URL("../../examples/vault/", import.meta.url));
const index = new MiniSearch<SearchDoc>(INDEX_OPTIONS);
for (const file of readdirSync(`${vault}notes`).filter((name) => name.endsWith(".md"))) {
  index.addAll(noteDocuments(readFileSync(`${vault}notes/${file}`, "utf8"), file));
}
const source = { scope: "personal" as const, path: vault, index };

const QUESTIONS: [string, string][] = [
  ["browser checks and screenshots", "pkg:github/microsoft/playwright-cli"],
  ["playwrigt", "pkg:github/microsoft/playwright-cli"], // a one-letter typo: fuzzy matching
  ["understand an unfamiliar codebase", "pkg:github/egonex-ai/understand-anything"],
  ["landing page visuals", "pkg:github/leonxlnx/taste-skill"],
  ["DESIGN.md for a brand", "pkg:github/voltagent/awesome-design-md"],
  ["react next.js performance", "pkg:github/vercel-labs/agent-skills"],
  ["spark kafka lakehouse", "pkg:github/open-lakehouse/open-lakehouse"],
  ["tdd and code review", "pkg:github/mattpocock/skills"],
  ["agent over-engineering", "pkg:github/multica-ai/andrej-karpathy-skills"],
  ["local data stack demo", "pkg:github/open-lakehouse/open-lakehouse"],
];

for (const [question, expected] of QUESTIONS) {
  test(`"${question}" finds ${expected} in the top 3`, () => {
    const top = searchJournals([source], question, { limit: 3 }).map((r) => r.id);
    assert.ok(top.includes(expected), `top 3: ${top.join(", ")}`);
  });
}
