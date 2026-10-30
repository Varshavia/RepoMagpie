// promptfoo's provider for Gemini CLI (`node run.mjs --agent gemini-cli`, README.md "Gemini CLI"):
// one headless run per scenario in .run/project, with the home gemini.mjs set up, its stream-json
// read into the shape the checks read (metadata.toolCalls, as the Claude Agent SDK provider gives
// them). run.mjs sets the REPOMAGPIE_EVAL_* variables; GEMINI_API_KEY comes from your environment.
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { PROJECT } from "./fixture.mjs";
import { DAILY, geminiArgs, geminiCli, geminiEnv, geminiProblem, maskKey, parseStream, requestsOf } from "./gemini.mjs";

const TIMEOUT_MS = 5 * 60_000; // per scenario: the run is stopped past it
// Once a scenario runs into the free tier's daily quota, the rest of the run is skipped: no request
// would get through before the reset. The skip's text says neither "429" nor "rate limit", which
// promptfoo would retry.
export const SKIPPED = "skipped: the free tier's daily quota ran out earlier in this run";

let lastEnd = 0; // when the last scenario ended, for the pause between scenarios
let limited = null; // the quota's message, once a scenario ran into it

// Each whole line of a stream, to `line`: a key is never split between two chunks.
function lines(stream, line) {
  let rest = "";
  stream.on("data", (chunk) => {
    const parts = (rest + chunk).split(/\r?\n/);
    rest = parts.pop();
    parts.forEach(line);
  });
  stream.on("end", () => rest && line(rest));
}

// What --debug shows of a stream-json line, live: the event and the tool, never the text.
function event(line) {
  try {
    const e = JSON.parse(line);
    return [e.type, e.tool_name, e.status, e.model].filter(Boolean).join(" ");
  } catch {
    return "(not JSON)";
  }
}

// Gemini CLI, with stdin closed (headless, it would otherwise wait for input on a pipe). Past the
// time limit, or at the first stderr line on the daily quota (Gemini CLI would retry it), the whole
// process tree is stopped: Gemini CLI can restart itself in a child process. Both streams are kept
// with the key masked. With `debug`, its stderr and each stream-json event are printed as they come.
function run(args, debug) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: PROJECT, env: geminiEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out = [];
    const err = [];
    const started = Date.now();
    const say = (text) => process.stderr.write(`[gemini ${((Date.now() - started) / 1000).toFixed(1)} s] ${text}\n`);
    lines(child.stdout, (line) => {
      out.push(maskKey(line));
      if (debug && line.trim()) say(`stdout: ${event(line)}`);
    });
    let timedOut = false;
    let quota = false;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      else child.kill("SIGKILL");
    };
    lines(child.stderr, (line) => {
      err.push(maskKey(line));
      if (debug) say(maskKey(line));
      // Two seconds later: the rest of the error (the limit, the wait) comes in the next lines.
      if (DAILY.test(line) && !quota) {
        quota = true;
        setTimeout(stop, 2000).unref();
      }
    });
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stdout: out.join("\n"), stderr: err.join("\n"), timedOut, quota });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ code: -1, stdout: out.join("\n"), stderr: [...err, error.message].join("\n"), timedOut, quota });
    });
  });
}

export default class GeminiCliProvider {
  constructor() {
    this.model = process.env.REPOMAGPIE_EVAL_MODEL;
    this.pauseMs = Number(process.env.REPOMAGPIE_EVAL_PAUSE ?? "15") * 1000;
    this.debug = process.env.REPOMAGPIE_EVAL_DEBUG === "1";
    this.handlesOwnRetries = true; // promptfoo's scheduler: no retries of a failed scenario
  }

  id() {
    return `gemini-cli/${this.model}`;
  }

  async callApi(prompt) {
    if (limited) return { error: `${SKIPPED} (${limited})`, cost: 0, metadata: { skipped: true, requests: 0 } };
    const cli = geminiCli();
    if (!cli) return { error: "Gemini CLI isn't on PATH: npm install -g @google/gemini-cli", cost: 0 };
    const wait = lastEnd + this.pauseMs - Date.now();
    if (lastEnd && wait > 0) await sleep(wait);
    const result = await run(geminiArgs(cli.entry, prompt, this.model, this.debug), this.debug);
    lastEnd = Date.now();

    const parsed = parseStream(result.stdout);
    const problem = geminiProblem(parsed, result.stderr);
    const said = `${problem.status ? `API status ${problem.status}: ` : ""}${problem.message || "nothing on stderr (rerun with --debug)"}`;
    if (problem.daily) limited = problem.message.slice(0, 120);
    const attempts = problem.retries ? `, ${problem.retries} failed attempts` : "";
    // Exit 53 is Gemini CLI's turn limit: the checks still judge what the agent did until then. The
    // daily quota fails the scenario even with a reply: the agent was stopped partway.
    const failed = problem.daily
      ? `stopped at the free tier's daily quota after ${parsed.turns} model turns: ${said}`
      : result.timedOut
        ? `stopped after ${TIMEOUT_MS / 60_000} minutes, ${parsed.turns} model turns${attempts}; Gemini CLI's last word: ${said}`
        : ![0, 53].includes(result.code) && !parsed.reply
          ? `Gemini CLI exited ${result.code}${attempts}: ${said}`
          : null;
    return {
      output: parsed.reply,
      cost: 0, // free tier: no charge counted
      metadata: {
        toolCalls: parsed.toolCalls,
        model: parsed.model,
        turns: parsed.turns,
        turn_limit: result.code === 53,
        requests: requestsOf(parsed, problem),
        daily_quota: problem.daily,
        exit_code: result.code,
        texts: parsed.texts,
        errors: parsed.errors,
        problem,
        unreadable_lines: parsed.unreadable,
        result: parsed.result,
        gemini_cli: cli.version,
        stderr: result.stderr.slice(-2000),
      },
      ...(failed ? { error: failed } : {}),
    };
  }
}
