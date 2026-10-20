// Cursor beforeShellExecution adapter (decision 0036; agents.md, "Cursor"). Cursor's `ask` isn't
// reliable (the forum; its default Run Mode, Auto-Review, ran npm install unasked), so an exact
// avoid note denies the first try, with the note for the agent and a line for the user; the same
// install then goes through for 10 minutes. Any other match prints nothing: messages without a
// permission reached neither the agent nor the user in the pre-check, and no output left Cursor's
// own prompt as it was. It never approves: no `allow`, and never `{}`, which a forum report says
// counts as allow. Output that doesn't match Cursor's schema blocks the command, so a deny has
// exactly the documented fields. Returns null when there is nothing to say; the caller prints the
// result and always exits 0.
import { isRecord } from "../core/note-cache.ts";
import { parseInput, recallFor, type HookContext } from "./core.ts";
import { denyReason, retryAnswer, stoppedLine } from "./deny.ts";

// Cursor documents no limit on the messages: Claude Code's are kept.
const LIMITS = { pack: 8_000, cap: 10_000 };

export function cursorOutput(input: string, ctx: HookContext, now = Date.now()): string | null {
  const call = parseInput(input); // Cursor's stdin starts with a byte-order mark on Windows
  if (!isRecord(call) || typeof call.command !== "string") return null;
  if (call.hook_event_name !== undefined && call.hook_event_name !== "beforeShellExecution") return null;
  const r = recallFor(call.command, folder(call.cwd, call.workspace_roots), ctx);
  if (!r || retryAnswer(r, "cursor", ctx, now) !== "deny") return null;
  return JSON.stringify({ permission: "deny", user_message: stoppedLine(r), agent_message: denyReason(r, LIMITS) });
}

// The command's folder: its cwd (empty on some first commands), else the first workspace root,
// which Cursor writes as /C:/… on Windows. The process's is ~/.cursor, which holds no project.
function folder(cwd: unknown, roots: unknown): string | null {
  if (typeof cwd === "string" && cwd) return cwd;
  const first = Array.isArray(roots) ? roots[0] : undefined;
  if (typeof first !== "string" || !first) return null;
  return /^\/[A-Za-z]:[\\/]/.test(first) ? first.slice(1) : first;
}
