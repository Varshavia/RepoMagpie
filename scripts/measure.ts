// npm run measure: one report of every number an optimisation is judged by (CLAUDE.md §5,
// "Optimisations"): the package, the CLI's largest chunks, the app's sizes, what an agent reads into
// its context, every benchmark's median, the CLI's start, the evals, the tests, and the end-to-end
// timings when REPOMAGPIE_MEASURE=1 npm run test:e2e recorded them for this commit. It runs the
// existing measurements and collects their numbers, each with its budget where there is one (spec §7,
// docs/ui.md §10). It never fails because a number is over a budget: the checks do that. A group that
// can't run is reported as not measured, and the others still run. Run npm run build first.
//   --json             the report as one JSON document on stdout
//   --save <name>      also write it to .scratch/measure/<name>.json (local: the numbers depend on the machine)
//   --compare <a> <b>  two saved reports side by side, with the change: what an optimisation's PR pastes
//   --quick            skip the slow groups (speed, startup, quality, tests)
// Without --json, each number shows its change from the most recently saved report.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { removeFolder } from "../src/core/copy-folder.ts";
import { E2E_TIMINGS, type E2eTimings } from "../ui/e2e/measure.ts";
import type { BenchResult } from "./bench-journal.ts";
import { BUDGET_KB, bundleSizes, FIRST_LOAD_LINE_KB, sum } from "./bundle-sizes.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
export const MEASURE_DIR = join(root, ".scratch", "measure");
const KB = 1024;

export type Unit = "B" | "ms" | "%" | "mrr" | "count" | "tokens";
// better: which way is an improvement; none for a count that is neither (the number of tests).
export interface Measure { value: number; unit: Unit; budget?: number; better?: "lower" | "higher" }
export type Numbers = Record<string, Measure>;
export type Group = { numbers: Numbers; problems?: string[] } | { not_measured: string };
export interface Report { commit: string; dirty: boolean; date: string; node: string; os: string; cpu: string; groups: Record<string, Group> }
export interface Saved { name: string; report: Report }
export type Collector = () => Group | Promise<Group>;

export const SLOW = ["speed", "startup", "quality", "tests"];
const TITLES: Record<string, string> = {
  package: "Package (npm pack --dry-run)",
  cli: "CLI: the 5 largest chunks in dist/cli/, raw",
  app: "App (dist/ui/, gzipped)",
  agent: "Agent footprint",
  speed: "Speed: benchmark medians on 2,000 notes (npm run bench)",
  startup: "Startup: the built CLI, median of 5 (cold: the journal's caches deleted before each run)",
  quality: "Quality (eval:retrieval over all needs; eval:classification, the run with every signal)",
  tests: "Tests (npm test)",
  e2e: "End-to-end timings (REPOMAGPIE_MEASURE=1 npm run test:e2e)",
};

const lower = (value: number, unit: Unit, budget?: number | null): Measure => ({ value, unit, better: "lower", ...(budget == null ? {} : { budget }) });
const higher = (value: number, unit: Unit): Measure => ({ value, unit, better: "higher" });
const count = (value: number): Measure => ({ value, unit: "count" });
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
// The useful line of a failed script's stderr: its error, else its first line.
const reason = (stderr: string) => {
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (lines.find((line) => /^\w*Error\b/.test(line)) ?? lines[0] ?? "no output").slice(0, 300);
};

// Runs each collector in order (skipping the named ones); one that throws is "not measured" with
// its reason, and the rest still run.
export async function collect(collectors: Record<string, Collector>, skip: string[] = [], progress: (name: string) => void = () => {}): Promise<Record<string, Group>> {
  const groups: Record<string, Group> = {};
  for (const [name, collector] of Object.entries(collectors)) {
    if (skip.includes(name)) {
      groups[name] = { not_measured: "skipped (--quick)" };
      continue;
    }
    progress(name);
    try {
      groups[name] = await collector();
    } catch (error) {
      groups[name] = { not_measured: message(error) };
    }
  }
  return groups;
}

// A group made of parts that can fail one by one (one script each): the parts that ran give its
// numbers, the others its problems. Not measured only when no part ran.
export function parts(list: [string, () => Numbers][]): Group {
  const numbers: Numbers = {};
  const problems: string[] = [];
  for (const [name, part] of list) {
    try {
      Object.assign(numbers, part());
    } catch (error) {
      problems.push(`${name}: ${message(error)}`);
    }
  }
  if (!Object.keys(numbers).length) return { not_measured: problems.join("; ") };
  return problems.length ? { numbers, problems } : { numbers };
}

