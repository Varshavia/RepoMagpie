// Codex CLI PreToolUse adapter (decision 0036; agents.md, "Codex CLI"). Codex can't ask: `ask` is
// "parsed but not supported yet", and the call goes on. So an exact avoid note denies the first
// try, with the note and what to do for the agent and a line for the user; the same install then
// goes through for 10 minutes and informs, like any other match. It never approves: no `allow`, no
// `updatedInput`. Shell commands only: Codex sends `tool_input.command` for apply_patch too.
// Returns null when there is nothing to say; the caller prints the result and always exits 0.
import { isRecord } from "../core/note-cache.ts";
import { agentContext, denyReason, parseInput, recallFor, retryAnswer, stoppedLine, userMessage, type HookContext, type Limits } from "./core.ts";

// Codex limits each model-visible hook message to "roughly 2,500 tokens" and gives the model only a
// preview of a longer one. Note text with markers can take a token for every two characters.
const LIMITS: Limits = { pack: 4_000, cap: 5_000 };

export function codexOutput(input: string, ctx: HookContext, now = Date.now()): string | null {
  const call = parseInput(input);
  if (!isRecord(call) || call.tool_name !== "Bash" || !isRecord(call.tool_input) || typeof call.tool_input.command !== "string") return null;
  if (call.hook_event_name !== undefined && call.hook_event_name !== "PreToolUse") return null;
  const r = recallFor(call.tool_input.command, typeof call.cwd === "string" && call.cwd ? call.cwd : null, ctx);
  if (!r) return null;
  if (retryAnswer(r, "codex", ctx, now) === "deny") {
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: denyReason(r, LIMITS) },
      systemMessage: stoppedLine(r),
    });
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: agentContext(r, LIMITS) }, systemMessage: userMessage(r, LIMITS) });
}
