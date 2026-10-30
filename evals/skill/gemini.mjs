// Gemini CLI for the eval (README.md, "Gemini CLI"): its home in .run/, set up by repomagpie setup's
// own code; the environment and the command line one scenario runs; and its stream-json output read
// into the tool calls assertions.mjs reads. Nothing here calls a model.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { onPath, packageOf } from "../../src/core/agents.ts";
import { writeAtomically } from "../../src/core/config-write.ts";
import { setMember } from "../../src/core/json-edit.ts";
import { launchCommand } from "../../src/core/launch.ts";
import { applySetup, planSetup } from "../../src/core/setup.ts";
import { CLI, GEMINI_HOME, GEMINI_TEMPLATE, HERE, HOME } from "./fixture.mjs";

export const MAX_TURNS = 12; // as max_turns in the Claude Code run (providers.yaml)

// The eval's own settings, beside setup's entry: nothing sent to Google but the model's requests, no
// update while it runs, no hooks, no memory carried between scenarios, and the turn limit.
const SETTINGS = [
  [["privacy", "usageStatisticsEnabled"], false],
  [["general", "enableAutoUpdate"], false],
  [["general", "enableAutoUpdateNotification"], false],
  [["hooksConfig", "enabled"], false],
  [["experimental", "autoMemory"], false],
  [["model", "maxSessionTurns"], MAX_TURNS],
];

// The environment Gemini CLI runs in, with `home` as its home folder. Of yours it keeps
// GEMINI_API_KEY and nothing else of Gemini's or Google's: those can choose another sign-in, settings
// file, model or trust. USERPROFILE and HOME too, for the few places Gemini CLI reads the home folder
// without GEMINI_CLI_HOME. The folder is trusted, or Gemini CLI starts no MCP server.
export function geminiEnv(home = GEMINI_HOME, env = process.env) {
  const kept = Object.entries(env).filter(([name]) => !/^(?:GEMINI_|GOOGLE_|CLOUD_SHELL$)/i.test(name) || name === "GEMINI_API_KEY");
  return { ...Object.fromEntries(kept), GEMINI_CLI_HOME: home, USERPROFILE: home, HOME: home, GEMINI_CLI_TRUST_WORKSPACE: "true", MAGPIE_HOME: HOME };
}

// Gemini CLI as npm installed it: the file its gemini command runs, and its version. The provider
// runs that file with node itself, so the prompt reaches it as one argument, never through a shell.
export function geminiCli(env = process.env) {
  for (const file of onPath("gemini", { home: homedir(), env, platform: process.platform })) {
    const found = packageOf(file);
    if (found?.name === "@google/gemini-cli") return found;
  }
  return null;
}

// One scenario, headless (README.md, "Gemini CLI", for each flag). With `debug` (`--debug`), its own
// debug lines too; headless, they go to stderr, never into the stream-json on stdout.
export const geminiArgs = (entry, prompt, model, debug = false) => [entry, "-p", prompt, "-m", model, "-o", "stream-json", "--approval-mode", "default", "--allowed-mcp-server-names", "repomagpie", ...(debug ? ["--debug"] : [])];

// `text` with the key's value replaced, wherever Gemini CLI's output might hold it, before it is
// shown or kept.
export const maskKey = (text, key = process.env.GEMINI_API_KEY) => (key ? String(text).split(key).join("<GEMINI_API_KEY>") : String(text));

// What Gemini CLI said went wrong, without its stack traces: the API's status (stderr's `code: 404`,
// or `status 429` in its retry lines), the message (stream-json's result, `[API Error: ...]`, else
// an error event, else the last error thrown on stderr, else stderr's last line), and how many
// attempts failed before it (Gemini CLI retries a 429 or a 5xx up to 10 times, 5 to 30 s apart).
// A JSON error body in the message is cut down to its "message". `daily` is the free tier's daily
// quota run out, with the limit and the wait the API gives (`limit: 20, model: …, description: …
// per day …`, `Please retry in 16h15m55.8s`) when it gives them.
export function geminiProblem(parsed, stderr) {
  const text = String(stderr);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^at\s/.test(line) && !/^[{}]$/.test(line) && !/^code: /.test(line) && !/^Ripgrep is not available/.test(line));
  const status = [...text.matchAll(/\b(?:code: |status )(\d{3})\b/g)].at(-1)?.[1] ?? null;
  const thrown = lines.map((line) => line.match(/\b[A-Z]\w*Error: (.+)$/)?.[1]).filter(Boolean).at(-1);
  const result = parsed.result?.error ?? null;
  const unwrapped = result?.match(/^\[API Error: ([\s\S]*)\]$/)?.[1] ?? result?.replace(/^\[API Error: ([\s\S]*?)\]/, "$1");
  const said = unwrapped ?? parsed.errors.filter(Boolean).at(-1) ?? thrown ?? lines.at(-1) ?? "";
  const body = said.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1].replace(/\\(.)/g, "$1");
  const retries = text.match(/\bAttempt \d+ failed/g)?.length ?? 0;
  const daily = DAILY.test(`${said}\n${text}`)
    ? { limit: Number(text.match(/\blimit: (\d+), model: [\w.-]+, description: [^\n]*per day/i)?.[1]) || null, retry_in: text.match(/Please retry in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/)?.[1]?.replace(/\.\d+s$/, "s") || null }
    : null;
  return { status, message: (body ?? said).replace(/\s+/g, " ").trim().slice(0, 400), retries, daily };
}

