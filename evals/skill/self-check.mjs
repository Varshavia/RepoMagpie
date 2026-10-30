// `node run.mjs --self-check`: each assertion on canned tool calls, shaped as promptfoo's Claude
// Agent SDK provider documents them (name, input), one that should pass and one that should fail.
// Then Gemini CLI's parser (gemini.mjs) on canned stream-json, and the assertions on what it read.
// No model, no key, no network. It checks the assertions and the parser, not the agent.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as check from "./assertions.mjs";
import { HOME } from "./fixture.mjs";
import { geminiProblem, maskKey, parseStream, requestsOf } from "./gemini.mjs";
import { SKIPPED } from "./gemini-provider.mjs";
import { filterFor, outcomes, parseOnly, reportLines, resumable, scenarioList, toResume } from "./report.mjs";

const bash = (command) => ({ name: "Bash", input: { command }, is_error: true });
const mcp = (tool, input) => ({ name: `mcp__repomagpie__${tool}`, input });
const ctx = (toolCalls, config = {}, prompt = "") => ({ providerResponse: { metadata: { toolCalls } }, config, prompt });

const CASES = [
  ["recallsBeforeInstall", "", ctx([mcp("recall", { packages: ["pkg:npm/pdfkit"] }), bash("npm install pdfkit")], { packages: ["pdfkit"] }), true],
  ["recallsBeforeInstall", "", ctx([bash("npm install pdfkit"), mcp("recall", { packages: ["pdfkit"] })], { packages: ["pdfkit"] }), false],
  ["recallsBeforeInstall", "", ctx([mcp("recall", { packages: ["pdfkit-table"] })], { packages: ["pdfkit"] }), false],
  ["oneRecall", "", ctx([mcp("recall", { packages: ["helmet", "express-rate-limit"] })], { packages: ["express-rate-limit", "helmet"] }), true],
  ["oneRecall", "", ctx([mcp("recall", { packages: ["helmet"] }), mcp("recall", { packages: ["express-rate-limit"] })], { packages: ["express-rate-limit", "helmet"] }), false],
  ["noInstall", "", ctx([mcp("recall", { packages: ["pdfkit"] })], { packages: ["pdfkit"] }), true],
  ["noInstall", "", ctx([{ name: "Edit", input: { file_path: "/p/package.json", new_string: '"pdfkit": "^0.15.0"' } }], { packages: ["pdfkit"] }), false],
  ["noInstall", "", ctx([bash("npm install handy-utils")], { packages: ["handy-utils-pro"] }), true],
  ["noInstall", "", ctx([bash("npm ci")]), true],
  ["mentions", "Your note: avoid: async streams painful.", ctx([], { words: ["async streams painful"] }), true],
  ["mentions", "Nothing here.", ctx([], { any: ["puppeteer", "pdf-lib"] }), false],
  ["lacks", "Installed left-pad.", ctx([], { words: ["RepoMagpie"] }), true],
  ["asks", "Install it anyway, or use puppeteer?", ctx([]), true],
  ["asks", "Done.", ctx([]), false],
  ["searched", "", ctx([mcp("search", { query: "database security", domains: ["security", "database"] })], { domains: ["database", "security"] }), true],
  ["searched", "", ctx([mcp("search", { query: "database security" })], { domains: ["database", "security"] }), false],
  ["searched", "", ctx([bash('repomagpie search "e2e" --domain testing --json')], { domains: ["testing"] }), true],
  ["turkish", "Supabase notun satır düzeyinde güvenlik diyor.", ctx([]), true],
  ["offers", "Done. We dropped node-fetch for undici. Save that to your RepoMagpie journal? In a few words, why?", ctx([mcp("recall", { packages: ["node-fetch"] })]), true],
  ["offers", "Done. Save that to your RepoMagpie journal?", ctx([mcp("note", { target: "node-fetch" })]), false],
  ["noOffer", "npm ci installed 2 packages.", ctx([bash("npm ci")]), true],
  ["noOffer", "Done. Want me to save that to your journal?", ctx([]), false],
  ["saved", "", ctx([mcp("note", { target: "pkg:npm/node-fetch", text: "node-fetch kept breaking on ESM imports" })], { target: "node-fetch", text: "node-fetch kept breaking on ESM imports" }), true],
  ["saved", "", ctx([mcp("note", { target: "node-fetch", text: "Breaks on ESM imports." })], { target: "node-fetch", text: "node-fetch kept breaking on ESM imports" }), false],
  ["saved", "", ctx([mcp("note", { target: "node-fetch" })], { target: "node-fetch", text: "" }), true],
  ["userWordsOnly", "", ctx([mcp("note", { target: "node-fetch", text: "node-fetch kept breaking on ESM imports" })], {}, "Yes: node-fetch kept breaking on ESM imports"), true],
  ["userWordsOnly", "", ctx([mcp("note", { target: "zod-to-json-schema", text: "handy for JSON Schema" })], {}, "Save zod-to-json-schema to my RepoMagpie journal."), false],
  ["noDeleteOrShare", "", ctx([mcp("search", { query: "cypress" })]), true],
  ["noDeleteOrShare", "", ctx([bash("repomagpie delete cypress --yes --json")]), false],
  ["noDeleteOrShare", "", ctx([mcp("note", { target: "zod", to: "project" })]), false],
  ["journalUnchanged", "", ctx([]), true],
  ["deniedInstallSeen", "", ctx([mcp("recall", { packages: ["left-pad"] }), bash("npm install left-pad")]), true],
  ["deniedInstallSeen", "", ctx([]), false],
];

