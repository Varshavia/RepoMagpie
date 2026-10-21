// Claude Code PreToolUse adapter (spec §6, decisions 0024, 0032 and 0036): the tool call's JSON in,
// the hook's JSON out. An exact avoid note asks the user; any other match informs; it never denies.
// The texts come from the core. Returns null when there is nothing to say. The caller prints the
// result and always exits 0 (fails open).
import { isRecord } from "../core/note-cache.ts";
import { agentContext, askReason, parseInput, recallFor, userMessage, type HookContext } from "./core.ts";

export type { HookContext } from "./core.ts";

const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
// Cursor runs Claude Code's hooks too, and its input carries fields Claude Code's never has. The
// Cursor adapter answers there, so this one stays silent (decision 0036, "One answer per agent").
const CURSOR_FIELDS = ["cursor_version", "conversation_id", "generation_id", "workspace_roots"];

export function hookOutput(input: string, ctx: HookContext): string | null {
  const call = parseInput(input);
  if (!isRecord(call) || CURSOR_FIELDS.some((field) => Object.hasOwn(call, field))) return null;
  const command = isRecord(call.tool_input) ? call.tool_input.command : undefined;
  if (typeof command !== "string" || (typeof call.tool_name === "string" && !SHELL_TOOLS.has(call.tool_name))) return null;
  const r = recallFor(command, typeof call.cwd === "string" ? call.cwd : null, ctx);
  if (!r) return null;
  if (r.avoid.length) {
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: askReason(r), additionalContext: agentContext(r) },
    });
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: agentContext(r) }, systemMessage: userMessage(r) });
}
