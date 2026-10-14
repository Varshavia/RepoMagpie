// repomagpie setup's Claude Code hook (spec §6, decision 0035): one PreToolUse entry that runs
// `repomagpie hook claude-code` on Bash and PowerShell. An entry with the old name (`magpie hook
// claude-code`, decision 0031) is changed in place, its flags kept. Only plain JSON is edited, and
// only our entries; every other byte of settings.json stays. Never prints.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { readJsonc } from "./agents.ts";
import { backupName, pathProblem, writeAtomically } from "./config-write.ts";
import { appendItem, removeAt, replaceAt, setMember } from "./json-edit.ts";

export const HOOK_COMMAND = "repomagpie hook claude-code";
const GROUP = { matcher: "Bash|PowerShell", hooks: [{ type: "command", command: HOOK_COMMAND }] };

export interface HookPlan {
  file: string;
  action: "add" | "migrate" | "keep" | "remove" | "manual" | "refused";
  reason: string | null;
  backup: string | null;
  snippet: string | null;
  result?: "done" | "failed";
  error?: string;
}

interface Found {
  group: number;
  hook: number;
  command: string;
  form: "current" | "old" | "other";
  alone: boolean; // the only hook in its group
}

// Our entries in parsed settings: every hook command that runs `hook claude-code`.
function ours(settings: unknown): Found[] | string {
  const pre = (settings as { hooks?: { PreToolUse?: unknown } } | null)?.hooks?.PreToolUse;
  if (pre === undefined) return [];
  if (!Array.isArray(pre)) return "hooks.PreToolUse isn't a list";
  const found: Found[] = [];
  for (const [group, entry] of pre.entries()) {
    const hooks = (entry as { hooks?: unknown } | null)?.hooks;
    if (!Array.isArray(hooks)) continue;
    for (const [hook, h] of hooks.entries()) {
      const command = (h as { command?: unknown } | null)?.command;
      if (typeof command !== "string" || !/\bhook\s+claude-code\b/.test(command)) continue;
      const form = /^\s*repomagpie(\.cmd)?\s+hook\s+claude-code\b/.test(command) ? "current" : /^\s*magpie(\.cmd)?\s+hook\s+claude-code\b/.test(command) ? "old" : "other";
      found.push({ group, hook, command, form, alone: hooks.length === 1 });
    }
  }
  return found;
}

// `root` is the folder setup may write in: the home folder, or the project with --project.
export function planHook(file: string, root: string, remove: boolean, stamp: string): HookPlan {
  const base: HookPlan = { file, action: "keep", reason: null, backup: null, snippet: null };
  const unsafe = pathProblem(file, root);
  if (unsafe) return { ...base, action: "refused", reason: unsafe };
  const text = existsSync(file) ? readFileSync(file, "utf8") : null;
  const read = text === null ? { value: {}, plain: true } : readJsonc(text);
  if ("error" in read) return { ...base, action: "refused", reason: `${file} can't be read: ${read.error}` };
  const found = ours(read.value);
  if (typeof found === "string") return { ...base, action: "refused", reason: `${found}, so setup leaves the file alone` };
  const backup = text === null ? null : backupName(file, stamp);
  const mine = found.filter((f) => f.form !== "other");
  if (!read.plain && (remove ? mine.length : !mine.some((f) => f.form === "current") || mine.some((f) => f.form === "old"))) {
    return { ...base, action: "manual", reason: "the file has comments or trailing commas, which setup doesn't edit", snippet: remove ? `Delete the ${HOOK_COMMAND} hook in ${file}.` : JSON.stringify({ hooks: { PreToolUse: [GROUP] } }, null, 2) };
  }
  if (remove) return mine.length ? { ...base, action: "remove", backup } : base;
  if (mine.some((f) => f.form === "old")) return { ...base, action: "migrate", backup };
  if (mine.length) return base;
  if (found.length) return { ...base, reason: "a hook entry already runs RepoMagpie another way; setup keeps it" };
  return { ...base, action: "add", backup };
}

export function applyHook(plan: HookPlan, root: string): HookPlan {
  if (!["add", "migrate", "remove"].includes(plan.action)) return plan;
  const fail = (error: string): HookPlan => ({ ...plan, result: "failed", error });
  const unsafe = pathProblem(plan.file, root);
  if (unsafe) return fail(unsafe);
  try {
    if (plan.backup && existsSync(plan.file)) copyFileSync(plan.file, plan.backup, 1 /* COPYFILE_EXCL */);
    let text = existsSync(plan.file) ? readFileSync(plan.file, "utf8") : null;
    if (plan.action === "add") {
      const settings = (text === null ? {} : JSON.parse(text)) as { hooks?: { PreToolUse?: unknown } };
      text = Array.isArray(settings.hooks?.PreToolUse) ? appendItem(text as string, ["hooks", "PreToolUse"], GROUP) : setMember(text, ["hooks", "PreToolUse"], [GROUP]);
    } else {
      // One entry at a time, from the file as it now is, so every path is current.
      for (;;) {
        const found = (ours(JSON.parse(text as string)) as Found[]).filter((f) => f.form !== "other");
        const hasCurrent = found.some((f) => f.form === "current");
        const next = plan.action === "remove" ? found[0] : found.find((f) => f.form === "old");
        if (!next) break;
        const at = ["hooks", "PreToolUse", next.group] as (string | number)[];
        if (plan.action === "migrate" && !hasCurrent) text = replaceAt(text as string, [...at, "hooks", next.hook, "command"], next.command.replace(/^(\s*)magpie(\.cmd)?/, "$1repomagpie"));
        else text = removeAt(text as string, next.alone ? at : [...at, "hooks", next.hook]);
      }
    }
    writeAtomically(plan.file, text as string);
  } catch (error) {
    return fail((error as Error).message);
  }
  // Read it back.
  const after = ours(JSON.parse(readFileSync(plan.file, "utf8")));
  const left = typeof after === "string" ? [] : after.filter((f) => f.form !== "other");
  const ok = plan.action === "remove" ? !left.length : left.length > 0 && left.every((f) => f.form === "current");
  return ok ? { ...plan, result: "done" } : fail(`${plan.file} doesn't hold the hook as expected after the change.`);
}
