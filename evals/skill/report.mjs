// The report's parts that run.mjs builds from promptfoo's results (README.md, "Reading the results"):
// the scenarios a config lists, --only's ids, each scenario's outcome, the saved report --resume
// merges into, and the report's lines. No model, no promptfoo: self-check.mjs runs them too.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { escapeRegExp } from "../../src/core/text.ts";
import { HERE } from "./fixture.mjs";

// The descriptions of a config's scenarios, in order: a scenario's id is its place, from 1. Every
// description is single-quoted in scenarios.yaml and dry.yaml; one that isn't stops the run.
export function scenarioList(config) {
  const file = config === "dry.yaml" ? "dry.yaml" : "scenarios.yaml";
  const text = readFileSync(join(HERE, file), "utf8");
  const found = [...text.matchAll(/^\s*- description: '((?:[^']|'')*)'\s*$/gm)].map((m) => m[1].replace(/''/g, "'"));
  if (found.length !== (text.match(/^\s*- description:/gm) ?? []).length) throw new Error(`${file}: a description isn't single-quoted on one line.`);
  return found;
}

// --only's ids: "3", "3,5,7", "3-7", "1-3,9". Each between 1 and `count`.
export function parseOnly(spec, count) {
  const ids = new Set();
  for (const part of String(spec ?? "").split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`--only takes scenario numbers and ranges, such as 3,5,7 or 3-7: not "${part.trim()}".`);
    const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (from < 1 || to > count || from > to) throw new Error(`--only: ${part.trim()} isn't within 1-${count}.`);
    for (let id = from; id <= to; id++) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

// promptfoo's --filter-pattern for these scenarios: their descriptions, whole.
export const filterFor = (descriptions) => `^(?:${descriptions.map(escapeRegExp).join("|")})$`;

// Each scenario's outcome in promptfoo's result rows, by id. A scenario the agent couldn't finish
// (an error from the provider: skipped, the daily quota, the time limit, no key) is "error", so
// --resume runs it again; one the checks judged, passed or not, is "done".
export function outcomes(rows, descriptions, date) {
  const byId = {};
  for (const r of rows) {
    const name = r.testCase?.description ?? r.description ?? "";
    const id = descriptions.indexOf(name) + 1;
    if (!id) continue;
    const s = (byId[id] ??= { description: name, passed: 0, runs: 0, reasons: [], status: "done", requests: 0, turns: 0, cost: 0, date });
    s.runs++;
    if (r.success) s.passed++;
    else {
      const reason = r.gradingResult?.componentResults?.find((c) => !c.pass)?.reason ?? r.gradingResult?.reason ?? r.response?.error ?? r.error ?? "failed";
      if (!s.reasons.includes(reason)) s.reasons.push(reason);
    }
    if (r.response?.error) s.status = "error";
    s.requests += Number(r.response?.metadata?.requests ?? 0);
    s.turns += Number(r.response?.metadata?.turns ?? 0);
    s.cost += Number(r.cost ?? r.response?.cost ?? 0);
  }
  return byId;
}

// The first daily-quota stop among the rows: the limit and the wait the API gave, if it did.
export const dailyQuotaOf = (rows) => rows.map((r) => r.response?.metadata?.daily_quota).find(Boolean) ?? null;

// The saved report for this agent, model, config and repeat count, or why --resume can't use it.
export function resumable(saved, run) {
  if (!saved) return { error: "There is no saved report to resume: run without --resume first." };
  const same = ["agent", "model", "config", "repeat"].filter((k) => saved[k] !== run[k]);
  if (same.length) return { error: `The saved report is for ${saved.agent}/${saved.model} (${saved.config}, --repeat ${saved.repeat}); --resume continues it only with the same ${same.join(", ")}. Run without --resume to start a new report for ${run.agent}/${run.model}.` };
  return { saved };
}

// The ids --resume runs: those the saved report has as "error", and those it doesn't have yet.
export const toResume = (saved, ids) => ids.filter((id) => saved.scenarios[id]?.status !== "done");

// The report: the header, the overall line, what the run used, each scenario, and how to go on
// after a daily-quota stop. `run` has agent, model, config, repeat, date, gemini (its version or
// null), this run's ids and rows, and the reset count.
export function reportLines(state, run) {
  const all = Object.entries(state.scenarios).sort(([a], [b]) => Number(a) - Number(b));
  const passed = all.reduce((n, [, s]) => n + s.passed, 0);
  const runs = all.reduce((n, [, s]) => n + s.runs, 0);
  const percent = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "n/a");
  // A Markdown table cell: backslashes first, so a "\|" in the text can't end the cell.
  const cell = (text) => text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  const fresh = outcomes(run.rows, run.descriptions, run.date);
  const ran = Object.values(fresh);
  const turns = ran.reduce((n, s) => n + s.turns, 0);
  const requests = ran.reduce((n, s) => n + s.requests, 0);
  const reached = ran.filter((s) => s.requests > 0).length; // scenarios that sent a request
  const spent = run.gemini
    ? `Cost: free tier / subscription, no charge counted. Gemini CLI ${run.gemini}, ${turns} model turns.`
    : `Cost: $${ran.reduce((n, s) => n + s.cost, 0).toFixed(2)}, as promptfoo reports it.`;
  const left = run.descriptions.map((_, i) => i + 1).filter((id) => state.scenarios[id]?.status !== "done");
  const lines = [
    `# Skill compliance: ${run.agent}/${run.model}, ${run.date}`,
    "",
    `${run.config}, ${run.repeat} ${run.repeat === 1 ? "run" : "runs"} per scenario. Overall: ${passed}/${runs} (${percent(passed, runs)}). ${spent}`,
  ];
  if (run.gemini) lines.push("", `Requests: about ${requests} in this run, for ${reached} ${reached === 1 ? "scenario" : "scenarios"} that reached the API${reached ? ` (about ${Math.round(requests / reached)} each)` : ""}: one per model turn and per refused request. Plan a day's run against the model's daily limit (README.md, "Limits").`);
  const daily = dailyQuotaOf(run.rows);
  if (daily) {
    const limit = daily.limit ? `, ${daily.limit} requests a day for ${run.model} as the API gives it` : "";
    const wait = daily.retry_in ? `; it says to retry in ${daily.retry_in}` : "";
    lines.push("", `Stopped at the free tier's daily quota${limit}${wait}. ${left.length} of ${run.descriptions.length} scenarios left. After the reset (midnight Pacific time), go on with:`, "", "```", `node run.mjs --agent ${run.agent} --model ${run.model}${run.config === "dry.yaml" ? " --dry" : ""}${run.repeat > 1 ? ` --repeat ${run.repeat}` : ""} --resume`, "```");
  } else if (left.length) lines.push("", `${left.length} of ${run.descriptions.length} scenarios not finished yet (${left.join(", ")}): \`--resume\` runs them.`);
  lines.push(
    "",
    "| # | Scenario | Passed | Rate | Why it failed |",
    "|---|---|---|---|---|",
    ...all.map(([id, s]) => `| ${id} | ${cell(s.description)} | ${s.passed}/${s.runs} | ${percent(s.passed, s.runs)} | ${cell(s.reasons.join("; "))} |`),
  );
  const freshRuns = ran.reduce((n, s) => n + s.runs, 0);
  if (run.resets < freshRuns) lines.push("", `Warning: the journal was reset ${run.resets} times for ${freshRuns} runs: the beforeEach hook didn't run for each scenario, so a scenario may have seen another one's notes.`);
  return lines;
}
