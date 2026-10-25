// Benchmark for `magpie recall` and the Claude Code hook (spec §7: under 150 ms median, 2,000 notes,
// warm cache): the built CLI run 20 times as separate processes after a warm-up run that builds
// the cache. Exits 1 over the budget, unless --report-only. Run with `npm run bench`.
// The hook gets its journal from MAGPIE_HOME, as in a real setup, so it takes its fast path.
// It runs twice: on the plain journal, then on one where one note in five has alternatives
// (decision 0029), package-1500 among them.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bash, prompt, result, say } from "../src/hook/fixtures/stop-transcripts.ts";
import { measure, withJournal } from "./bench-journal.ts";

const BUDGET_MS = 150;
const call = (command: string) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });

for (const alternatives of [false, true]) {
  const label = alternatives ? ", 20 % with alternatives" : "";
  withJournal("recall", (root, journal) => {
    const env = { MAGPIE_HOME: journal };
    measure(`magpie recall package-1500${label}`, root, ["recall", "package-1500"], BUDGET_MS, undefined, env);
    measure(`magpie hook claude-code (an install with a note)${label}`, root, ["hook", "claude-code"], BUDGET_MS, call("npm install package-1500@2 && npm i left-pad"), env);
    measure(`magpie hook claude-code (no install)${label}`, root, ["hook", "claude-code"], BUDGET_MS, call("npm test"), env);
    // Codex's input has the same shape (decision 0036); an avoid note reads the retry record too.
    measure(`magpie hook codex (an install with a note)${label}`, root, ["hook", "codex"], BUDGET_MS, call("npm install package-1500@2 && npm i left-pad"), env);
    measure(`magpie hook codex (no install)${label}`, root, ["hook", "codex"], BUDGET_MS, call("npm test"), env);
    const gemini = (command: string) => JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command } });
    measure(`magpie hook gemini-cli (an install with a note)${label}`, root, ["hook", "gemini-cli"], BUDGET_MS, gemini("npm install package-1500@2 && npm i left-pad"), env);
    const antigravity = (command: string) => JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: command, Cwd: root } } });
    measure(`magpie hook antigravity (an install with a note)${label}`, root, ["hook", "antigravity"], BUDGET_MS, antigravity("npm install package-1500@2 && npm i left-pad"), env);
    const copilot = (command: string) => JSON.stringify({ cwd: root, toolName: "powershell", toolArgs: { command } });
    measure(`magpie hook copilot (an install with a note)${label}`, root, ["hook", "copilot"], BUDGET_MS, copilot("npm install package-1500@2 && npm i left-pad"), env);
    const cursor = (command: string) => JSON.stringify({ hook_event_name: "beforeShellExecution", command, cwd: root });
    measure(`magpie hook cursor (an install with a note)${label}`, root, ["hook", "cursor"], BUDGET_MS, cursor("npm install package-1500@2 && npm i left-pad"), env);
  }, true, false, alternatives);
}

// The Stop reminder (decision 0042): a 2,000-line transcript, one package with a note and one
// without. The first run records the session; the timed runs do the same reading and recall, then
// find the session already reminded.
withJournal("stop", (root, journal) => {
  const lines: string[] = [];
  for (let i = 0; lines.length < 2_000; i++) {
    const command = i === 400 ? "npm install package-1500@2 fresh-lib" : i % 7 === 0 ? "npm test" : `git diff src/file-${i}.ts`;
    lines.push(prompt(`step ${i}: ${"change the helpers and run the checks ".repeat(4)}`), say(`Working on step ${i}. ${"I read the file and make the change. ".repeat(8)}`),
      bash(`toolu_${i}`, command), result(`toolu_${i}`, `output of step ${i}\n${"ok ".repeat(200)}`));
  }
  const transcript = join(root, "transcript.jsonl");
  writeFileSync(transcript, `${lines.join("\n")}\n`);
  const input = JSON.stringify({ session_id: "bench", transcript_path: transcript, cwd: root, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Done." });
  measure("magpie hook claude-code-stop (a 2,000-line transcript)", root, ["hook", "claude-code-stop"], BUDGET_MS, input, { MAGPIE_HOME: journal });
});
