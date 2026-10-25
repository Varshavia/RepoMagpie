// repomagpie setup's Claude Code hook (spec §6, decision 0035): one PreToolUse entry on Bash and
// PowerShell. In the user's settings it is Claude Code's exec form, which starts node directly with
// no shell: `node --disallow-code-generation-from-strings <entry file> hook claude-code` (on
// Windows a shell and npm's shim cost about 190 ms on every shell command). In a project
// (--project), which is committed, it stays `repomagpie hook claude-code`. Older entries (the
// `magpie` and `repomagpie` shell forms, an exec form with other paths) are changed in place, their
// flags kept. Only plain JSON is edited, and only our entries. Never prints.
// The same code writes the opt-in Stop entry, `hook claude-code-stop` (decision 0042): `kind`.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { readJsonc } from "./agents.ts";
import { backupName, parseJson, pathProblem, readConfig, writeAtomically } from "./config-write.ts";
import { appendItem, removeAt, replaceAt, setMember } from "./json-edit.ts";

export const HOOK_COMMAND = "repomagpie hook claude-code";

// Which entry: the PreToolUse hook on shell commands, or the Stop reminder (no matcher: Claude Code
// ignores one on Stop).
export interface HookKind {
  event: "PreToolUse" | "Stop";
  sub: "claude-code" | "claude-code-stop";
  matcher: string | null;
}
export const PRE_TOOL_USE: HookKind = { event: "PreToolUse", sub: "claude-code", matcher: "Bash|PowerShell" };
export const STOP: HookKind = { event: "Stop", sub: "claude-code-stop", matcher: null };

// The entry setup writes: the exec form (the node, and the arguments up to "claude-code"), or the
// shell form for a project. An error when no entry can be written (RepoMagpie runs from npx's cache).
export type HookTarget = { exec: { command: string; args: string[] } } | { shell: true } | { error: string };

export interface HookPlan {
  file: string;
  action: "add" | "migrate" | "keep" | "remove" | "manual" | "refused";
  reason: string | null;
  backup: string | null;
  snippet: string | null;
  result?: "done" | "failed";
  error?: string;
}

export interface FoundHook {
  group: number;
  hook: number;
  form: "shell" | "old" | "exec" | "other"; // repomagpie …, magpie …, node … with args, anything else running our hook
  command: string;
  args: string[] | null;
  flags: string[]; // what follows "claude-code", such as --inform-only
  alone: boolean; // the only hook in its group
}

// Every hook command in parsed settings that runs `hook claude-code` (or kind's subcommand) under
// kind's event; an error text when hooks.<event> isn't a list.
export function findHooks(settings: unknown, kind: HookKind = PRE_TOOL_USE): FoundHook[] | string {
  const hooksField = (settings as { hooks?: unknown } | null)?.hooks;
  if (hooksField !== undefined && (typeof hooksField !== "object" || hooksField === null || Array.isArray(hooksField))) return "hooks isn't an object";
  const pre = (hooksField as Record<string, unknown> | undefined)?.[kind.event];
  if (pre === undefined) return [];
  if (!Array.isArray(pre)) return `hooks.${kind.event} isn't a list`;
  // The subcommand as a whole word: "hook claude-code" isn't "hook claude-code-stop".
  const sub = `${kind.sub.replace(/-/g, "\\-")}(?![\\w-])`;
  const found: FoundHook[] = [];
  for (const [group, entry] of pre.entries()) {
    const hooks = (entry as { hooks?: unknown } | null)?.hooks;
    if (!Array.isArray(hooks)) continue;
    for (const [hook, h] of hooks.entries()) {
      const { command, args } = (h ?? {}) as { command?: unknown; args?: unknown };
      if (typeof command !== "string") continue;
      const base = { group, hook, command, alone: hooks.length === 1 };
      if (Array.isArray(args) && args.every((a) => typeof a === "string")) {
        const at = args.findIndex((a, i) => a === "hook" && args[i + 1] === kind.sub);
        if (at >= 0) found.push({ ...base, form: "exec", args, flags: args.slice(at + 2) });
        continue;
      }
      const shell = command.match(new RegExp(`^\\s*(repo)?magpie(?:\\.cmd)?\\s+hook\\s+${sub}(.*)$`));
      if (shell) found.push({ ...base, form: shell[1] ? "shell" : "old", args: null, flags: shell[2].trim().split(/\s+/).filter(Boolean) });
      else if (new RegExp(`\\bhook\\s+${sub}`).test(command)) found.push({ ...base, form: "other", args: null, flags: [] });
    }
  }
  return found;
}

// The hook object setup wants, for an entry with these flags. The target names `hook claude-code`;
// another kind's entry ends in its own subcommand.
function wanted(target: Exclude<HookTarget, { error: string }>, flags: string[], kind: HookKind = PRE_TOOL_USE): { command: string; args?: string[] } {
  if (!("exec" in target)) return { command: [`repomagpie hook ${kind.sub}`, ...flags].join(" ") };
  return { command: target.exec.command, args: [...target.exec.args.slice(0, -1), kind.sub, ...flags] };
}

const matches = (found: FoundHook, want: { command: string; args?: string[] }) =>
  found.command === want.command && (want.args ? found.args !== null && found.args.length === want.args.length && found.args.every((a, i) => a === want.args?.[i]) : found.args === null);