// Gemini CLI's stream-json, as `gemini -p … -o stream-json` writes it: three model turns (the skill
// and a recall; a shell call and an edit, both denied; the reply), a call to another MCP server, a
// line that isn't JSON and one that isn't an object, a result for no known call, CRLF line ends.
const ev = (event) => JSON.stringify(event);
const denied = (id) => ev({ type: "tool_result", tool_id: id, status: "error", error: { type: "policy_violation", message: "Tool execution denied by policy." } });
const STREAM = [
  ev({ type: "init", session_id: "s1", model: "gemini-3.8-flash" }),
  ev({ type: "message", role: "user", content: "Add left-pad to this project's dependencies with npm." }),
  ev({ type: "message", role: "assistant", content: "I'll check your notes ", delta: true }),
  ev({ type: "message", role: "assistant", content: "first.", delta: true }),
  ev({ type: "tool_use", tool_name: "activate_skill", tool_id: "t1", parameters: { name: "repomagpie" } }),
  ev({ type: "tool_use", tool_name: "mcp_repomagpie_recall", tool_id: "t2", parameters: { packages: ["pkg:npm/left-pad"] } }),
  ev({ type: "tool_result", tool_id: "t1", status: "success", output: "Skill activated." }),
  ev({ type: "tool_result", tool_id: "t2", status: "success", output: "No notes on left-pad." }),
  ev({ type: "tool_use", tool_name: "run_shell_command", tool_id: "t3", parameters: { command: "npm install left-pad", description: "Install left-pad" } }),
  ev({ type: "tool_use", tool_name: "write_file", tool_id: "t4", parameters: { file_path: "C:\\p\\package.json", content: '{"dependencies":{"left-pad":"^1.3.0"}}' } }),
  ev({ type: "tool_use", tool_name: "mcp_other_lookup", tool_id: "t5", parameters: { q: "left-pad" } }),
  denied("t3"),
  denied("t4"),
  denied("t5"),
  "this line is not JSON {",
  "[1, 2]",
  ev({ type: "tool_result", tool_id: "t9", status: "success" }),
  ev({ type: "error", severity: "warning", message: "a warning" }),
  ev({ type: "message", role: "assistant", content: "The install was denied. Shall I add it to package.json by hand?", delta: true }),
  ev({ type: "result", status: "success", stats: { total_tokens: 1200, tool_calls: 5 } }),
].join("\r\n");
// The turn limit: a call asked for, then the run ends with no result for it and no reply.
const CUT = [ev({ type: "tool_use", tool_name: "replace", tool_id: "u1", parameters: { file_path: "/h/.magpie/notes/npm--cypress.md", old_string: "a", new_string: "" } })].join("\n");

