// Runs the skill-compliance eval and prints the pass rate per scenario and overall (README.md).
//
//   node run.mjs --self-check              the assertions on canned tool calls: no key, no model
//   node run.mjs --dry [--model <id>]      the dry scenario (dry.yaml)
//   node run.mjs [--model <id>] [--repeat <n>]   the 25 scenarios (promptfooconfig.yaml)
//   --only <ids>                           only these scenarios: 3,5,7 or 3-7, by the report's #
//   --resume                               only those the saved report hasn't finished, merged into it
//   --agent gemini-cli [--pause <seconds>] [--debug]   Gemini CLI instead of Claude Code (README.md,
//                                          "Gemini CLI"); --debug prints what it does as it runs
//
// The key comes from ANTHROPIC_API_KEY (Claude Code) or GEMINI_API_KEY (Gemini CLI) in your
// environment, never a file; it is never printed. Everything it writes stays in .run/ (git-ignored),
// promptfoo's own files and Gemini CLI's home included.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, HERE, HOME, prepare, RUN, SAVED } from "./fixture.mjs";
import { buildGeminiHome, geminiCli } from "./gemini.mjs";
import { filterFor, outcomes, parseOnly, reportLines, resumable, scenarioList, toResume } from "./report.mjs";

// Each agent's default model, its key, and the pinned packages it needs (package.json).
const AGENTS = {
  "claude-code": { model: "claude-sonnet-5-5", key: "ANTHROPIC_API_KEY", packages: ["promptfoo", "@anthropic-ai/claude-agent-sdk"] },
  "gemini-cli": { model: "gemini-3.6-flash", key: "GEMINI_API_KEY", packages: ["promptfoo"] },
};

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const AGENT = option("--agent", "claude-code");
const MODEL = option("--model", AGENTS[AGENT]?.model ?? "");
const REPEAT = Number(option("--repeat", "1"));
const PAUSE = Number(option("--pause", "15"));
const DEBUG = args.includes("--debug");

function stop(message) {
  console.error(message);
  process.exit(2);
}

if (!AGENTS[AGENT]) stop(`Not an agent this eval runs: ${AGENT}. Use ${Object.keys(AGENTS).join(" or ")}.`);
if (!/^[a-z0-9][a-z0-9.-]*$/.test(MODEL)) stop(`Not a model id: ${MODEL}`);
if (!Number.isInteger(REPEAT) || REPEAT < 1 || REPEAT > 10) stop("--repeat takes 1 to 10.");
if (!Number.isInteger(PAUSE) || PAUSE < 0 || PAUSE > 300) stop("--pause takes 0 to 300 seconds.");
if (DEBUG && AGENT !== "gemini-cli") stop("--debug is for --agent gemini-cli.");

if (args.includes("--self-check")) {
  prepare();
  const { selfCheck } = await import("./self-check.mjs");
  process.exit(selfCheck() ? 0 : 1);
}

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 22)) stop(`Node ${process.versions.node}: promptfoo 0.124.1 needs Node 22.22 or later.`);

const { key, packages } = AGENTS[AGENT];
if (!process.env[key]) stop(`Set ${key} in your environment first (README.md, "The key"${AGENT === "gemini-cli" ? ' and "Gemini CLI"' : ""}).`);
const pins = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).devDependencies;
const installed = {};
for (const name of packages) {
  const file = join(HERE, "node_modules", name, "package.json");
  if (!existsSync(file)) stop(`${name} isn't installed here. In evals/skill/, run: npm install`);
  installed[name] = JSON.parse(readFileSync(file, "utf8"));
  if (installed[name].version !== pins[name]) stop(`${name} ${installed[name].version} is installed; this eval pins ${pins[name]}. In evals/skill/, run: npm install`);
}
const gemini = AGENT === "gemini-cli" ? geminiCli() : null;
if (AGENT === "gemini-cli" && !gemini) stop("Gemini CLI isn't on PATH. Install it with: npm install -g @google/gemini-cli");

