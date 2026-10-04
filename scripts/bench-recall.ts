// Benchmark for `magpie recall` and the Claude Code hook (spec §7: under 150 ms median, 2,000 notes,
// warm cache): the built CLI run 20 times as separate processes after a warm-up run that builds
// the cache. Exits 1 over the budget, unless --report-only. Run with `npm run bench`.
// The hook gets its journal from MAGPIE_HOME, as in a real setup, so it takes its fast path.
import { measure, withJournal } from "./bench-journal.ts";

const BUDGET_MS = 150;
const call = (command: string) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });

withJournal("recall", (root, journal) => {
  const env = { MAGPIE_HOME: journal };
  measure("magpie recall package-1500", root, ["recall", "package-1500"], BUDGET_MS, undefined, env);
  measure("magpie hook claude-code (an install with a note)", root, ["hook", "claude-code"], BUDGET_MS, call("npm install package-1500@2 && npm i left-pad"), env);
  measure("magpie hook claude-code (no install)", root, ["hook", "claude-code"], BUDGET_MS, call("npm test"), env);
});
