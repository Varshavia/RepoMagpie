// Claude Code's opt-in Stop reminder (decision 0042, `repomagpie hook claude-code-stop`). When the
// agent stops, it reads the session's transcript: if the session installed or removed packages that
// have no note in the user's journals, and the agent hasn't offered one since, it reminds the agent
// once per session to make the skill's "After a dependency decision" offer. The answer is
// additionalContext, which continues the turn as hook feedback, not as a hook error. Never when
// stop_hook_active is set. It fails open: anything it can't read means no answer. It reads only the
// transcript Claude Code names, and never the network; it prints package names parsed from the
// commands, never transcript text. Returns null when there is nothing to say.
import { createHash } from "node:crypto";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { detectCommand, type Install } from "../core/install-detect.ts";
import { resolvePersonalJournal } from "../core/journals.ts";
import { isRecord } from "../core/note-cache.ts";
import { openRecallSources, recall } from "../core/recall.ts";
import { CAPS, clean, cut } from "../core/text.ts";
import { CURSOR_FIELDS } from "./claude-code.ts";
import { parseInput, shortList, usable, type HookContext } from "./core.ts";
import { onceWithin } from "./retry.ts";

// The last 32 MB of a longer transcript are read; installs before them are missed.
const MAX_BYTES = 32 * 1024 * 1024;
const LOOKUPS = 100; // as the PreToolUse hook: the packages looked up
const SESSION_WINDOW = 30 * 24 * 60 * 60_000; // a session is reminded once; its record is kept 30 days
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
const NOTE_COMMAND = /\brepomagpie(?:\.cmd)?\s+note\b/i;

export const reminderFile = (journal: string) => join(journal, ".cache", "stop-reminder.json");

type Event = { offer: true } | { offer: false; id: string | null; installs: Install[]; removals: Install[] };

export function stopOutput(input: string, ctx: HookContext): string | null {
  const stop = parseInput(input);
  if (!isRecord(stop) || CURSOR_FIELDS.some((field) => Object.hasOwn(stop, field))) return null;
  if (stop.stop_hook_active === true || (stop.hook_event_name !== undefined && stop.hook_event_name !== "Stop")) return null;
  const { session_id: session, transcript_path: path } = stop;
  if (typeof session !== "string" || !session || typeof path !== "string") return null;
  const text = readTranscript(path.startsWith("~/") || path.startsWith("~\\") ? join(ctx.home, path.slice(2)) : path);
  if (text === null) return null;

  // The changes since the agent last offered (or mentioned RepoMagpie): those that didn't fail.
  const { events, failed } = scan(text);
  if (typeof stop.last_assistant_message === "string" && /repomagpie/i.test(stop.last_assistant_message)) return null;
  const last = events.findLastIndex((e) => e.offer);
  const changes = events.slice(last + 1).filter((e): e is Extract<Event, { offer: false }> => !e.offer && !(e.id !== null && failed.has(e.id)));
  const seen = new Map<string, { install: Install; removed: boolean }>();
  for (const change of changes) {
    for (const install of change.installs) if (!seen.has(`${install.type}:${install.name}`)) seen.set(`${install.type}:${install.name}`, { install, removed: false });
    for (const removal of change.removals) if (!seen.has(`${removal.type}:${removal.name}`)) seen.set(`${removal.type}:${removal.name}`, { install: removal, removed: true });
  }
  if (!seen.size) return null;

  const cwd = typeof stop.cwd === "string" && usable(stop.cwd, ctx.cwd) ? stop.cwd : ctx.cwd;
  const { sources } = openRecallSources({ home: ctx.home, env: ctx.env, cwd, homeFlag: ctx.homeFlag, projectFlag: ctx.projectFlag });
  const unnoted = [...seen.values()].slice(0, LOOKUPS).filter(({ install }) => !recall(sources, install.name, [install.type]).length);
  if (!unnoted.length) return null;

  // Once per session, recorded by a hash of its id. No record, no reminder: never one per stop.
  const journal = resolvePersonalJournal({ home: ctx.home, env: ctx.env, cwd: ctx.cwd, flag: ctx.homeFlag }).path;
  const key = createHash("sha256").update(`claude-code-stop\0${session}`).digest("hex");
  if (onceWithin(journal, reminderFile(journal), key, SESSION_WINDOW) !== "first") return null;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: reminder(unnoted) } });
}

function reminder(unnoted: { install: Install; removed: boolean }[]): string {
  const names = shortList(unnoted.map(({ install }) => cut(clean(install.name), CAPS.name)));
  const verb = unnoted.every((u) => u.removed) ? "removed" : unnoted.some((u) => u.removed) ? "installed or removed" : "installed";
  return `RepoMagpie: this session ${verb} ${names}, with no note in the user's journals. ` +
    "If the user chose, replaced or dropped one of them for a reason in this task, make the RepoMagpie skill's \"After a dependency decision\" offer now: once, in the user's language, and never write the Verdict yourself. " +
    "If it was routine, or the user already answered or asked not to be asked, or no user is there to answer, say nothing about it. RepoMagpie reminds you once per session.";
}

// The transcript's text, or null: an absolute path to a .jsonl file, at most its last MAX_BYTES (from
// the first whole line).
function readTranscript(path: string): string | null {
  if (!isAbsolute(path) || !path.toLowerCase().endsWith(".jsonl") || path.includes("\0")) return null;
  let fd: number | undefined;
  try {
    const stats = statSync(path);
    if (!stats.isFile()) return null;
    const length = Math.min(stats.size, MAX_BYTES);
    const buffer = Buffer.alloc(length);
    fd = openSync(path, "r");
    const read = readSync(fd, buffer, 0, length, stats.size - length);
    const text = buffer.subarray(0, read).toString("utf8");
    return length < stats.size ? text.slice(text.indexOf("\n") + 1) : text;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// The transcript's shell commands that install or remove packages, and the agent's offers, in order;
// and the ids of tool calls whose result was an error. A line that isn't JSON is skipped. Only lines
// that can matter are parsed: the agent's, and tool results that failed.
function scan(text: string): { events: Event[]; failed: Set<string> } {
  const events: Event[] = [];
  const failed = new Set<string>();
  for (const line of text.split("\n")) {
    const assistant = line.includes('"assistant"');
    if (!assistant && !/"is_error":\s*true/.test(line)) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = isRecord(entry) && isRecord(entry.message) ? entry.message : null;
    if (!message || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (!isRecord(block)) continue;
      if (block.type === "tool_result" && block.is_error === true && typeof block.tool_use_id === "string") failed.add(block.tool_use_id);
      if (!assistant || (isRecord(entry) && entry.type !== "assistant")) continue;
      if (block.type === "text" && typeof block.text === "string" && /repomagpie/i.test(block.text)) events.push({ offer: true });
      if (block.type !== "tool_use" || typeof block.name !== "string") continue;
      // The MCP note tool, whatever the server's name in the agent's settings.
      if (/__note$/.test(block.name) && /repomagpie/i.test(block.name)) {
        events.push({ offer: true });
        continue;
      }
      const command = isRecord(block.input) ? block.input.command : undefined;
      if (!SHELL_TOOLS.has(block.name) || typeof command !== "string") continue;
      if (NOTE_COMMAND.test(command)) {
        events.push({ offer: true });
        continue;
      }
      const installs = detectCommand(command).installs;
      const removals = detectCommand(command, "remove").installs;
      if (installs.length || removals.length) events.push({ offer: false, id: typeof block.id === "string" ? block.id : null, installs, removals });
    }
  }
  return { events, failed };
}
