// Benchmark for `repomagpie mcp` (decision 0034): the built CLI as a stdio MCP server on 2,000
// generated notes. Cold start: from the process's start to the first tool answer (a 2025-11-25
// handshake, then recall), median of 5 starts after one that builds the caches. Then each tool
// called 20 times in one server; per-call medians against the CLI's budgets (spec §7), which hold
// with room to spare, since a call pays no process start. Exits 1 over a budget, unless --report-only.
import { spawn } from "node:child_process";
import { cli, NOTES, reportOnly, RUNS, withJournal } from "./bench-journal.ts";

type Answer = { id: number; result?: unknown; error?: unknown };

// One server process; `send` resolves with the answer to one request.
function server(root: string, journal: string) {
  const child = spawn(process.execPath, [cli, "mcp", "--home", journal], { cwd: root, stdio: ["pipe", "pipe", "ignore"] });
  const waiting = new Map<number, (answer: Answer) => void>();
  let buffer = "";
  let next = 1;
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const answer = JSON.parse(buffer.slice(0, end)) as Answer;
      buffer = buffer.slice(end + 1);
      waiting.get(answer.id)?.(answer);
    }
  });
  const send = (method: string, params: object) => new Promise<Answer>((resolve) => {
    const id = next++;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  const open = async () => {
    await send("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "bench", version: "1" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  };
  const call = async (name: string, args: object) => {
    const answer = await send("tools/call", { name, arguments: args });
    if (answer.error || (answer.result as { isError?: boolean }).isError) throw new Error(`${name} failed: ${JSON.stringify(answer).slice(0, 300)}`);
  };
  const stop = () => new Promise<void>((resolve) => { child.on("close", () => resolve()); child.stdin.end(); });
  return { open, call, stop };
}

const median = (times: number[]) => {
  const sorted = [...times].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
};

const CALLS: [string, object, number][] = [
  ["recall", { packages: ["package-1500"] }, 150],
  ["search", { query: "pdf stream" }, 500],
  ["suggest", { need: "a TypeScript CLI with tests" }, 500],
  ["catalog", { limit: 1000 }, 500],
];

await withJournal("mcp", async (root, journal) => {
  const starts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const started = performance.now();
    const s = server(root, journal);
    await s.open();
    await s.call("recall", { packages: ["package-1500"] });
    starts.push(performance.now() - started);
    await s.stop();
  }
  console.log(`repomagpie mcp on ${NOTES} notes (Node ${process.version}, ${process.platform})`);
  console.log(`  cold start to the first answer: first ${starts[0].toFixed(0)} ms (builds the caches), then median ${median(starts.slice(1)).toFixed(0)} ms of 5`);

  const s = server(root, journal);
  await s.open();
  for (const [name, args, budget] of CALLS) {
    await s.call(name, args);
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const started = performance.now();
      await s.call(name, args);
      times.push(performance.now() - started);
    }
    const m = median(times);
    console.log(`  ${name}: median ${m.toFixed(0)} ms per call, ${RUNS} calls   budget: under ${budget} ms (the CLI's)`);
    if (m >= budget) {
      console.log(reportOnly ? "  over budget (report only)" : "  over budget");
      if (!reportOnly) process.exitCode = 1;
    }
  }
  await s.stop();
});
