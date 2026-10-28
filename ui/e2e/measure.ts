// With REPOMAGPIE_MEASURE=1, the timing tests also write their numbers to
// .scratch/measure/e2e-timings.json, with the commit they ran on, for npm run measure
// (scripts/measure.ts reads them only when the commit is the one it measures). Each test adds its own
// numbers; a file from another commit is started again. Each number keeps its last RUNS runs, and
// `ms` is their median: run a timing test three times for the median of 3.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_TIMINGS = fileURLToPath(new URL("../../.scratch/measure/e2e-timings.json", import.meta.url));
export const RUNS = 3;

export interface Timing { ms: number; budget: number | null; runs?: number[] }
export interface E2eTimings { commit: string; date: string; timings: Record<string, Timing> }

// A number with one more run: the last RUNS runs kept (a file from before runs were kept counts its
// `ms` as one), and `ms` their median (of two, their mean).
export function withRun(before: Timing | undefined, ms: number, budget: number | null): Timing {
  const runs = [...(before ? (before.runs ?? [before.ms]) : []), Math.round(ms)].slice(-RUNS);
  const sorted = [...runs].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return { ms: sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2), budget, runs };
}

export function recordTimings(timings: Record<string, { ms: number; budget: number | null }>): void {
  if (process.env.REPOMAGPIE_MEASURE !== "1") return;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  let file: E2eTimings = { commit, date: "", timings: {} };
  try {
    const old = JSON.parse(readFileSync(E2E_TIMINGS, "utf8")) as E2eTimings;
    if (old.commit === commit) file = old;
  } catch {
    // no file yet, or one that can't be read: start again
  }
  file.date = new Date().toISOString();
  for (const [name, timing] of Object.entries(timings)) file.timings[name] = withRun(file.timings[name], timing.ms, timing.budget);
  mkdirSync(dirname(E2E_TIMINGS), { recursive: true });
  writeFileSync(E2E_TIMINGS, `${JSON.stringify(file, null, 2)}\n`);
}
