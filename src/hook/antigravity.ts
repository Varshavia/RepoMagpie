// Antigravity CLI PreToolUse adapter (decision 0036; agents.md, "Antigravity CLI"). Antigravity
// asks: `force_ask` "Always prompts you for approval, ignoring cached permissions", and the
// pre-check (1.3.5) showed the reason in its "Run this command?" prompt, also after "always allow
// in this conversation". So an exact avoid note answers force_ask with the note as the reason. Any
// other match prints nothing: an `allow` with a reason reached neither the agent nor the user, and
// no output left Antigravity's own prompt as it was. It never approves: no `allow`, no
// `auto_approve`. run_command only. Returns null when there is nothing to say; the caller prints
// the result and always exits 0.
import { isRecord } from "../core/note-cache.ts";
import { askReason, parseInput, recallFor, type HookContext } from "./core.ts";

export function antigravityOutput(input: string, ctx: HookContext): string | null {
  const call = parseInput(input);
  if (!isRecord(call) || !isRecord(call.toolCall) || call.toolCall.name !== "run_command" || !isRecord(call.toolCall.args)) return null;
  const { CommandLine: command, Cwd: cwd } = call.toolCall.args;
  if (typeof command !== "string") return null;
  const r = recallFor(command, folder(cwd, call.workspacePaths), ctx);
  // Antigravity documents no limit on reason: Claude Code's are kept.
  return r?.avoid.length ? JSON.stringify({ decision: "force_ask", reason: askReason(r) }) : null;
}

// The command's folder: its Cwd, else the first workspace folder; the process's is ~/.gemini/config
// (Antigravity CLI starts the hook there), so with neither only the personal journal is found.
function folder(cwd: unknown, workspaces: unknown): string | null {
  if (typeof cwd === "string" && cwd) return cwd;
  const first = Array.isArray(workspaces) ? workspaces[0] : undefined;
  return typeof first === "string" && first ? first : null;
}
