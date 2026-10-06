import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratchBase } from "./fixtures/scratch.ts";
import { runSuggest } from "./suggest.ts";

// Roadmap v0.1, magpie suggest, "Done when": sample projects get the notes expected among the
// candidates, and not the unrelated ones (the relative cutoff, spec §5). The journal is a scratch
// copy of the example vault (its caches are written there, never into examples/vault/), outside
// any project.
const vault = fileURLToPath(new URL("../../examples/vault/notes/", import.meta.url));
const root = scratchBase("suggest-quality");
cpSync(vault, join(root, "journal", "notes"), { recursive: true });
const place = { home: join(root, "home"), env: { MAGPIE_HOME: join(root, "journal") }, cwd: root };
const top = (description: string, n: number) => runSuggest({ description, limit: n }, place).document.candidates.map((c) => c.id);

const LAKEHOUSE = "pkg:github/open-lakehouse/open-lakehouse";

test('"a React landing page with a strong visual design": taste-skill, awesome-design-md and vercel-labs/agent-skills, nothing else', () => {
  const found = top("a React landing page with a strong visual design", 20);
  assert.deepEqual(found.toSorted(), ["pkg:github/leonxlnx/taste-skill", "pkg:github/vercel-labs/agent-skills", "pkg:github/voltagent/awesome-design-md"]);
});

test('"let my coding agent test a web app in a browser": playwright-cli first; not open-lakehouse', () => {
  const found = top("let my coding agent test a web app in a browser", 20);
  assert.equal(found[0], "pkg:github/microsoft/playwright-cli", `order: ${found.join(", ")}`);
  assert.ok(!found.includes(LAKEHOUSE), `order: ${found.join(", ")}`);
});

test('"a local data stack to learn data engineering": open-lakehouse, when the project is about it', () => {
  assert.deepEqual(top("a local data stack to learn data engineering", 20), [LAKEHOUSE]);
});

// The maintainer's case (2026-10-06): magpie suggest on RepoMagpie itself listed 8 of 9 notes,
// open-lakehouse among them. The project is RepoMagpie's package.json and README intro on that date.
test("RepoMagpie itself: the agent tools it uses, playwright-cli first through @playwright/test; not open-lakehouse", () => {
  const project = join(root, "repomagpie");
  mkdirSync(join(project, ".git"), { recursive: true });
  writeFileSync(join(project, "package.json"), JSON.stringify({
    name: "repomagpie",
    description: "Remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.",
    keywords: ["dependencies", "coding-agent", "claude-code", "agent-skills", "cli", "markdown", "notes"],
    dependencies: { commander: "15.0.0", minisearch: "7.2.0", "packageurl-js": "2.0.1", yaml: "2.9.1" },
    devDependencies: {
      "@playwright/test": "1.63.0", "@types/node": "^22.20.5", "@types/react": "19.3.0", "@types/react-dom": "19.3.0",
      "@vitejs/plugin-react": "6.1.1", react: "19.3.0", "react-dom": "19.3.0", typescript: "7.0.2", vite: "8.3.2",
    },
  }));
  writeFileSync(join(project, "README.md"), "# RepoMagpie\n\n> RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.\n");
  const run = runSuggest({ limit: 20 }, { ...place, cwd: project });
  const found = run.document.candidates.map((c) => c.id);
  assert.equal(found[0], "pkg:github/microsoft/playwright-cli", `order: ${found.join(", ")}`);
  assert.deepEqual(run.document.candidates[0].why.dependencies, ["@playwright/test"]);
  // mattpocock/skills is not expected (since 2026-10-06): it matched RepoMagpie only through words
  // any project has, "code" (code-review), "plugin" and "install" ("Install selectively"). With
  // those left out it scores 0.05 of playwright-cli, under the cutoff; keywords can't tell it apart
  // from other skill packs. magpie search still finds it.
  for (const expected of ["pkg:github/vercel-labs/agent-skills", "pkg:github/multica-ai/andrej-karpathy-skills"]) {
    assert.ok(found.includes(expected), `${expected} missing: ${found.join(", ")}`);
  }
  assert.ok(!found.includes(LAKEHOUSE), `order: ${found.join(", ")}`);
  // The why lines name what the project is about, not words any project has (2026-10-06).
  const common = ["about", "code", "js", "installs", "before", "every", "one", "types", "plugin", "dependency", "dependencies"];
  for (const c of run.document.candidates) assert.deepEqual(c.why.keywords.filter((k) => common.includes(k)), [], c.name);
});
