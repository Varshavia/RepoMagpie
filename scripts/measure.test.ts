import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scratchBase } from "../src/core/fixtures/scratch.ts";
import { withRun } from "../ui/e2e/measure.ts";
import { change, collect, e2eGroup, firstBySource, format, lastSaved, parts, readSaved, renderCompare, renderReport, SLOW, stableNames, type Measure, type Report } from "./measure.ts";

// npm run measure: the parts that aren't measurements (collecting, the tables, --compare's
// arithmetic, the end-to-end file), then one run of the real script with --quick.

const ms = (value: number, budget?: number): Measure => ({ value, unit: "ms", better: "lower", ...(budget === undefined ? {} : { budget }) });
const report = (groups: Report["groups"], commit = "a".repeat(40)): Report => ({ commit, dirty: false, date: "2026-10-27T10:00:00.000Z", node: "v24.0.0", os: "test", cpu: "test, 1 threads", groups });

test("collect: a group that throws is not measured, with its reason, and the others still run; skipped groups say so", async () => {
  const groups = await collect({
    first: () => ({ numbers: { a: ms(1) } }),
    broken: () => { throw new Error("no build: run npm run build first"); },
    slow: () => ({ numbers: { b: ms(2) } }),
    last: async () => ({ numbers: { c: ms(3) } }),
  }, ["slow"]);
  assert.deepEqual(groups, {
    first: { numbers: { a: ms(1) } },
    broken: { not_measured: "no build: run npm run build first" },
    slow: { not_measured: "skipped (--quick)" },
    last: { numbers: { c: ms(3) } },
  });
  assert.deepEqual(SLOW, ["speed", "startup", "quality", "tests"]);
});

test("parts: the parts that ran give the numbers, the others are problems; none ran is not measured", () => {
  const fail = (): never => { throw new Error("exit code 1"); };
  assert.deepEqual(parts([["one.ts", () => ({ a: ms(1) })], ["two.ts", fail]]), { numbers: { a: ms(1) }, problems: ["two.ts: exit code 1"] });
  assert.deepEqual(parts([["one.ts", fail], ["two.ts", fail]]), { not_measured: "one.ts: exit code 1; two.ts: exit code 1" });
});

test("format: bytes in B, kB and MB of 1,024; times rounded; percentages, MRR, counts and approximate tokens", () => {
  assert.equal(format({ value: 418, unit: "B" }), "418 B");
  assert.equal(format({ value: 677_188, unit: "B" }), "661.3 kB");
  assert.equal(format({ value: 2_243_000, unit: "B" }), "2.14 MB");
  assert.equal(format(ms(1302.6)), "1,303 ms");
  assert.equal(format({ value: 34.7826, unit: "%" }), "34.8 %");
  assert.equal(format({ value: 0.57362, unit: "mrr" }), "0.574");
  assert.equal(format({ value: 1747, unit: "count" }), "1,747");
  assert.equal(format({ value: 3604.25, unit: "tokens" }), "~3,604");
  assert.equal(format(undefined), "-");
});

test("change: the percentage, an arrow, and better or worse by the number's direction", () => {
  assert.equal(change(ms(200), ms(150)), "-25.0% ↓ better");
  assert.equal(change(ms(100), ms(110)), "+10.0% ↑ worse");
  assert.equal(change({ value: 50, unit: "%", better: "higher" }, { value: 60, unit: "%", better: "higher" }), "+20.0% ↑ better");
  assert.equal(change({ value: 0.6, unit: "mrr", better: "higher" }, { value: 0.45, unit: "mrr", better: "higher" }), "-25.0% ↓ worse");
  assert.equal(change({ value: 1700, unit: "count" }, { value: 1747, unit: "count" }), "+2.8% ↑");
  assert.equal(change(ms(5), ms(5)), "=");
  assert.equal(change({ value: 0, unit: "count", better: "lower" }, { value: 2, unit: "count", better: "lower" }), "↑ worse");
  assert.equal(change(undefined, ms(5)), "new");
  assert.equal(change(ms(5), undefined), "gone");
});

