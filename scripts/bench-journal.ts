// Shared by the benchmarks (spec §7): a generated journal of 2,000 notes in a scratch folder, and
// timing of the built CLI as separate processes. No network; the folder is deleted afterwards.
// `--report-only` prints the numbers but never fails on timing (CI runners vary too much).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderNote } from "../src/core/write.ts";

export const NOTES = 2_000;
export const RUNS = 20;
export const reportOnly = process.argv.includes("--report-only");

export const cli = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));

const WORDS = ("pdf render stream async browser agent skill test design frontend react data lake spark kafka cli library " +
  "parser yaml markdown search index cache journal note verdict avoid use docker deploy queue worker auth token").split(" ");
const TAGS = ["agent-skills", "browser-automation", "code-understanding", "coding-guidelines", "data-engineering", "design", "frontend", "react", "testing", "workflow"];
const words = (seed: number, count: number) => Array.from({ length: count }, (_, k) => WORDS[(seed * 7 + k * 13) % WORDS.length]).join(" ");

// GitHub-like topics for note i: 3 to 7 of 200, drawn so that a few are on hundreds of notes (like
// "javascript") and most on a few; and one of six languages. Deterministic.
const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Rust", "Go", "Java"];
function topicsFor(i: number): string[] {
  let x = (i * 2654435761) % 2 ** 32;
  const next = () => (x = (x * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
  const count = 3 + Math.floor(next() * 5);
  return [...new Set(Array.from({ length: count }, () => `topic-${Math.floor(200 * next() ** 2)}`))];
}

// Runs `body` with a fresh scratch folder (with a .git fence, so no walk leaves it) holding
// <root>/journal with NOTES generated notes (pkg:npm/package-<i>), then deletes the folder. Each
// note links to two others (by file stem and by name) and to one subject without a note.
// `needsBuild: false` for a benchmark that calls core in-process instead of the built CLI.
// `topics: true` also gives each note topics and a language (the graph's similarity reads them).
// `alternatives: true` gives one note in five 1 to 3 alternatives: another note by file stem, one by
// name, and a subject without a note (recall reads them, from both sides).
export function withJournal(name: string, body: (root: string, journal: string) => void, needsBuild = true, topics = false, alternatives = false): void {
  if (needsBuild && !existsSync(cli)) {
    console.error("No build found. Run npm run build first (npm run bench does).");
    process.exit(1);
  }
  const base = fileURLToPath(new URL("../.scratch/bench/", import.meta.url));
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, `${name}-`));
  try {
    mkdirSync(join(root, ".git"));
    const journal = join(root, "journal");
    mkdirSync(join(journal, "notes"), { recursive: true });
    for (let i = 0; i < NOTES; i++) {
      let text = renderNote({
        id: `pkg:npm/package-${i}`,
        name: `package-${i}`,
        explored: "2026-10-04",
        kind: "library",
        tags: [TAGS[i % TAGS.length], TAGS[(i * 3) % TAGS.length]].filter((tag, k, all) => all.indexOf(tag) === k),
        ...(topics ? { topics: topicsFor(i), language: LANGUAGES[i % LANGUAGES.length] } : {}),
        verdict: i % 3 ? words(i, 12) : undefined, // two in three reviewed
        useWhen: [words(i + 1, 15)],
        avoidWhen: [words(i + 2, 10)],
        whatItDoes: words(i + 3, 25),
        myNotes: words(i + 4, 30),
        skills: i % 5 ? [] : ["skill-a", "skill-b"],
        related: `- [[npm--package-${(i + 1) % NOTES}]]\n- [[package-${(i * 7) % NOTES}|a neighbour]]\n- [[subject-${i % 50}]]`,
      });
      text = text.replace("- `skill-a` —", `- \`skill-a\` — ${words(i + 5, 8)}`); // one completed skill line
      if (alternatives && i % 5 === 0) {
        const targets = [`"[[npm--package-${(i + 11) % NOTES}]]"`, `"[[package-${(i * 13 + 7) % NOTES}]]"`, `"[[subject-${i % 40}]]"`];
        text = text.replace("\nstatus:", `\nalternatives: [${targets.slice(0, 3 - ((i / 5) % 3)).join(", ")}]\nstatus:`);
      }
      writeFileSync(join(journal, "notes", `npm--package-${i}.md`), text);
    }
    body(root, journal);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Runs the built CLI with `args` once as a warm-up (it builds the cache), then RUNS times; prints
// the median and p95 against the budget. Sets exit code 1 over budget, unless --report-only.
export function measure(label: string, root: string, args: string[], budgetMs: number, input?: string, env?: Record<string, string>): void {
  const once = () => {
    const started = performance.now();
    const child = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", input, env: { ...process.env, ...env } });
    if (child.status !== 0) throw new Error(`${label} failed: ${child.stderr}`);
    return performance.now() - started;
  };
  report(label, once, budgetMs);
}

// Calls `run` in this process once as a warm-up (it builds the cache), then RUNS times, and reports
// as `measure` does. For core functions with no command of their own (the link index).
export function measureInProcess(label: string, run: () => void, budgetMs: number): void {
  report(label, () => {
    const started = performance.now();
    run();
    return performance.now() - started;
  }, budgetMs);
}

function report(label: string, once: () => number, budgetMs: number): void {
  const cold = once();
  const times = Array.from({ length: RUNS }, once).sort((a, b) => a - b);
  const median = (times[RUNS / 2 - 1] + times[RUNS / 2]) / 2;
  const p95 = times[Math.ceil(RUNS * 0.95) - 1];
  console.log(`${label} on ${NOTES} notes, ${RUNS} runs after a warm-up (Node ${process.version}, ${process.platform})`);
  console.log(`  cold (builds the cache): ${cold.toFixed(0)} ms`);
  console.log(`  median: ${median.toFixed(0)} ms   p95: ${p95.toFixed(0)} ms   budget: under ${budgetMs} ms (median)`);
  if (median >= budgetMs) {
    console.log(reportOnly ? "  over budget (report only)" : "  over budget");
    if (!reportOnly) process.exitCode = 1;
  }
}
