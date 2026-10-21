// Gemini CLI BeforeTool adapter (decision 0036; agents.md, "Gemini CLI"). Gemini CLI asks: a hook's
// `decision: "ask"` forces the user's confirmation and shows the hook's `systemMessage` in it (its
// source since #21146; its docs list only allow and deny). So an exact avoid note asks, with the
// note in systemMessage. Any other match only shows the user a line: no BeforeTool field reaches
// the agent. It never approves: no `allow`, no `hookSpecificOutput.tool_input`. The shell tool
// only (run_shell_command). Returns null when there is nothing to say; the caller prints the result
// and always exits 0 (Gemini CLI blocks the call on any other exit but 1).
import { resolve } from "node:path";
import { isRecord } from "../core/note-cache.ts";
import { askReason, parseInput, recallFor, userMessage, type HookContext } from "./core.ts";
import { denyReason, passed, retryAnswer, stoppedLine } from "./deny.ts";

// What an exact avoid note does. If the live test shows Gemini CLI running the command without a
// prompt, change this one line to "deny": the first try is then denied and the same install goes
// through for 10 minutes, as for Codex.
const ON_AVOID: "ask" | "deny" = "ask";

// Gemini CLI documents no limit on these fields: Claude Code's are kept (decision 0036).
const LIMITS = { pack: 8_000, cap: 10_000 };

export function geminiOutput(input: string, ctx: HookContext, now = Date.now(), onAvoid = ON_AVOID): string | null {
  const call = parseInput(input);
  if (!isRecord(call) || call.tool_name !== "run_shell_command" || !isRecord(call.tool_input) || typeof call.tool_input.command !== "string") return null;
  if (call.hook_event_name !== undefined && call.hook_event_name !== "BeforeTool") return null;
  const r = recallFor(call.tool_input.command, folder(call.cwd, call.tool_input.dir_path), ctx);
  if (!r) return null;
  if (r.avoid.length && onAvoid === "ask") return JSON.stringify({ decision: "ask", systemMessage: askReason(r, LIMITS) });
  const answer = r.avoid.length ? retryAnswer(r, "gemini-cli", ctx, now) : "inform";
  if (answer === "deny") return JSON.stringify({ decision: "deny", reason: denyReason(r, LIMITS), systemMessage: stoppedLine(r) });
  return JSON.stringify({ systemMessage: answer === "pass" ? passed(r, LIMITS).message : userMessage(r, LIMITS) });
}

// The shell command's folder: dir_path, resolved against Gemini CLI's working folder (the input's
// cwd), as its shell tool does; the working folder without one.
function folder(cwd: unknown, dirPath: unknown): string | null {
  if (typeof cwd !== "string" || !cwd) return null;
  return typeof dirPath === "string" && dirPath ? resolve(cwd, dirPath) : cwd;
}
