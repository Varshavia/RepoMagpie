// repomagpie setup's hook entries for Codex CLI, Cursor, Gemini CLI, Antigravity CLI and Copilot
// CLI (decision 0036, "What setup writes"; each agent's file and format in docs/agents.md). Each
// entry is ours only, with a 10-second timeout, and starts node directly only when it and the entry
// file exist (hook-launch.ts). Always in the user's settings: an entry names this machine's paths.
// Edited as the Claude Code hook is (setup-hook.ts): a backup first, plain JSON only, our entries
// only, read back after; older entries of ours become the current one, their flags kept. Codex's
// entry is appended last and nothing is reordered: Codex keeps its trust by position. Never turns
// an agent's hooks on, never writes a trust. Doctor reads the entries back with findAgentHooks.
// Never prints.
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { copilotHome, readJsonc, type Agent, type Platform, type Where } from "./agents.ts";
import { codexHooksOff } from "./codex-hooks.ts";
import { backupName, pathProblem, readConfig, writeAtomically } from "./config-write.ts";
import { hookLaunch, hookShell, parseHookCommand, type HookSub, type ParsedHook } from "./hook-launch.ts";
import { appendItem, removeAt, replaceAt, setMember, setTop } from "./json-edit.ts";
import type { HookPlan } from "./setup-hook.ts";

type Json = Record<string, unknown>;
type Path = (string | number)[];

// The node and entry file the entry starts (the MCP entry's), or why none can be written.
export type AgentHookTarget = { node: string; entry: string } | { error: string };

export interface HookSpec {
  id: Agent["id"];
  sub: HookSub;
  file: (w: Where) => string;
  // groups: [{ matcher, hooks: [handler] }] at `container`; list: handlers at `container`; named:
  // Antigravity's top-level hook names, each with groups under PreToolUse, ours named repomagpie;
  // file: a file of our own, with handlers at `container`.
  layout: "groups" | "list" | "named" | "file";
  container: [string, string];
  matcher?: string;
  handler: (command: string, platform: Platform) => Json; // the fields that are ours
  commandOf: (handler: Json, platform: Platform) => unknown; // the command the agent runs
  drop?: string[]; // keys of an older entry that would override ours
  root?: Json; // the rest of a new file
  off?: (w: Where) => string | null; // why the agent's hooks are turned off, which setup leaves as it is
}

const codexHome = (w: Where) => w.env.CODEX_HOME ?? join(w.home, ".codex");
export const NAMED = "repomagpie"; // Antigravity's hook name, and Gemini CLI's

export const HOOK_SPECS: HookSpec[] = [
  {
    id: "codex", sub: "codex", file: (w) => join(codexHome(w), "hooks.json"), layout: "groups", container: ["hooks", "PreToolUse"], matcher: "Bash",
    handler: (command) => ({ type: "command", command, timeout: 10 }),
    commandOf: (h, p) => (p === "win32" ? h.commandWindows ?? h.command_windows ?? h.command : h.command),
    drop: ["commandWindows", "command_windows"],
    off: (w) => {
      const file = join(codexHome(w), "config.toml");
      const read = readConfig(file);
      return "text" in read && read.text !== null && codexHooksOff(read.text) ? `Codex's hooks are turned off ([features] hooks = false in ${file}); setup doesn't turn them on` : null;
    },
  },
  {
    id: "cursor", sub: "cursor", file: (w) => join(w.home, ".cursor", "hooks.json"), layout: "list", container: ["hooks", "beforeShellExecution"],
    handler: (command) => ({ command, timeout: 10 }), commandOf: (h) => h.command, root: { version: 1 },
  },
  {
    id: "gemini", sub: "gemini-cli", file: (w) => join(w.home, ".gemini", "settings.json"), layout: "groups", container: ["hooks", "BeforeTool"], matcher: "run_shell_command",
    handler: (command) => ({ type: "command", name: NAMED, command, timeout: 10_000 }), commandOf: (h) => h.command,
    off: (w) => {
      const file = join(w.home, ".gemini", "settings.json");
      const read = readConfig(file);
      const parsed = "text" in read && read.text !== null ? readJsonc(read.text) : null;
      const config = parsed && "value" in parsed ? (parsed.value as { hooksConfig?: { enabled?: unknown } } | null)?.hooksConfig : undefined;
      return config?.enabled === false ? `Gemini CLI's hooks are turned off (hooksConfig.enabled is false in ${file}); setup doesn't turn them on` : null;
    },
  },
  {
    id: "antigravity", sub: "antigravity", file: (w) => join(w.home, ".gemini", "config", "hooks.json"), layout: "named", container: [NAMED, "PreToolUse"], matcher: "run_command",
    handler: (command) => ({ type: "command", command, timeout: 10 }), commandOf: (h) => h.command,
  },
  {
    id: "copilot", sub: "copilot", file: (w) => join(copilotHome(w), "hooks", `${NAMED}.json`), layout: "file", container: ["hooks", "preToolUse"],
    handler: (command, p) => ({ type: "command", [p === "win32" ? "powershell" : "bash"]: command, timeoutSec: 10 }),
    commandOf: (h, p) => (p === "win32" ? h.powershell ?? h.command : h.bash ?? h.command), root: { version: 1 },
  },
];

