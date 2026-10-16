// Copilot CLI preToolUse adapter (decision 0036; agents.md, "Copilot CLI"). Copilot CLI documents
// `ask`, but 1.0.98 ran the call unasked when a hook answered it, so this adapter never answers
// ask: an exact avoid note denies the first try, and the same install then goes through for 10
// minutes. Copilot CLI shows the user the deny reason ("Denied by preToolUse hook: …") and has no
// other field for the user, and no field for the agent on allow: so after the deny, and for any
// other match, it prints nothing. It never approves: no allow, no modifiedArgs. The shell tools only
// (powershell on Windows, bash elsewhere). Returns null when there is nothing to say; the caller
// prints the result and always exits 0, since any other exit denies the call.
//
// VS Code reads the same folder (~/.copilot/hooks/) but sends its own payload (snake_case
// tool_name and tool_input) and reads its own output: that input gets no answer here.
import { isRecord } from "../core/note-cache.ts";
import { parseInput, recallFor, type HookContext } from "./core.ts";
import { denyReason, retryAnswer } from "./deny.ts";

const SHELL_TOOLS = new Set(["powershell", "bash"]);
// Copilot CLI documents no limit on the reason: Claude Code's are kept.
const LIMITS = { pack: 8_000, cap: 10_000 };

export function copilotOutput(input: string, ctx: HookContext, now = Date.now()): string | null {
  const call = parseInput(input);
  if (!isRecord(call) || typeof call.toolName !== "string" || !SHELL_TOOLS.has(call.toolName) || "hook_event_name" in call) return null;
  const args = typeof call.toolArgs === "string" ? parseInput(call.toolArgs) : call.toolArgs; // typed `unknown`: an object, or JSON in a string
  if (!isRecord(args) || typeof args.command !== "string") return null;
  const r = recallFor(args.command, typeof call.cwd === "string" && call.cwd ? call.cwd : null, ctx);
  if (!r || retryAnswer(r, "copilot", ctx, now) !== "deny") return null;
  return JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: denyReason(r, LIMITS) });
}
