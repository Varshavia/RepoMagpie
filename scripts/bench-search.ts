// Benchmark for `magpie search` (spec §7): generates a journal of 2,000 notes in a temporary
// folder, runs the built CLI 20 times as separate processes after one warm-up run that builds
// the cache, and reports the median and the 95th percentile. Exits 1 over the budget.
// Run with `npm run bench` (it builds first). No network; the generated notes are deleted.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderNote } from "../src/core/write.ts";

const NOTES = 2_000;
const RUNS = 20;
const BUDGET_MS = 500;
const QUERY = "pdf stream";

const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
if (!existsSync(cli)) {
  console.error("No build found. Run npm run build first (npm run bench does).");
  process.exit(1);
}

const WORDS = ("pdf render stream async browser agent skill test design frontend react data lake spark kafka cli library " +
  "parser yaml markdown search index cache journal note verdict avoid use docker deploy queue worker auth token").split(" ");
const TAGS = ["agent-skills", "browser-automation", "code-understanding", "coding-guidelines", "data-engineering", "design", "frontend", "react", "testing", "workflow"];
const words = (seed: number, count: number) => Array.from({ length: count }, (_, k) => WORDS[(seed * 7 + k * 13) % WORDS.length]).join(" ");

const root = mkdtempSync(join(tmpdir(), "magpie-bench-"));
try {
  const journal = join(root, "journal");
  mkdirSync(join(journal, "notes"), { recursive: true });
  for (let i = 0; i < NOTES; i++) {
    let text = renderNote({
      id: `pkg:npm/package-${i}`,
      name: `package-${i}`,
      explored: "2026-10-04",
      kind: "library",
      tags: [TAGS[i % TAGS.length], TAGS[(i * 3) % TAGS.length]].filter((tag, k, all) => all.indexOf(tag) === k),
      verdict: i % 3 ? words(i, 12) : undefined, // two in three reviewed
      useWhen: [words(i + 1, 15)],
      avoidWhen: [words(i + 2, 10)],
      whatItDoes: words(i + 3, 25),
      myNotes: words(i + 4, 30),
      skills: i % 5 ? [] : ["skill-a", "skill-b"],
    });
    text = text.replace("- `skill-a` —", `- \`skill-a\` — ${words(i + 5, 8)}`); // one completed skill line
    writeFileSync(join(journal, "notes", `npm--package-${i}.md`), text);
  }

  const search = () => {
    const started = performance.now();
    const child = spawnSync(process.execPath, [cli, "search", QUERY, "--home", journal], { cwd: root, encoding: "utf8" });
    if (child.status !== 0) throw new Error(`magpie search failed: ${child.stderr}`);
    return performance.now() - started;
  };

  const cold = search(); // builds the cache
  const times = Array.from({ length: RUNS }, search).sort((a, b) => a - b);
  const median = (times[RUNS / 2 - 1] + times[RUNS / 2]) / 2;
  const p95 = times[Math.ceil(RUNS * 0.95) - 1];
  console.log(`magpie search "${QUERY}" on ${NOTES} notes, ${RUNS} runs after a warm-up (Node ${process.version}, ${process.platform})`);
  console.log(`  cold (builds the cache): ${cold.toFixed(0)} ms`);
  console.log(`  median: ${median.toFixed(0)} ms   p95: ${p95.toFixed(0)} ms   budget: under ${BUDGET_MS} ms (median)`);
  if (median >= BUDGET_MS) {
    console.log("  over budget");
    process.exitCode = 1;
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