export interface FoundAgentHook {
  path: Path; // to the handler
  removal: Path; // what --remove takes out: the handler, or its group when it is alone there
  group: number; // the group's index (Codex's trust key); the handler's index in a list
  handler: number;
  matcher: string | null;
  value: Json;
  parsed: ParsedHook;
}

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

// Every handler in a parsed file that runs `hook <sub>`, or what is wrong with the file's types.
export function findAgentHooks(spec: HookSpec, root: unknown, platform: Platform): FoundAgentHook[] | string {
  if (!isObject(root)) return "the file's root isn't an object";
  const shell = hookShell(spec.sub, platform);
  const found: FoundAgentHook[] = [];
  const read = (value: Json, path: Path, removal: Path, group: number, handler: number, matcher: string | null) => {
    const command = spec.commandOf(value, platform);
    const parsed = typeof command === "string" ? parseHookCommand(command, spec.sub, shell) : null;
    if (parsed) found.push({ path, removal, group, handler, matcher, value, parsed });
  };
  const groups = (list: unknown, at: Path, whole: Path | null): string | null => {
    if (list === undefined) return null;
    if (!Array.isArray(list)) return `${at.join(".")} isn't a list`;
    for (const [g, group] of list.entries()) {
      const hooks = isObject(group) ? group.hooks : undefined;
      if (!Array.isArray(hooks)) continue;
      const matcher = isObject(group) && typeof group.matcher === "string" ? group.matcher : null;
      for (const [h, value] of hooks.entries()) {
        if (!isObject(value)) continue;
        const alone = hooks.length === 1;
        read(value, [...at, g, "hooks", h], alone ? (whole && list.length === 1 ? whole : [...at, g]) : [...at, g, "hooks", h], g, h, matcher);
      }
    }
    return null;
  };
  if (spec.layout === "named") {
    for (const [name, hook] of Object.entries(root)) {
      if (!isObject(hook)) continue;
      // Our own named hook goes whole when it holds nothing else.
      const whole = name === NAMED && Object.keys(hook).every((key) => key === "PreToolUse") ? [name] : null;
      const problem = groups(hook.PreToolUse, [name, "PreToolUse"], whole);
      if (problem && name === NAMED) return problem;
    }
    return found;
  }
  const [outer, inner] = spec.container;
  const hooks = root[outer];
  if (hooks === undefined) return found;
  if (!isObject(hooks)) return `${outer} isn't an object`;
  if (spec.layout === "groups") return groups(hooks[inner], [outer, inner], null) ?? found;
  const list = hooks[inner];
  if (list === undefined) return found;
  if (!Array.isArray(list)) return `${outer}.${inner} isn't a list`;
  for (const [i, value] of list.entries()) if (isObject(value)) read(value, [outer, inner, i], [outer, inner, i], i, 0, null);
  return found;
}