// `root` is the folder setup may write in: the home folder, or the project with --project.
// `add`: false keeps an entry up to date but adds none (the Stop reminder without --capture-reminder).
export function planHook(file: string, root: string, remove: boolean, stamp: string, target: HookTarget, kind: HookKind = PRE_TOOL_USE, add = true): HookPlan {
  const base: HookPlan = { file, action: "keep", reason: null, backup: null, snippet: null };
  const unsafe = pathProblem(file, root);
  if (unsafe) return { ...base, action: "refused", reason: unsafe };
  const config = readConfig(file);
  if ("error" in config) return { ...base, action: "refused", reason: config.error };
  const text = config.text;
  const read = text === null ? { value: {}, plain: true } : readJsonc(text);
  if ("error" in read) return { ...base, action: "refused", reason: `${file} can't be read: ${read.error}` };
  const found = findHooks(read.value, kind);
  if (typeof found === "string") return { ...base, action: "refused", reason: `${found}, so setup leaves the file alone` };
  const backup = text === null ? null : backupName(file, stamp);
  const mine = found.filter((f) => f.form !== "other");
  if (remove) {
    if (!mine.length) return base;
    return read.plain ? { ...base, action: "remove", backup } : { ...base, action: "manual", reason: COMMENTS, snippet: `Delete the hook entries that run hook ${kind.sub} in ${file}.` };
  }
  if (!add && !mine.length) return base;
  if ("error" in target) return { ...base, action: "refused", reason: target.error };
  const done = mine.length === 1 && matches(mine[0], wanted(target, mine[0].flags, kind));
  if (done) return base;
  if (!mine.length && found.length) return { ...base, reason: "a hook entry already runs RepoMagpie another way; setup keeps it" };
  if (!read.plain) return { ...base, action: "manual", reason: COMMENTS, snippet: JSON.stringify({ hooks: { [kind.event]: [group(target, [], kind)] } }, null, 2) };
  return { ...base, action: mine.length ? "migrate" : "add", backup };
}

const COMMENTS = "the file has comments, trailing commas or a key written twice, which setup doesn't edit";
const group = (target: Exclude<HookTarget, { error: string }>, flags: string[], kind: HookKind = PRE_TOOL_USE) =>
  ({ ...(kind.matcher === null ? {} : { matcher: kind.matcher }), hooks: [{ type: "command", ...wanted(target, flags, kind) }] });

export function applyHook(plan: HookPlan, root: string, target: HookTarget, kind: HookKind = PRE_TOOL_USE): HookPlan {
  if (!["add", "migrate", "remove"].includes(plan.action)) return plan;
  const fail = (error: string): HookPlan => ({ ...plan, result: "failed", error });
  if ("error" in target && plan.action !== "remove") return fail(target.error);
  const unsafe = pathProblem(plan.file, root);
  if (unsafe) return fail(unsafe);
  try {
    if (plan.backup && existsSync(plan.file)) copyFileSync(plan.file, plan.backup, 1 /* COPYFILE_EXCL */);
    const config = readConfig(plan.file);
    if ("error" in config) return fail(config.error);
    let text = config.text;
    const { event } = kind;
    if (plan.action === "add") {
      const settings = (text === null ? {} : parseJson(text)) as { hooks?: Record<string, unknown> };
      const entry = group(target as Exclude<HookTarget, { error: string }>, [], kind);
      text = Array.isArray(settings.hooks?.[event]) ? appendItem(text as string, ["hooks", event], entry) : setMember(text, ["hooks", event], [entry]);
    } else {
      // One change at a time, from the file as it now is, so every path is current: the first of
      // our entries becomes the wanted one (its flags kept), any other goes.
      for (;;) {
        const settings = parseJson(text as string) as { hooks: Record<string, { hooks: Record<string, unknown>[] }[]> };
        const mine = (findHooks(settings, kind) as FoundHook[]).filter((f) => f.form !== "other");
        const at = (f: FoundHook) => ["hooks", event, f.group, ...(f.alone ? [] : ["hooks", f.hook])] as (string | number)[];
        if (plan.action === "remove") {
          if (!mine.length) break;
          text = removeAt(text as string, at(mine[0]));
          continue;
        }
        const want = wanted(target as Exclude<HookTarget, { error: string }>, mine[0].flags, kind);
        if (!matches(mine[0], want)) {
          const old = settings.hooks[event][mine[0].group].hooks[mine[0].hook];
          const { args: _args, ...rest } = old;
          text = replaceAt(text as string, ["hooks", event, mine[0].group, "hooks", mine[0].hook], { ...rest, ...want });
          continue;
        }
        if (mine.length > 1) {
          text = removeAt(text as string, at(mine[1]));
          continue;
        }
        break;
      }
    }
    writeAtomically(plan.file, text as string);
  } catch (error) {
    return fail((error as Error).message);
  }
  // Read it back.
  const after = findHooks(parseJson(readFileSync(plan.file, "utf8")), kind);
  const left = typeof after === "string" ? [] : after.filter((f) => f.form !== "other");
  const ok = plan.action === "remove" ? !left.length : left.length === 1 && matches(left[0], wanted(target as Exclude<HookTarget, { error: string }>, left[0].flags, kind));
  return ok ? { ...plan, result: "done" } : fail(`${plan.file} doesn't hold the hook as expected after the change.`);
}