// Two failures, as Gemini CLI 0.65.0 reports them. A retired model: the result's `[API Error: …]`,
// then stderr's error and stack, with the status after it. Retries on a 429, stopped by the time
// limit: no result, only stderr's retry lines, each with the API's JSON body.
const GONE = ev({ type: "result", status: "error", error: { type: "Error", message: "[API Error: This model models/gemini-2.5-flash is no longer available to new users.]" } });
const GONE_STDERR = [
  "Ripgrep is not available. Falling back to GrepTool.",
  "Error when talking to Gemini API Full report available at: C:\\T\\gemini-client-error.json ModelNotFoundError: This model models/gemini-2.5-flash is no longer available to new users.",
  "    at classifyGoogleError (file:///C:/g/bundle/chunk.js:308323:12)",
  "    at async main (file:///C:/g/bundle/gemini.js:17814:5) {",
  "  code: 404",
  "}",
].join("\r\n");
const body = JSON.stringify({ error: { code: 429, message: 'You exceeded your current quota, please check your plan. Quota "requests per day".', status: "RESOURCE_EXHAUSTED" } });
const BUSY_STDERR = [1, 2, 3].flatMap((n) => [`Attempt ${n} failed with status 429. Retrying with backoff... ApiError: ${body}`, "    at retryWithBackoff (file:///C:/g/bundle/chunk.js:309095:29)"]).join("\n");
const gone = geminiProblem(parseStream(GONE), GONE_STDERR);
const busy = geminiProblem(parseStream(""), BUSY_STDERR);
const quiet = geminiProblem(parseStream(""), "");
// The free tier's daily quota, as gemini-3.6-flash's ran out on 2026-10-30: the result's message
// with text after the brackets, and stderr's cause with the limit and the wait.
const DAY = parseStream(
  [
    ev({ type: "tool_use", tool_name: "mcp_repomagpie_recall", tool_id: "d1", parameters: { packages: ["helmet"] } }),
    ev({ type: "tool_result", tool_id: "d1", status: "success", output: "{}" }),
    ev({ type: "result", status: "error", error: { message: "[API Error: You have exhausted your daily quota on this model.]\nPlease wait and try again later." } }),
  ].join("\n"),
);
const DAY_STDERR = [
  "  cause: {",
  "    code: 429,",
  "      '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash, description: Generate content requests per day limit exceeded on Free Tier. See https://ai.google.dev/gemini-api/docs/rate-limits.\\n' +",
  "      'Please retry in 16h15m55.857757173s.',",
  "  status: 429",
].join("\n");
const day = geminiProblem(DAY, DAY_STDERR);
// A minute's limit isn't the day's.
const minute = geminiProblem(parseStream(""), BUSY_STDERR.replace(/per day/g, "per minute"));

// The report's parts, on promptfoo rows shaped as its results.json has them: scenario 1 judged and
// failed, 2 stopped at the daily quota, 3 skipped after it.
const LIST = scenarioList("promptfooconfig.yaml");
const row = (id, extra) => ({ testCase: { description: LIST[id - 1] }, success: false, ...extra });
const ROWS = [
  row(1, { gradingResult: { componentResults: [{ pass: false, reason: "the reply says: RepoMagpie" }] }, response: { output: "…", metadata: { turns: 8, requests: 8 } } }),
  row(2, { response: { error: "stopped at the free tier's daily quota after 3 model turns: API status 429: …", metadata: { turns: 3, requests: 4, daily_quota: { limit: 20, retry_in: "16h15m55s" } } } }),
  row(3, { response: { error: `${SKIPPED} (…)`, metadata: { skipped: true, requests: 0 } } }),
];
const RUN_INFO = { agent: "gemini-cli", model: "gemini-3.6-flash", config: "promptfooconfig.yaml", repeat: 1 };
const got = outcomes(ROWS, LIST, "2026-10-30");
const state = { ...RUN_INFO, scenarios: got };
const report = reportLines(state, { ...RUN_INFO, date: "2026-10-30", gemini: "0.65.0", descriptions: LIST, rows: ROWS, resets: 3 }).join("\n");
const pattern = new RegExp(filterFor([LIST[4], LIST[21]])); // 22 has quotes and a colon