// The free tier's daily quota, as the API and Gemini CLI word it; a per-minute limit isn't.
export const DAILY = /per day|PerDay|daily quota/i;

// The API requests a scenario took, as near as Gemini CLI's output tells: one per model turn, one
// per failed attempt, and the failed request that ended it. Its stream-json counts no requests;
// in 0.65.0 it makes none of its own here (its next-speaker check is off by default, its loop check
// starts after 30 turns).
export const requestsOf = (parsed, problem) => parsed.turns + problem.retries + (problem.status && parsed.result?.status !== "success" ? 1 : 0);

// Gemini CLI's home as repomagpie setup leaves it for a user (decision 0035), in GEMINI_TEMPLATE,
// which fixture.mjs copies to GEMINI_HOME before each scenario. Setup's own code adds the MCP entry
// with `gemini mcp add --scope user` (the note tool on, the journal in .run/) and copies the skill to
// .agents/skills/repomagpie. Its hook is left out, as in the Claude Code run (README.md). Then the
// eval's settings and policy (gemini-policy.toml, in the user tier).
export function buildGeminiHome() {
  mkdirSync(GEMINI_TEMPLATE, { recursive: true });
  const { GEMINI_API_KEY: _key, ...env } = geminiEnv(GEMINI_TEMPLATE); // gemini mcp add needs no key
  const where = { home: GEMINI_TEMPLATE, env, platform: process.platform };
  const launch = launchCommand({ execPath: process.execPath, entry: CLI, env, platform: process.platform, tmp: tmpdir(), home: HOME });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "-");
  const request = { where, launch, noteTool: true, remove: false, only: ["gemini"], stamp };
  const done = applySetup({ ...planSetup(request), hooks: [] }, request);
  const agent = done.agents.find((a) => a.id === "gemini");
  if (agent?.result !== "done") throw new Error(`setup didn't add the MCP entry: ${agent?.error ?? agent?.reason ?? "no plan for Gemini CLI"}`);
  if (done.skill?.result !== "done") throw new Error(`setup didn't copy the skill: ${done.skill?.error ?? "no plan for it"}`);

  const settings = join(GEMINI_TEMPLATE, ".gemini", "settings.json");
  writeAtomically(settings, SETTINGS.reduce((text, [path, value]) => setMember(text, path, value), readFileSync(settings, "utf8")));
  mkdirSync(join(GEMINI_TEMPLATE, ".gemini", "policies"), { recursive: true });
  copyFileSync(join(HERE, "gemini-policy.toml"), join(GEMINI_TEMPLATE, ".gemini", "policies", "eval.toml"));
}

// Gemini CLI's names for what assertions.mjs reads, in Claude Code's (so the checks don't change):
// the shell, the two edits, the skill, and RepoMagpie's MCP tools (mcp_repomagpie_recall). Every
// other tool keeps its own name.
function asClaude(name, args) {
  const input = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  if (name === "run_shell_command") return { name: "Bash", input };
  if (name === "write_file") return { name: "Write", input };
  if (name === "replace") return { name: "Edit", input };
  if (name === "activate_skill") return { name: "Skill", input: { skill: input.name } };
  const mcp = name.match(/^mcp_repomagpie_(.+)$/);
  return mcp ? { name: `mcp__repomagpie__${mcp[1]}`, input } : { name, input };
}

// stream-json, one event a line: `tool_use` when the model asks for a call, before the policy, so a
// denied call is there too; its `tool_result` (status "error" when denied); the assistant's text in
// chunks; `result` at the end. The reply is the last model turn's text, as Claude Code's result is
// its last message. A line that isn't a JSON object is counted, never read.
export function parseStream(text) {
  const run = { toolCalls: [], reply: "", texts: [], model: null, turns: 0, result: null, errors: [], unreadable: 0 };
  const byId = new Map();
  let open = false; // inside a model turn: it ends when the tool results come back
  const turn = () => {
    if (open) return;
    run.turns++;
    run.texts.push("");
    open = true;
  };
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      event = null;
    }
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      run.unreadable++;
      continue;
    }
    if (event.type === "init") run.model = event.model ?? null;
    else if (event.type === "message" && event.role === "assistant") {
      turn();
      run.texts[run.texts.length - 1] += String(event.content ?? "");
    } else if (event.type === "tool_use") {
      turn();
      const call = { ...asClaude(String(event.tool_name ?? ""), event.parameters), gemini_name: event.tool_name ?? null, id: event.tool_id ?? null, is_error: null, output: "" };
      run.toolCalls.push(call);
      byId.set(event.tool_id, call);
    } else if (event.type === "tool_result") {
      open = false;
      const call = byId.get(event.tool_id);
      if (call) Object.assign(call, { is_error: event.status === "error", output: String(event.output ?? event.error?.message ?? ""), error_type: event.error?.type ?? null });
    } else if (event.type === "error") run.errors.push(String(event.message ?? ""));
    else if (event.type === "result") run.result = { status: event.status ?? null, error: event.error?.message ?? null, stats: event.stats ?? null };
  }
  run.reply = run.texts.filter((t) => t.trim()).at(-1) ?? "";
  return run;
}
