// Runs the skill-compliance eval and prints the pass rate per scenario and overall (README.md).
//
//   node run.mjs --self-check              the assertions on canned tool calls: no key, no model
//   node run.mjs --dry [--model <id>]      the dry scenario (dry.yaml)
//   node run.mjs [--model <id>] [--repeat <n>]   the 25 scenarios (promptfooconfig.yaml)
//
// The key comes from ANTHROPIC_API_KEY in your environment, never a file; it is never printed.
// Everything it writes stays in .run/ (git-ignored), promptfoo's own files included.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, HERE, HOME, prepare, RUN } from "./fixture.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const MODEL = option("--model", "claude-sonnet-5-5");
const REPEAT = Number(option("--repeat", "1"));

function stop(message) {
  console.error(message);
  process.exit(2);
}

if (!/^[a-z0-9][a-z0-9.-]*$/.test(MODEL)) stop(`Not a model id: ${MODEL}`);
if (!Number.isInteger(REPEAT) || REPEAT < 1 || REPEAT > 10) stop("--repeat takes 1 to 10.");

if (args.includes("--self-check")) {
  prepare();
  const { selfCheck } = await import("./self-check.mjs");
  process.exit(selfCheck() ? 0 : 1);
}

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 22)) stop(`Node ${process.versions.node}: promptfoo 0.124.1 needs Node 22.22 or later.`);

if (!process.env.ANTHROPIC_API_KEY) stop("Set ANTHROPIC_API_KEY in your environment first (README.md, \"The key\").");
const pins = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).devDependencies;
for (const [name, version] of Object.entries(pins)) {
  const installed = join(HERE, "node_modules", name, "package.json");
  if (!existsSync(installed)) stop(`${name} isn't installed here. In evals/skill/, run: npm install`);
  const found = JSON.parse(readFileSync(installed, "utf8")).version;
  if (found !== version) stop(`${name} ${found} is installed; this eval pins ${version}. In evals/skill/, run: npm install`);
}

prepare();
const config = args.includes("--dry") ? "dry.yaml" : "promptfooconfig.yaml";
const results = join(RUN, "results.json");
mkdirSync(join(RUN, "promptfoo"), { recursive: true });
const env = {
  ...process.env,
  REPOMAGPIE_EVAL_MODEL: MODEL,
  REPOMAGPIE_EVAL_NODE: process.execPath,
  REPOMAGPIE_EVAL_CLI: CLI,
  REPOMAGPIE_EVAL_HOME: HOME,
  MAGPIE_HOME: HOME, // also for anything the agent runs: never the real ~/.magpie
  PROMPTFOO_CONFIG_DIR: join(RUN, "promptfoo"), // promptfoo's database and cache, inside .run/
  PROMPTFOO_DISABLE_TELEMETRY: "1",
  PROMPTFOO_DISABLE_UPDATE: "1",
};
// One scenario at a time: they share .run/, which the beforeEach hook resets.
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = spawnSync(npx, ["promptfoo", "eval", "-c", config, "-j", "1", "--no-cache", "--repeat", String(REPEAT), "-o", results], { cwd: HERE, env, stdio: "inherit", shell: process.platform === "win32" });
if (!existsSync(results)) stop(`promptfoo wrote no results (exit ${run.status}).`);

// The report: each scenario's pass rate for this model, then overall, and what the run cost.
const data = JSON.parse(readFileSync(results, "utf8"));
const rows = data?.results?.results ?? [];
const scenarios = new Map();
let cost = 0;
for (const r of rows) {
  const name = r.testCase?.description ?? r.description ?? "(no description)";
  const entry = scenarios.get(name) ?? { passed: 0, runs: 0, reasons: new Set() };
  entry.runs++;
  if (r.success) entry.passed++;
  else entry.reasons.add(r.gradingResult?.componentResults?.find((c) => !c.pass)?.reason ?? r.gradingResult?.reason ?? r.error ?? "failed");
  scenarios.set(name, entry);
  cost += Number(r.cost ?? r.response?.cost ?? 0);
}
const passed = [...scenarios.values()].reduce((n, e) => n + e.passed, 0);
const runs = [...scenarios.values()].reduce((n, e) => n + e.runs, 0);
const percent = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "n/a");
// A Markdown table cell: backslashes first, so a "\|" in the text can't end the cell.
const cell = (text) => text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
const lines = [
  `# Skill compliance: claude-code/${MODEL}, ${new Date().toISOString().slice(0, 10)}`,
  "",
  `${config}, ${REPEAT} ${REPEAT === 1 ? "run" : "runs"} per scenario. Overall: ${passed}/${runs} (${percent(passed, runs)}). Cost: $${cost.toFixed(2)}, as promptfoo reports it.`,
  "",
  "| Scenario | Passed | Rate | Why it failed |",
  "|---|---|---|---|",
  ...[...scenarios].map(([name, e]) => `| ${cell(name)} | ${e.passed}/${e.runs} | ${percent(e.passed, e.runs)} | ${cell([...e.reasons].join("; "))} |`),
];
const resets = existsSync(join(RUN, "resets.log")) ? readFileSync(join(RUN, "resets.log"), "utf8").trim().split("\n").length - 1 : 0;
if (resets < runs) lines.push("", `Warning: the journal was reset ${resets} times for ${runs} runs: the beforeEach hook didn't run for each scenario, so a scenario may have seen another one's notes.`);
writeFileSync(join(RUN, "report.md"), `${lines.join("\n")}\n`);
console.log(`\n${lines.join("\n")}\n\nAlso in ${join(RUN, "report.md")}.`);