export function format(m: Measure | undefined): string {
  if (!m) return "-";
  const n = m.value;
  switch (m.unit) {
    case "B": return n < KB ? `${n} B` : n < KB * KB ? `${(n / KB).toFixed(1)} kB` : `${(n / KB / KB).toFixed(2)} MB`;
    case "ms": return `${Math.round(n).toLocaleString("en")} ms`;
    case "%": return `${n.toFixed(1)} %`;
    case "mrr": return n.toFixed(3);
    case "count": return n.toLocaleString("en");
    case "tokens": return `~${Math.round(n).toLocaleString("en")}`;
  }
}

// Over the budget: a time at or over it (budgets say "under"), a size or anything else over it.
export const over = (m: Measure) => m.budget !== undefined && (m.unit === "ms" ? m.value >= m.budget : m.value > m.budget);

// The change from before to after: the percentage, an arrow, and better or worse when the number
// has a direction.
export function change(before: Measure | undefined, after: Measure | undefined): string {
  if (!before || !after) return before ? "gone" : after ? "new" : "";
  if (before.value === after.value) return "=";
  const up = after.value > before.value;
  const pct = before.value === 0 ? "" : `${up ? "+" : ""}${((100 * (after.value - before.value)) / before.value).toFixed(1)}% `;
  const verdict = after.better ? ((after.better === "lower") === !up ? " better" : " worse") : "";
  return `${pct}${up ? "↑" : "↓"}${verdict}`;
}

// Rows of cells, padded to columns; align has one letter a column: l (left) or r (right).
function columns(rows: string[][], align: string): string[] {
  const widths = rows[0].map((_, k) => Math.max(...rows.map((row) => row[k].length)));
  return rows.map((row) => row.map((cell, k) => (align[k] === "r" ? cell.padStart(widths[k]) : cell.padEnd(widths[k]))).join("   ").trimEnd());
}

const describe = (r: Report) => `commit ${r.commit.slice(0, 7)}${r.dirty ? " with uncommitted changes" : ""}, ${r.date}, Node ${r.node}, ${r.os}, ${r.cpu}`;
const numbersOf = (group: Group | undefined): Numbers => (group && "numbers" in group ? group.numbers : {});
const budgetCell = (m: Measure) => (m.budget === undefined ? "" : `budget ${format({ ...m, value: m.budget })}${over(m) ? " (over)" : ""}`);

// The terminal report: one table per group, each number with its budget, and its change from
// `previous` when there is one.
export function renderReport(report: Report, previous?: Saved): string {
  const out = [describe(report)];
  if (previous) out.push(`change: from ${previous.name} (${describe(previous.report)})`);
  for (const [name, group] of Object.entries(report.groups)) {
    out.push("", TITLES[name] ?? name);
    if ("not_measured" in group) {
      out.push(`  not measured: ${group.not_measured}`);
      continue;
    }
    const before = numbersOf(previous?.report.groups[name]);
    out.push(...columns(Object.entries(group.numbers).map(([label, m]) => [`  ${label}`, format(m), budgetCell(m), previous ? change(before[label], m) : ""]), "lrll"));
    for (const problem of group.problems ?? []) out.push(`  not measured: ${problem}`);
  }
  return out.join("\n");
}

// Two saved reports side by side: every number either has, with the change from a to b.
export function renderCompare(a: Saved, b: Saved): string {
  const out = [`a: ${a.name}, ${describe(a.report)}`, `b: ${b.name}, ${describe(b.report)}`];
  const names = [...new Set([...Object.keys(a.report.groups), ...Object.keys(b.report.groups)])];
  for (const name of names) {
    const [ga, gb] = [a.report.groups[name], b.report.groups[name]];
    const [na, nb] = [numbersOf(ga), numbersOf(gb)];
    const labels = [...new Set([...Object.keys(na), ...Object.keys(nb)])];
    out.push("", TITLES[name] ?? name);
    if (!labels.length) {
      const why = (g: Group | undefined) => (g && "not_measured" in g ? g.not_measured : "not in the report");
      out.push(`  not measured: a: ${why(ga)}; b: ${why(gb)}`);
      continue;
    }
    const rows = labels.map((label) => [`  ${label}`, format(na[label]), format(nb[label]), change(na[label], nb[label])]);
    out.push(...columns([["", a.name, b.name, "change"], ...rows], "lrrl"));
  }
  return out.join("\n");
}