test("the report: one table per group, each number with its budget and over-budget mark, and its change from the last saved report", () => {
  const before = report({ app: { numbers: { "total, gzipped": { value: 160 * 1024, unit: "B", better: "lower", budget: 200 * 1024 } } }, speed: { numbers: { search: ms(250, 500) } } });
  const now = report({
    app: { numbers: { "total, gzipped": { value: 150 * 1024, unit: "B", better: "lower", budget: 200 * 1024 } } },
    speed: { numbers: { search: ms(600, 500), recall: ms(90, 150) }, problems: ["bench-mcp.ts: exit code 1"] },
    tests: { not_measured: "skipped (--quick)" },
  }, "b".repeat(40));
  const text = renderReport(now, { name: "baseline", report: before });
  assert.match(text, /^commit bbbbbbb, 2026-10-27T10:00:00\.000Z, Node v24\.0\.0, test, test, 1 threads$/m);
  assert.match(text, /^change: from baseline \(commit aaaaaaa, /m);
  assert.match(text, /^ {2}total, gzipped {3}150\.0 kB {3}budget 200\.0 kB {3}-6\.3% ↓ better$/m);
  assert.match(text, /^ {2}search +600 ms {3}budget 500 ms \(over\) {3}\+140\.0% ↑ worse$/m);
  assert.match(text, /^ {2}recall +90 ms {3}budget 150 ms +new$/m);
  assert.match(text, /^ {2}not measured: bench-mcp\.ts: exit code 1$/m);
  assert.match(text, /^Tests \(npm test\)\n {2}not measured: skipped \(--quick\)$/m);
  assert.doesNotMatch(renderReport(now), /change|better|worse/, "no saved report: no change column");
});

test("--compare: two saved reports side by side, every number either has, with the change from a to b", () => {
  const a = { name: "baseline-beta14", report: report({ app: { numbers: { "first files": { value: 109 * 1024, unit: "B", better: "lower" } } }, e2e: { not_measured: "run REPOMAGPIE_MEASURE=1 npm run test:e2e first" } }) };
  const b = { name: "after", report: report({ app: { numbers: { "first files": { value: 99 * 1024, unit: "B", better: "lower" }, "lazy: settings-*.js": { value: 4096, unit: "B", better: "lower" } } }, e2e: { not_measured: "skipped" } }) };
  const text = renderCompare(a, b);
  assert.match(text, /^a: baseline-beta14, commit aaaaaaa/m);
  assert.match(text, /^b: after, commit aaaaaaa/m);
  assert.match(text, /^ +baseline-beta14 +after {3}change$/m);
  assert.match(text, /^ {2}first files +109\.0 kB {3}99\.0 kB {3}-9\.2% ↓ better$/m);
  assert.match(text, /^ {2}lazy: settings-\*\.js +- +4\.0 kB {3}new$/m);
  assert.match(text, /not measured: a: run REPOMAGPIE_MEASURE=1 npm run test:e2e first; b: skipped/);
});

test("saved reports: the most recent one is the comparison, never the end-to-end file; a missing name says how to save it", () => {
  const dir = scratchBase("measure");
  assert.equal(lastSaved(join(dir, "missing")), undefined);
  writeFileSync(join(dir, "old.json"), JSON.stringify(report({}, "1".repeat(40))));
  writeFileSync(join(dir, "new.json"), JSON.stringify(report({}, "2".repeat(40))));
  writeFileSync(join(dir, "e2e-timings.json"), JSON.stringify({ commit: "3", date: "", timings: {} }));
  utimesSync(join(dir, "old.json"), new Date(2026, 0, 1), new Date(2026, 0, 1));
  utimesSync(join(dir, "new.json"), new Date(2026, 0, 2), new Date(2026, 0, 2));
  utimesSync(join(dir, "e2e-timings.json"), new Date(2026, 0, 3), new Date(2026, 0, 3));
  assert.equal(lastSaved(dir)?.name, "new");
  assert.equal(readSaved("old.json", dir).report.commit, "1".repeat(40));
  assert.throws(() => readSaved("nope", dir), /No saved report nope in .*npm run measure -- --save nope\./);
});

test("the end-to-end timings: missing, from another commit, or this commit's with their budgets", () => {
  const dir = scratchBase("measure-e2e");
  const file = join(dir, "e2e-timings.json");
  const commit = "c".repeat(40);
  assert.deepEqual(e2eGroup(commit, file), { not_measured: "run REPOMAGPIE_MEASURE=1 npm run test:e2e first" });
  writeFileSync(file, JSON.stringify({ commit: "d".repeat(40), date: "", timings: { "graph, warm: first frame": { ms: 1303, budget: 2000 } } }));
  assert.deepEqual(e2eGroup(commit, file), { not_measured: "they are from commit ddddddd, not ccccccc: run REPOMAGPIE_MEASURE=1 npm run test:e2e first" });
  writeFileSync(file, JSON.stringify({ commit, date: "", timings: { "graph, warm: first frame": { ms: 1303, budget: 2000 }, "graph, cold: first frame": { ms: 1842, budget: null } } }));
  assert.deepEqual(e2eGroup(commit, file), { numbers: { "graph, warm: first frame": ms(1303, 2000), "graph, cold: first frame": ms(1842) } });
});

test("a timing keeps its last three runs, and its number is their median", () => {
  let t = withRun(undefined, 1500.4, 2000);
  assert.deepEqual(t, { ms: 1500, budget: 2000, runs: [1500] });
  t = withRun(t, 1300, 2000);
  assert.deepEqual(t, { ms: 1400, budget: 2000, runs: [1500, 1300] }); // two: their mean
  t = withRun(t, 1900, 2000);
  assert.deepEqual(t, { ms: 1500, budget: 2000, runs: [1500, 1300, 1900] });
  t = withRun(t, 1000, 2000);
  assert.deepEqual(t, { ms: 1300, budget: 2000, runs: [1300, 1900, 1000] }); // the oldest goes
  // A file written before runs were kept: its number counts as one run.
  assert.deepEqual(withRun({ ms: 1303, budget: 2000 }, 1403, 2000), { ms: 1353, budget: 2000, runs: [1303, 1403] });
});

test("the first script by source: its top 5 from an analyze build of the same first script; another build or none says how to make one", () => {
  const folder = join(scratchBase("measure-analyze"), "analyze");
  const how = "run npm run build:analyze after npm run build";
  assert.deepEqual(firstBySource(["index-AAAAAAAA.js"], folder), { numbers: {}, problem: `first script by source: no analyze build; ${how}` });
  mkdirSync(folder);
  writeFileSync(join(folder, "index.html"), '<script type="module" src="/assets/index-AAAAAAAA.js"></script>');
  // Six sources of 1 to 6 bytes: "abbccc…", each segment a new source.
  const sources = ["a", "b", "c", "d", "e", "f"].map((name) => `../node_modules/${name}/index.js`);
  writeFileSync(join(folder, "index-AAAAAAAA.js"), "abbcccddddeeeeeffffff");
  writeFileSync(join(folder, "index-AAAAAAAA.js.map"), JSON.stringify({ version: 3, sources, mappings: "AAAA,CCAA,ECAA,GCAA,ICAA,KCAA" }));
  const bytes = (n: number): Measure => ({ value: n, unit: "B", better: "lower" });
  assert.deepEqual(firstBySource(["index-AAAAAAAA.js", "index.html"], folder), {
    numbers: { "first script by source, raw: f": bytes(6), "first script by source, raw: e": bytes(5), "first script by source, raw: d": bytes(4), "first script by source, raw: c": bytes(3), "first script by source, raw: b": bytes(2) },
  });
  assert.deepEqual(firstBySource(["index-ZZZZZZZZ.js"], folder), { numbers: {}, problem: `first script by source: the analyze build is from another build; ${how}` });
});

test("stable names: Vite's 8-character hash becomes *, so builds compare; a name seen twice keeps its hash", () => {
  assert.deepEqual(stableNames(["mcp-DDns-Vct.js", "claude-code--Yas8BOH.js", "layout.worker-CkPgMYRe.js", "index-B5ZakpBY.css", "main.js", "index.html", "adopt-Df1UqyLV.js", "adopt-WRqkKwqH.js"]),
    ["mcp-*.js", "claude-code-*.js", "layout.worker-*.js", "index-*.css", "main.js", "index.html", "adopt-*.js", "adopt-WRqkKwqH.js"]);
});

test("measure --quick --json: one document with every group, the slow ones skipped (the real script, in a sandbox home)", () => {
  const box = scratchBase("measure-run");
  mkdirSync(join(box, "home"));
  const home = join(box, "home");
  const script = fileURLToPath(new URL("measure.ts", import.meta.url));
  const child = spawnSync(process.execPath, [script, "--quick", "--json"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, MAGPIE_HOME: join(box, "journal"), HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData") },
  });
  assert.equal(child.status, 0, child.stderr);
  const doc = JSON.parse(child.stdout) as Report;
  assert.match(doc.commit, /^([0-9a-f]{40}|unknown)$/);
  assert.equal(typeof doc.dirty, "boolean");
  assert.ok(!Number.isNaN(Date.parse(doc.date)));
  assert.equal(doc.node, process.version);
  for (const key of ["os", "cpu"] as const) assert.ok(doc[key].length > 0);
  assert.deepEqual(Object.keys(doc.groups), ["package", "cli", "app", "agent", "speed", "startup", "quality", "tests", "e2e"]);
  for (const name of SLOW) assert.deepEqual(doc.groups[name], { not_measured: "skipped (--quick)" });
  for (const [name, group] of Object.entries(doc.groups)) {
    if ("not_measured" in group) {
      assert.equal(typeof group.not_measured, "string", name);
      continue;
    }
    for (const [label, m] of Object.entries(group.numbers)) {
      assert.ok(Number.isFinite(m.value), `${name}: ${label}`);
      assert.ok(["B", "ms", "%", "mrr", "count", "tokens"].includes(m.unit), `${name}: ${label}`);
    }
  }
  // No build is needed for what an agent reads; the CI test job runs before the build.
  assert.ok("numbers" in doc.groups.agent && doc.groups.agent.numbers["SKILL.md"].value > 0);
  assert.match(child.stderr, /measure took \d+ min \d+ s \(--quick\)/);
});