// The scenarios this run takes: --only's, or all; with --resume, only those the saved report for
// the same agent and model hasn't finished (README.md, "Running it over several days").
const config = args.includes("--dry") ? "dry.yaml" : "promptfooconfig.yaml";
const descriptions = scenarioList(config);
let ids = descriptions.map((_, i) => i + 1);
try {
  if (args.includes("--only")) ids = parseOnly(option("--only"), descriptions.length);
} catch (error) {
  stop(error.message);
}
const savedFile = join(SAVED, "report.json");
const here = { agent: AGENT, model: MODEL, config, repeat: REPEAT };
let saved = null;
if (args.includes("--resume")) {
  const found = resumable(existsSync(savedFile) ? JSON.parse(readFileSync(savedFile, "utf8")) : null, here);
  if (found.error) stop(found.error);
  saved = found.saved;
  ids = toResume(saved, ids);
  if (!ids.length) {
    console.log("Nothing to resume: every scenario in the saved report finished. Its report is .run/report.md.");
    process.exit(0);
  }
  console.log(`Resuming ${AGENT}/${MODEL}: scenarios ${ids.join(", ")}.`);
}

process.env.REPOMAGPIE_EVAL_AGENT = AGENT; // for fixture.mjs, here and in promptfoo's beforeEach hook
prepare(gemini ? buildGeminiHome : undefined);
const results = join(RUN, "results.json");
mkdirSync(join(RUN, "promptfoo"), { recursive: true });
const env = {
  ...process.env,
  REPOMAGPIE_EVAL_MODEL: MODEL,
  REPOMAGPIE_EVAL_NODE: process.execPath,
  REPOMAGPIE_EVAL_CLI: CLI,
  REPOMAGPIE_EVAL_HOME: HOME,
  REPOMAGPIE_EVAL_PAUSE: String(PAUSE),
  REPOMAGPIE_EVAL_DEBUG: DEBUG ? "1" : "0",
  MAGPIE_HOME: HOME, // also for anything the agent runs: never the real ~/.magpie
  PROMPTFOO_CONFIG_DIR: join(RUN, "promptfoo"), // promptfoo's database and cache, inside .run/
  PROMPTFOO_DISABLE_TELEMETRY: "1",
  PROMPTFOO_DISABLE_UPDATE: "1",
  // Gemini CLI's provider handles a refusal itself: promptfoo's scheduler would retry each "429"
  // with a wait (a skipped scenario took 4 minutes that way).
  ...(gemini ? { PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: "1" } : {}),
};
// One scenario at a time: they share .run/, which the beforeEach hook resets. Gemini CLI's provider
// replaces the configs' providers.yaml, so the scenarios are the same for both agents. promptfoo's
// own entry runs with this node, so no shell is needed on Windows (npx.cmd needs one).
const promptfoo = join(HERE, "node_modules", "promptfoo", installed.promptfoo.bin.promptfoo);
const provider = gemini ? ["-r", "file://gemini-provider.mjs"] : [];
const subset = ids.length < descriptions.length ? ["--filter-pattern", filterFor(ids.map((id) => descriptions[id - 1]))] : [];
const run = spawnSync(process.execPath, [promptfoo, "eval", "-c", config, ...provider, ...subset, "-j", "1", "--no-cache", "--repeat", String(REPEAT), "-o", results], { cwd: HERE, env, stdio: "inherit" });
if (!existsSync(results)) stop(`promptfoo wrote no results (exit ${run.status}).`);

// The report: each scenario's pass rate for this agent and model, then overall, and what the run
// cost (Gemini CLI: the model turns and requests it took). With --resume, this run's scenarios
// replace theirs in the saved report; without it, this run starts a new one.
const rows = JSON.parse(readFileSync(results, "utf8"))?.results?.results ?? [];
const date = new Date().toISOString().slice(0, 10);
const state = { ...here, scenarios: { ...(saved?.scenarios ?? {}), ...outcomes(rows, descriptions, date) } };
mkdirSync(SAVED, { recursive: true });
writeFileSync(savedFile, `${JSON.stringify(state, null, 2)}\n`);
const resets = existsSync(join(RUN, "resets.log")) ? readFileSync(join(RUN, "resets.log"), "utf8").trim().split("\n").length - 1 : 0;
const lines = reportLines(state, { ...here, date, gemini: gemini?.version ?? null, descriptions, rows, resets });
writeFileSync(join(RUN, "report.md"), `${lines.join("\n")}\n`);
console.log(`\n${lines.join("\n")}\n\nAlso in ${join(RUN, "report.md")}.`);