export type AgentHookPlan = HookPlan & { id: Agent["id"]; sub: HookSub };

const COMMENTS = "the file has comments or trailing commas, which setup doesn't edit";

// The handler setup wants, keeping an older entry's flags.
function wanted(spec: HookSpec, target: { node: string; entry: string }, flags: string[], platform: Platform): { handler: Json } | { error: string } {
  const command = hookLaunch(hookShell(spec.sub, platform), target.node, target.entry, spec.sub, flags);
  return typeof command === "string" ? { handler: spec.handler(command, platform) } : command;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const owned = (spec: HookSpec, value: Json, want: Json) => Object.entries(want).every(([k, v]) => same(value[k], v)) && !(spec.drop ?? []).some((k) => k in value);
const group = (spec: HookSpec, handler: Json) => ({ matcher: spec.matcher, hooks: [handler] });
// What a new file, or the user by hand, puts in for the entry.
const minimal = (spec: HookSpec, handler: Json): Json =>
  spec.layout === "named" ? { [NAMED]: { PreToolUse: [group(spec, handler)] } }
    : { ...spec.root, [spec.container[0]]: { [spec.container[1]]: [spec.layout === "groups" ? group(spec, handler) : handler] } };

export function planAgentHook(spec: HookSpec, where: Where, remove: boolean, stamp: string, target: AgentHookTarget): AgentHookPlan {
  const file = spec.file(where);
  const base: AgentHookPlan = { id: spec.id, sub: spec.sub, file, action: "keep", reason: null, backup: null, snippet: null };
  const unsafe = pathProblem(file, where.home);
  if (unsafe) return { ...base, action: "refused", reason: unsafe };
  const config = readConfig(file);
  if ("error" in config) return { ...base, action: "refused", reason: config.error };
  const text = config.text;
  const read = text === null ? { value: {}, plain: true } : readJsonc(text);
  if ("error" in read) return { ...base, action: "refused", reason: `${file} can't be read: ${read.error}` };
  const found = findAgentHooks(spec, read.value, where.platform);
  if (typeof found === "string") return { ...base, action: "refused", reason: `${found}, so setup leaves ${file} alone` };
  const mine = found.filter((f) => f.parsed.form !== "other");
  const backup = text === null ? null : backupName(file, stamp);
  // Our own file, or our own hook name, holding something that isn't ours.
  const taken = spec.layout === "file" ? text !== null && !mine.length : spec.layout === "named" && isObject(read.value) && read.value[NAMED] !== undefined && !mine.some((f) => f.path[0] === NAMED);
  if (remove) {
    if (!mine.length) return base;
    return read.plain ? { ...base, action: "remove", backup } : { ...base, action: "manual", reason: COMMENTS, snippet: `Delete the hook entries that run hook ${spec.sub} in ${file}.` };
  }
  if ("error" in target) return { ...base, action: "refused", reason: target.error };
  const off = spec.off?.(where);
  if (off) return { ...base, action: "refused", reason: off };
  const wish = wanted(spec, target, mine[0]?.parsed.flags ?? [], where.platform);
  if ("error" in wish) return { ...base, action: "refused", reason: `${wish.error}, so setup can't write this entry` };
  const want = wish.handler;
  const fileDone = spec.layout !== "file" || same(read.value, minimal(spec, want));
  if (mine.length === 1 && owned(spec, mine[0].value, want) && fileDone) return base;
  if (taken) return { ...base, action: "refused", reason: spec.layout === "file" ? `${file} holds something else; setup leaves it` : `a hook named ${NAMED} that runs something else is in ${file}; setup leaves it` };
  if (!mine.length && found.length) return { ...base, reason: "a hook entry already runs RepoMagpie another way; setup keeps it" };
  if (!read.plain) return { ...base, action: "manual", reason: COMMENTS, snippet: JSON.stringify(minimal(spec, want), null, 2) };
  return { ...base, action: mine.length ? "migrate" : "add", backup };
}

export function applyAgentHook(plan: AgentHookPlan, spec: HookSpec, where: Where, stamp: string, target: AgentHookTarget): AgentHookPlan {
  if (!["add", "migrate", "remove"].includes(plan.action)) return plan;
  const fail = (error: string): AgentHookPlan => ({ ...plan, result: "failed", error });
  if ("error" in target && plan.action !== "remove") return fail(target.error);
  const unsafe = pathProblem(plan.file, where.home);
  if (unsafe) return fail(unsafe);
  const platform = where.platform;
  let backup = plan.backup;
  try {
    // The MCP entry may have backed up the same file in this run (Gemini CLI's settings.json).
    if (backup && existsSync(backup)) backup = backupName(plan.file, stamp);
    if (backup && existsSync(plan.file)) copyFileSync(plan.file, backup, 1 /* COPYFILE_EXCL */);
    const config = readConfig(plan.file);
    if ("error" in config) return fail(config.error);
    let text = config.text;
    const flags = () => (findAgentHooks(spec, JSON.parse(text ?? "{}"), platform) as FoundAgentHook[]).find((f) => f.parsed.form !== "other")?.parsed.flags ?? [];
    const wish = "error" in target ? null : wanted(spec, target, flags(), platform);
    if (wish && "error" in wish) return fail(wish.error);
    const want = wish?.handler;
    if (spec.layout === "file") {
      if (plan.action === "remove") rmSync(plan.file);
      else writeAtomically(plan.file, `${JSON.stringify(minimal(spec, want as Json), null, 2)}\n`);
    } else {
      if (plan.action === "add") text = add(spec, text, want as Json);
      else {
        // One change at a time, from the file as it now is, so every path is current.
        for (;;) {
          const mine = (findAgentHooks(spec, JSON.parse(text as string), platform) as FoundAgentHook[]).filter((f) => f.parsed.form !== "other");
          if (plan.action === "remove" || mine.length > 1) {
            if (!mine.length) break;
            text = removeAt(text as string, (plan.action === "remove" ? mine[0] : mine[1]).removal);
            continue;
          }
          if (!owned(spec, mine[0].value, want as Json)) {
            const rest = Object.fromEntries(Object.entries(mine[0].value).filter(([k]) => !(spec.drop ?? []).includes(k)));
            text = replaceAt(text as string, mine[0].path, { ...rest, ...want });
            continue;
          }
          break;
        }
      }
      writeAtomically(plan.file, text as string);
    }
  } catch (error) {
    return fail((error as Error).message);
  }
  // Read it back.
  const after = existsSync(plan.file) ? findAgentHooks(spec, JSON.parse(readFileSync(plan.file, "utf8")), platform) : [];
  const left = typeof after === "string" ? [] : after.filter((f) => f.parsed.form !== "other");
  const check = plan.action === "remove" ? null : wanted(spec, target as { node: string; entry: string }, left[0]?.parsed.flags ?? [], platform);
  const ok = !check ? !left.length : "handler" in check && left.length === 1 && owned(spec, left[0].value, check.handler);
  return ok ? { ...plan, backup, result: "done" } : { ...plan, backup, result: "failed", error: `${plan.file} doesn't hold the hook as expected after the change.` };
}

// Our entry added last, as a new group (Codex's trust is by position: nothing before it moves).
function add(spec: HookSpec, text: string | null, handler: Json): string {
  if (text === null || !text.trim()) return `${JSON.stringify(minimal(spec, handler), null, 2)}\n`;
  if (spec.layout === "named") return setTop(text, NAMED, { PreToolUse: [group(spec, handler)] });
  const item = spec.layout === "groups" ? group(spec, handler) : handler;
  const root = JSON.parse(text) as Json;
  const [outer, inner] = spec.container;
  const list = isObject(root[outer]) ? (root[outer] as Json)[inner] : undefined;
  return Array.isArray(list) ? appendItem(text, [outer, inner], item) : setMember(text, [outer, inner], [item]);
}