// A saved report by name (.scratch/measure/<name>.json).
export function readSaved(name: string, dir = MEASURE_DIR): Saved {
  const file = join(dir, name.endsWith(".json") ? name : `${name}.json`);
  if (!existsSync(file)) throw new Error(`No saved report ${name} in ${dir}. Save one with npm run measure -- --save ${name}.`);
  return { name: basename(file, ".json"), report: JSON.parse(readFileSync(file, "utf8")) as Report };
}

// The most recently saved report, if any (the end-to-end timings' file is not one).
export function lastSaved(dir = MEASURE_DIR): Saved | undefined {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter((name) => name.endsWith(".json") && name !== basename(E2E_TIMINGS));
  const newest = files.sort((x, y) => statSync(join(dir, y)).mtimeMs - statSync(join(dir, x)).mtimeMs)[0];
  return newest ? readSaved(newest, dir) : undefined;
}

// The end-to-end timings, when they were recorded for this commit.
export function e2eGroup(commit: string, file = E2E_TIMINGS): Group {
  const hint = "run REPOMAGPIE_MEASURE=1 npm run test:e2e first";
  let recorded: E2eTimings;
  try {
    recorded = JSON.parse(readFileSync(file, "utf8")) as E2eTimings;
  } catch {
    return { not_measured: hint };
  }
  if (recorded.commit !== commit) return { not_measured: `they are from commit ${String(recorded.commit).slice(0, 7)}, not ${commit.slice(0, 7)}: ${hint}` };
  return { numbers: Object.fromEntries(Object.entries(recorded.timings).map(([label, t]) => [label, lower(t.ms, "ms", t.budget)])) };
}

// Vite's file names end in an 8-character hash: mcp-DDns-Vct.js is mcp-*.js in every build.
export function stableNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => {
    const stable = name.replace(/-[\w-]{8}(\.\w+)$/, "-*$1");
    const unique = seen.has(stable) ? name : stable;
    seen.add(unique);
    return unique;
  });
}

const dist = join(root, "dist");
const cli = join(dist, "cli", "main.js");
const needBuild = (path: string) => {
  if (!existsSync(path)) throw new Error("no build: run npm run build first");
};
const scriptJson = <T>(script: string, args: string[]): T => {
  const child = spawnSync(process.execPath, [join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (child.status !== 0) throw new Error(reason(child.stderr));
  return JSON.parse(child.stdout) as T;
};

// The MCP server's instructions and tool list as an agent receives them (the read tools, as most
// setups run it): in this process, through the SDK's in-memory transport.
async function mcpLists(): Promise<{ instructions: string; tools: { description: string }[] }> {
  const { InMemoryTransport } = await import("@modelcontextprotocol/server");
  const { buildServer } = await import("../src/mcp/server.ts");
  const nowhere = join(MEASURE_DIR, "no-journal");
  const server = buildServer({ place: { home: nowhere, env: { MAGPIE_HOME: nowhere }, cwd: nowhere }, allowWrite: false, version: "0.0.0", today: () => "2026-01-01", log: () => {} });
  const [client, side] = InMemoryTransport.createLinkedPair();
  const answers = new Map<number, (result: Record<string, unknown>) => void>();
  client.onmessage = (m) => {
    const answer = m as { id?: number; result?: Record<string, unknown> };
    if (answer.id !== undefined) answers.get(answer.id)?.(answer.result ?? {});
  };
  await server.connect(side);
  await client.start();
  let id = 0;
  const request = (method: string, params: object) => new Promise<Record<string, unknown>>((done) => {
    answers.set(++id, done);
    void client.send({ jsonrpc: "2.0", id, method, params } as never);
  });
  const init = await request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "measure", version: "1" } });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
  const list = await request("tools/list", {});
  await server.close();
  return { instructions: String(init.instructions ?? ""), tools: list.tools as { description: string }[] };
}