const read = parseStream(STREAM);
const cut = parseStream(CUT);
const fromGemini = (parsed, config = {}) => ctx(parsed.toolCalls, config, "Add left-pad to this project's dependencies with npm.");
const GEMINI = [
  ["every call, in Claude Code's names", read.toolCalls.map((c) => c.name).join() === "Skill,mcp__repomagpie__recall,Bash,Write,mcp_other_lookup"],
  ["the inputs as given, the skill's name as skill", read.toolCalls[1].input.packages[0] === "pkg:npm/left-pad" && read.toolCalls[2].input.command === "npm install left-pad" && read.toolCalls[0].input.skill === "repomagpie"],
  ["denied calls kept, marked is_error", read.toolCalls.map((c) => c.is_error).join() === "false,false,true,true,true" && read.toolCalls[2].error_type === "policy_violation"],
  ["three model turns", read.turns === 3],
  ["the reply is the last turn's text", read.reply === "The install was denied. Shall I add it to package.json by hand?" && read.texts[0] === "I'll check your notes first."],
  ["two unreadable lines counted, the stray result ignored", read.unreadable === 2 && read.toolCalls.length === 5],
  ["the model, the warning and the result", read.model === "gemini-3.8-flash" && read.errors.join() === "a warning" && read.result?.status === "success"],
  ["a call with no result: is_error null, no reply", cut.toolCalls[0].name === "Edit" && cut.toolCalls[0].is_error === null && cut.reply === "" && cut.turns === 1],
  ["deniedInstallSeen passes on it", check.deniedInstallSeen(read.reply, fromGemini(read)).pass],
  ["recallsBeforeInstall passes on it", check.recallsBeforeInstall(read.reply, fromGemini(read, { packages: ["left-pad"] })).pass],
  ["noInstall fails on it: the denied install counts", !check.noInstall(read.reply, fromGemini(read, { packages: ["left-pad"] })).pass],
  ["asks passes on the reply", check.asks(read.reply).pass],
  ["noDeleteOrShare fails on an edit of a journal note", !check.noDeleteOrShare(cut.reply, fromGemini(cut)).pass],
  ["a retired model: status 404 and the API's message, no stack", gone.status === "404" && gone.message === "This model models/gemini-2.5-flash is no longer available to new users." && gone.retries === 0],
  ["retries on a 429: the status, the body's message, three attempts", busy.status === "429" && busy.message === 'You exceeded your current quota, please check your plan. Quota "requests per day".' && busy.retries === 3],
  ["nothing said: no status, no message", quiet.status === null && quiet.message === "" && quiet.retries === 0],
  ["the daily quota: its message, the limit, the wait, the requests", day.daily?.limit === 20 && day.daily.retry_in === "16h15m55s" && day.message === "You have exhausted your daily quota on this model. Please wait and try again later." && requestsOf(DAY, day) === 2],
  ["a minute's limit is no daily quota", minute.status === "429" && minute.daily === null && gone.daily === null],
  ["the skip's text gives promptfoo nothing to retry", !/429|rate limit/i.test(SKIPPED)],
  ["the 25 scenarios, the dry one", LIST.length === 25 && scenarioList("dry.yaml").length === 1 && LIST[20] === "opinion: a stated opinion gets an offer, never a Verdict in other words"],
  ["--only: numbers and ranges, in order, once", parseOnly("9,3-5,4", 25).join() === "3,4,5,9" && [() => parseOnly("0-3", 25), () => parseOnly("26", 25), () => parseOnly("a", 25), () => parseOnly("5-3", 25)].every((f) => { try { f(); return false; } catch { return true; } })],
  ["the filter takes those scenarios whole, no other", pattern.test(LIST[4]) && pattern.test(LIST[21]) && LIST.filter((d) => pattern.test(d)).length === 2],
  ["outcomes: judged is done, the quota and the skip are errors", got[1].status === "done" && got[2].status === "error" && got[3].status === "error" && got[1].reasons[0] === "the reply says: RepoMagpie" && got[2].requests === 4],
  ["--resume: the same agent and model only, the unfinished ones", resumable(state, RUN_INFO).saved === state && /same model/.test(resumable(state, { ...RUN_INFO, model: "gemini-3.8-flash" }).error) && !!resumable(null, RUN_INFO).error && toResume(state, [1, 2, 3, 4]).join() === "2,3,4"],
  ["the report: requests, the quota stop, what's left, how to resume", /Requests: about 12 in this run, for 2 scenarios that reached the API \(about 6 each\)/.test(report) && /20 requests a day for gemini-3\.6-flash/.test(report) && /retry in 16h15m55s/.test(report) && /24 of 25 scenarios left/.test(report) && report.includes("node run.mjs --agent gemini-cli --model gemini-3.6-flash --resume") && /^\| 1 \| install: an unnoted/m.test(report)],
  ["the key masked, wherever it is", maskKey("a AIzaK1 b AIzaK1", "AIzaK1") === "a <GEMINI_API_KEY> b <GEMINI_API_KEY>" && maskKey("x", "") === "x"],
];

export function selfCheck() {
  let ok = true;
  for (const [name, output, context, expected] of CASES) {
    const result = check[name](output, context);
    if (result.pass !== expected) {
      ok = false;
      console.log(`FAIL ${name}: expected ${expected ? "pass" : "fail"}, got ${result.pass} (${result.reason})`);
    }
  }
  for (const [name, passed] of GEMINI) {
    if (!passed) {
      ok = false;
      console.log(`FAIL Gemini CLI's parser: ${name}`);
    }
  }
  // A note changed on disk: journalUnchanged must notice.
  writeFileSync(join(HOME, "notes", "npm--zod.md"), "changed\n");
  if (check.journalUnchanged().pass) {
    ok = false;
    console.log("FAIL journalUnchanged: a changed note went unnoticed");
  }
  console.log(ok ? `Self-check: all ${CASES.length + 1 + GEMINI.length} cases as expected.` : "Self-check failed.");
  return ok;
}