export function defaultCollectors(commit: string): Record<string, Collector> {
  return {
    package: () => {
      needBuild(cli);
      // npm is a .cmd file on Windows, which Node runs only through a shell; the arguments are fixed.
      const child = spawnSync("npm pack --dry-run --json --ignore-scripts", { cwd: root, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
      if (child.status !== 0) throw new Error(reason(child.stderr));
      const [pack] = JSON.parse(child.stdout) as { size: number; unpackedSize: number; entryCount: number }[];
      return { numbers: { "packed size": lower(pack.size, "B"), "unpacked size": lower(pack.unpackedSize, "B"), files: lower(pack.entryCount, "count") } };
    },
    cli: () => {
      needBuild(cli);
      const folder = join(dist, "cli");
      const files = readdirSync(folder).filter((name) => name.endsWith(".js")).map((name) => ({ name, bytes: statSync(join(folder, name)).size }));
      const largest = files.sort((a, b) => b.bytes - a.bytes).slice(0, 5);
      const names = stableNames(largest.map((file) => file.name));
      return { numbers: Object.fromEntries(largest.map((file, k) => [names[k], lower(file.bytes, "B")])) };
    },
    app: () => {
      needBuild(join(dist, "ui", "index.html"));
      const sizes = bundleSizes(join(dist, "ui"));
      const each = (prefix: string, files: { name: string; bytes: number }[]) => {
        const names = stableNames(files.map((file) => file.name));
        return Object.fromEntries(files.map((file, k) => [`${prefix}${names[k]}`, lower(file.bytes, "B")]));
      };
      return {
        numbers: {
          "total, gzipped": lower(sizes.total, "B", BUDGET_KB * KB),
          "first files (every screen but the lazy ones)": lower(sum(sizes.firstLoad), "B", FIRST_LOAD_LINE_KB * KB),
          ...each("first: ", sizes.firstLoad),
          ...each("lazy: ", sizes.lazy),
        },
      };
    },
    agent: async () => {
      const skill = readFileSync(join(root, "skills", "repomagpie", "SKILL.md"));
      const json = readFileSync(join(root, "skills", "repomagpie", "references", "json.md"));
      const { instructions, tools } = await mcpLists();
      return {
        numbers: {
          "SKILL.md": lower(skill.length, "B"),
          "SKILL.md, tokens (approximate: bytes / 4)": lower(skill.length / 4, "tokens"),
          "references/json.md": lower(json.length, "B"),
          "MCP tools' descriptions, total": lower(tools.reduce((total, tool) => total + Buffer.byteLength(tool.description), 0), "B"),
          "MCP tools/list (read tools), as JSON": lower(Buffer.byteLength(JSON.stringify(tools)), "B"),
          "MCP server instructions": lower(Buffer.byteLength(instructions), "B"),
        },
      };
    },
    speed: () => parts(["search", "catalog", "suggest", "recall", "links", "graph", "note", "mcp"].map((name) => [`bench-${name}.ts`, () => {
      const results = scriptJson<BenchResult[]>(`bench-${name}.ts`, ["--json", "--report-only"]);
      return Object.fromEntries(results.map((r) => [r.label, lower(r.median, "ms", r.budget)]));
    }])),
    startup: async () => {
      needBuild(cli);
      const { withJournal } = await import("./bench-journal.ts");
      const numbers: Numbers = {};
      await withJournal("startup", (folder, journal) => {
        const env = { ...process.env, MAGPIE_HOME: journal };
        const time = (args: string[]) => {
          const started = performance.now();
          const child = spawnSync(process.execPath, [cli, ...args], { cwd: folder, env, encoding: "utf8" });
          if (child.status !== 0) throw new Error(`repomagpie ${args.join(" ")}: ${reason(child.stderr)}`);
          return performance.now() - started;
        };
        for (const args of [["--version"], ["recall", "package-1500"]]) {
          const cold = Array.from({ length: 5 }, () => {
            removeFolder(join(journal, ".cache"));
            return time(args);
          });
          time(args); // builds the caches
          const warm = Array.from({ length: 5 }, () => time(args));
          numbers[`repomagpie ${args.join(" ")}, cold`] = lower(median(cold), "ms");
          numbers[`repomagpie ${args.join(" ")}, warm`] = lower(median(warm), "ms");
        }
      });
      return { numbers };
    },
    quality: () => parts([
      ["eval-retrieval.ts", () => {
        type Scores = { recall_at_5: number; recall_at_10: number; mrr: number };
        const r = scriptJson<{ needs: number; search: Record<string, Scores>; suggest: Scores; suggest_use_when: Scores }>("eval-retrieval.ts", ["--json"]);
        const numbers: Numbers = {};
        const add = (label: string, s: Scores) => {
          numbers[`${label}: recall@5`] = higher((100 * s.recall_at_5) / r.needs, "%");
          numbers[`${label}: recall@10`] = higher((100 * s.recall_at_10) / r.needs, "%");
          numbers[`${label}: MRR`] = higher(s.mrr, "mrr");
        };
        for (const [run, scores] of Object.entries(r.search)) add(`search, ${run}`, scores);
        add("suggest", r.suggest);
        add("suggest, +use when", r.suggest_use_when);
        return numbers;
      }],
      ["eval-classification.ts", () => {
        const c = scriptJson<{ repositories: number; after: { kindRight: number; suggested: number; right: number; expected: number } }>("eval-classification.ts", ["--json"]);
        return {
          "kind accuracy": higher((100 * c.after.kindRight) / c.repositories, "%"),
          "kind right": higher(c.after.kindRight, "count"),
          "domain precision": higher((100 * c.after.right) / (c.after.suggested || 1), "%"),
          "domain recall": higher((100 * c.after.right) / (c.after.expected || 1), "%"),
        };
      }],
    ]),
    tests: () => {
      const started = performance.now();
      const child = spawnSync(process.execPath, [join(root, "scripts", "test.ts"), "--test-reporter=tap"], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
      const wall = performance.now() - started;
      // The TAP reporter ends with a summary: "# tests 1747", "# pass 1736", ...
      const total = (name: string) => Number(new RegExp(`^# ${name} (\\d+)\\s*$`, "m").exec(child.stdout ?? "")?.[1] ?? Number.NaN);
      if (Number.isNaN(total("tests"))) throw new Error(`no test summary: ${reason(child.stderr ?? "")}`);
      const numbers = { "wall time": lower(wall, "ms"), tests: count(total("tests")), pass: count(total("pass")), fail: lower(total("fail"), "count"), skipped: count(total("skipped")) };
      return child.status === 0 ? { numbers } : { numbers, problems: [`npm test exited with ${child.status}: ${reason(child.stderr ?? "")}`] };
    },
    e2e: () => e2eGroup(commit),
  };
}

const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

async function main(argv: string[]): Promise<number> {
  let unknown: string | undefined;
  for (let k = 0; k < argv.length && !unknown; k++) {
    if (argv[k] === "--save") k += 1;
    else if (argv[k] === "--compare") k += 2;
    else if (argv[k] !== "--json" && argv[k] !== "--quick") unknown = argv[k];
  }
  if (unknown) {
    console.error(`Unknown option ${unknown}. Options: --json, --save <name>, --compare <a> <b>, --quick.`);
    return 2;
  }
  const at = argv.indexOf("--compare");
  if (at >= 0) {
    const [a, b] = [argv[at + 1], argv[at + 2]];
    if (!a || !b) {
      console.error("--compare needs two saved reports: npm run measure -- --compare <a> <b>.");
      return 2;
    }
    try {
      console.log(renderCompare(readSaved(a), readSaved(b)));
      return 0;
    } catch (error) {
      console.error(message(error));
      return 1;
    }
  }
  const save = argv.includes("--save") ? argv[argv.indexOf("--save") + 1] : undefined;
  if (argv.includes("--save") && (!save || !/^[\w.-]+$/.test(save) || `${save}.json` === basename(E2E_TIMINGS))) {
    console.error("--save needs a name of letters, digits, dots, dashes and underscores (not e2e-timings): npm run measure -- --save <name>.");
    return 2;
  }

  const started = performance.now();
  let commit = "unknown";
  let dirty = false;
  try {
    commit = git(["rev-parse", "HEAD"]);
    dirty = git(["status", "--porcelain"]) !== "";
  } catch {
    // not a git checkout: the report says "unknown"
  }
  const quick = argv.includes("--quick");
  const groups = await collect(defaultCollectors(commit), quick ? SLOW : [], (name) => process.stderr.write(`measuring: ${name}\n`));
  const cpu = cpus();
  const report: Report = { commit, dirty, date: new Date().toISOString(), node: process.version, os: `${platform()} ${release()} ${arch()}`, cpu: `${cpu[0]?.model.trim() ?? "unknown"}, ${cpu.length} threads`, groups };
  const previous = lastSaved();
  console.log(argv.includes("--json") ? JSON.stringify(report, null, 2) : renderReport(report, previous));
  if (save) {
    mkdirSync(MEASURE_DIR, { recursive: true });
    writeFileSync(join(MEASURE_DIR, `${save}.json`), `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`saved .scratch/measure/${save}.json\n`);
  }
  const seconds = Math.round((performance.now() - started) / 1000);
  process.stderr.write(`measure took ${Math.floor(seconds / 60)} min ${seconds % 60} s${quick ? " (--quick)" : ""}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
