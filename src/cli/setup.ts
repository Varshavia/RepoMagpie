// repomagpie setup (decision 0035): detect the agents, show a plan, ask, apply, then a summary.
// It sets up the MCP server, the skill and the hook in each agent (decisions 0035 and 0036).
// Under --json, or without a terminal, it never asks: --yes applies, --dry-run only shows.
import { existsSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { AGENTS, type Agent, type Platform } from "../core/agents.ts";
import { backedUp, backupsOf } from "../core/config-write.ts";
import { resolvePersonalJournal } from "../core/journals.ts";
import { launchCommand } from "../core/launch.ts";
import { applySetup, planSetup, type AgentPlan, type SetupPlan, type SetupRequest } from "../core/setup.ts";
import type { HookPlan } from "../core/setup-hook.ts";
import type { SkillItem } from "../core/setup-skill.ts";
import { clean, cleanAll } from "../core/text.ts";
import type { GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";
import { confirm, multiSelect, type Terminal } from "./prompt.ts";

export interface SetupOptions extends GlobalOptions {
  yes?: boolean;
  dryRun?: boolean;
  agents?: string;
  remove?: boolean;
  allowWrite?: boolean; // --allow-write (true), --no-allow-write (false), neither (undefined)
}

export async function setupCommand(options: SetupOptions, io: Io): Promise<number> {
  const usage = (message: string) => {
    io.err(`repomagpie setup: ${message}\n`);
    return 2;
  };
  const ids = options.agents?.split(",").map((id) => id.trim()).filter(Boolean);
  const unknown = ids?.filter((id) => !AGENTS.some((a) => a.id === id));
  if (unknown?.length) return usage(`unknown agent ${unknown.join(", ")}. Use: ${AGENTS.map((a) => a.id).join(", ")}.`);
  if (options.json && !options.yes && !options.dryRun) return usage("--json never asks: add --yes to apply the plan, or --dry-run to see it.");
  const ask = !options.json && !options.yes && !options.dryRun && io.interactive;
  if (!ask && !options.yes && !options.dryRun) return usage("there's no terminal to ask in. Add --yes to apply the plan, or --dry-run to see it.");

  // --project: the project root (or its .magpie folder), for the skill and the hook.
  let project: string | undefined;
  if (options.project) {
    project = resolve(io.cwd, options.project);
    if (basename(project) === ".magpie") project = dirname(project);
    if (!statSync(project, { throwIfNoEntry: false })?.isDirectory()) return usage(`--project ${options.project} isn't a folder.`);
  }

  const platform = process.platform as Platform;
  const self = io.self ?? { execPath: process.execPath, entry: realpathSync(process.argv[1]) };
  // The journal the agent's server reads: the agent doesn't get --home or MAGPIE_HOME, so a journal
  // chosen by either goes into the entry.
  const journal = options.home || io.env.MAGPIE_HOME ? resolvePersonalJournal({ home: io.home, env: io.env, cwd: io.cwd, flag: options.home }).path : undefined;
  // UTC, so backup names sort and never jump at a daylight-saving change; the Z says so.
  const stamp = `${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}Z`;
  const request = (noteTool: boolean | undefined, only?: Agent["id"][]): SetupRequest => ({
    where: { home: io.home, env: io.env, platform },
    launch: launchCommand({ execPath: self.execPath, entry: self.entry, env: io.env, platform, tmp: tmpdir(), home: journal }),
    noteTool,
    remove: Boolean(options.remove),
    only,
    stamp,
    project,
  });

  // The note tool changes only with a flag or an answer; otherwise each entry keeps its own.
  let allowWrite = options.allowWrite;
  let only = ids as Agent["id"][] | undefined;
  let plan = planSetup(request(allowWrite, only));
  if (ask) {
    const terminal: Terminal = io.terminal ?? { input: process.stdin, output: process.stderr };
    const candidates = plan.agents.filter((a) => a.action !== "skip");
    if (!candidates.length) {
      io.err(render(plan, io.home));
      return 0;
    }
    const picked = await multiSelect(terminal, options.remove ? "Remove RepoMagpie from these agents?" : "Set up RepoMagpie's MCP server and hook in these agents?", candidates.map((a) => ({ label: a.name })));
    if (picked === null || !picked.length) return cancelled(io);
    only = picked.map((i) => candidates[i].id);
    if (!options.remove && allowWrite === undefined) {
      // The default is the state now: yes only when every chosen agent with an entry has it on.
      const chosen = candidates.filter((a) => only?.includes(a.id));
      const now = chosen.filter((a) => a.note_tool && a.note_tool.from !== null);
      const write = await confirm(terminal, `Let agents record your Verdicts with the note tool? It writes to your journal, only with your words. Now ${noteToolNow(chosen)}.`, now.length > 0 && now.every((a) => a.note_tool?.from));
      if (write === null) return cancelled(io);
      allowWrite = write;
    }
    plan = planSetup(request(allowWrite, only));
    io.err(render(plan, io.home));
    if (!anyChange(plan)) return 0;
    const go = await confirm(terminal, "Make these changes?", true);
    if (!go) return cancelled(io);
  } else if (!options.json) io.err(render(plan, io.home));

  const done = options.dryRun ? plan : applySetup(plan, request(allowWrite, only));
  if (options.json) io.out(`${JSON.stringify(cleanAll({ dry_run: Boolean(options.dryRun), allow_write: allowWrite ?? null, ...done }))}\n`);
  else if (!options.dryRun) io.err(summary(done, io.home, backupCounts(done, io.home, project)));
  else io.err("Dry run: nothing changed.\n");
  const failed = done.agents.some((a) => a.result === "failed") || done.skill?.result === "failed" || done.hook?.result === "failed" || done.hooks.some((h) => h.result === "failed") ||
    (!options.remove && done.launch_error !== null && done.agents.some((a) => a.installed));
  return failed && !options.dryRun ? 1 : 0;
}

const changes = (a: AgentPlan) => a.action === "add" || a.action === "update" || a.action === "remove";
const anyChange = (plan: SetupPlan) => plan.agents.some(changes) ||
  [plan.skill?.shared, plan.skill?.claude, plan.skill?.antigravity].some((item) => item && !["keep", "leave"].includes(item.action)) ||
  [plan.hook, ...plan.hooks].some((h) => h !== null && ["add", "migrate", "remove"].includes(h.action));

function cancelled(io: Io): number {
  io.err("Cancelled. Nothing changed.\n");
  return 0;
}

// The note tool in the chosen agents now: "on in Cursor, off in Gemini CLI, not set up in VS Code".
function noteToolNow(agents: AgentPlan[]): string {
  const names = (state: boolean | null) => {
    const list = agents.filter((a) => (a.note_tool?.from ?? null) === state).map((a) => a.name);
    return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0];
  };
  return ([[true, "on in"], [false, "off in"], [null, "not set up in"]] as const)
    .flatMap(([state, words]) => (names(state) ? [`${words} ${names(state)}`] : [])).join(", ");
}

const onOff = (on: boolean) => (on ? "on" : "off");

const WHAT: Record<AgentPlan["action"], string> = {
  add: "add", update: "update", keep: "already set up", remove: "remove", manual: "by hand", refused: "can't", skip: "skip",
};

// The plan for people: what each agent's entry starts, then one line per agent, with where, how
// and the backup; a snippet to paste where setup won't write.
export function render(plan: SetupPlan, home: string): string {
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path);
  const lines: string[] = [];
  if (plan.launch_error && !plan.remove) lines.push(plan.launch_error, "");
  // Full paths: setting up by hand copies this line, and agents don't expand ~.
  else if (plan.launch && !plan.remove) lines.push(`Each agent will start: ${[plan.launch.command, ...plan.launch.args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ")}`, "");
  for (const a of plan.agents) {
    if (a.action === "skip") {
      lines.push(`  ${a.name.padEnd(12)}  ${a.reason ?? "skip"}`);
      continue;
    }
    const how = a.method === "cli" ? `through the ${AGENTS.find((x) => x.id === a.id)?.cli} command, in ${tilde(a.file)}` : a.method === "json" ? `edit ${tilde(a.file)}` : "";
    lines.push(`  ${a.name.padEnd(12)}  ${WHAT[a.action]}${how ? `: ${how}` : ""}${a.reason ? `: ${a.reason}` : ""}`);
    // The note tool when it changes, or when it is on.
    const tool = a.note_tool;
    if (tool && tool.from !== null && tool.from !== tool.to) lines.push(`                note tool: ${onOff(tool.from)} → ${onOff(tool.to)}`);
    else if (tool?.to) lines.push("                note tool: on");
    if (a.action === "update" && a.current) lines.push(`                it now starts: ${[a.current.command ?? "(no command)", ...a.current.args].join(" ")}`);
    if (a.backup) lines.push(`                backup first: ${tilde(a.backup)}`);
    if (a.snippet) lines.push(`                ${a.action === "manual" && !plan.remove ? `paste into ${tilde(a.file)}:` : ""}`.trimEnd(), ...a.snippet.split("\n").map((line) => `                  ${line}`));
    // Its hook (decision 0036), in the user's settings as the MCP entry is.
    const h = plan.hooks.find((x) => x.id === a.id);
    if (h) {
      // Antigravity CLI's launcher on Windows: alone when only it changes (no backup of hooks.json).
      const launcherOnly = h.action === "migrate" && h.launcher && !h.backup ? h.launcher : null;
      lines.push(`                hook: ${AGENT_HOOK_WHAT[h.action]}${["add", "migrate", "remove"].includes(h.action) ? `: ${launcherOnly ? `write ${tilde(launcherOnly)}` : `edit ${tilde(h.file)}`}` : `: ${tilde(h.file)}`}${h.reason ? `: ${h.reason}` : ""}`);
      if (h.launcher && !launcherOnly) lines.push(`                  ${h.action === "remove" ? "and delete" : "and write"} ${tilde(h.launcher)}, which the entry runs`);
      if (h.action === "add" || h.action === "migrate") lines.push(`                  it will start node directly, then hook ${h.sub}, only when both files are there`);
      if (h.backup) lines.push(`                  backup first: ${tilde(h.backup)}`);
      if (h.snippet) lines.push(...h.snippet.split("\n").map((line) => `                    ${line}`));
    }
  }
  if (plan.skill || plan.hook) lines.push("", plan.project ? `In the project ${plan.project} (the MCP entries and the other agents' hooks above stay in your own settings):` : "And in your home folder:");
  for (const item of [plan.skill?.shared, plan.skill?.claude, plan.skill?.antigravity]) {
    if (!item) continue;
    lines.push(`  ${"Skill".padEnd(12)}  ${SKILL_WHAT[item.action]}: ${tilde(item.path)}${item.reason ? `: ${item.reason}` : ""}`);
    if (item.backup) lines.push(`                backup first: ${tilde(item.backup)}`);
  }
  if (plan.hook) {
    const h = plan.hook;
    lines.push(`  ${"Hook".padEnd(12)}  ${HOOK_WHAT[h.action]}: ${tilde(h.file)}${h.reason ? `: ${h.reason}` : ""}`);
    if (h.action === "add" || h.action === "migrate") lines.push(`                it will start: ${plan.project ? "repomagpie hook claude-code (through a shell, so any teammate's install runs it)" : "node directly, as the MCP entry does, then hook claude-code"}`);
    if (h.backup) lines.push(`                backup first: ${tilde(h.backup)}`);
    if (h.snippet) lines.push(...h.snippet.split("\n").map((line) => `                  ${line}`));
  }
  return `${lines.map((line) => clean(line)).join("\n")}\n`;
}

const SKILL_WHAT: Record<SkillItem["action"], string> = {
  add: "install", update: "update", keep: "already there", remove: "remove", leave: "leave", link: "link to the shared folder", relink: "replace with a link to the shared folder", copy: "copy",
};
const HOOK_WHAT: Record<HookPlan["action"], string> = {
  add: "add the hook", migrate: "update the hook entry", keep: "already set up", remove: "remove", manual: "by hand", refused: "can't",
};
// The other agents' hooks, on their agent's lines: the MCP entry's words.
const AGENT_HOOK_WHAT: Record<HookPlan["action"], string> = { ...WHAT, migrate: "update" };
const DONE: Partial<Record<HookPlan["action"], string>> = { add: "added", migrate: "updated", remove: "removed" };

// For each file this run backed up, how many of setup's backups it has now (they are never deleted
// for the user: the first is the file as it was before setup).
function backupCounts(plan: SetupPlan, home: string, project: string | undefined): { label: string; count: number }[] {
  const written: { label: string; backup: string | null; root: string }[] = [
    ...plan.agents.filter((a) => a.result === "done").map((a) => ({ label: a.file, backup: a.backup, root: home })),
    ...(plan.hook?.result === "done" ? [{ label: plan.hook.file, backup: plan.hook.backup, root: project ?? home }] : []),
    ...plan.hooks.filter((h) => h.result === "done").map((h) => ({ label: h.file, backup: h.backup, root: home })),
    ...(plan.skill?.result === "done" ? [plan.skill.shared, plan.skill.claude, plan.skill.antigravity].flatMap((item) => (item ? [{ label: item.path, backup: item.backup, root: project ?? home }] : [])) : []),
  ];
  // One line per file, even when this run backed it up twice (Gemini CLI's settings.json).
  const counts = written.flatMap(({ label, backup, root }) => (backup && existsSync(backup) ? [{ label, count: backupsOf(backedUp(backup), root).length }] : []));
  return counts.filter((c, i) => counts.findIndex((d) => d.label === c.label) === i);
}

function summary(plan: SetupPlan, home: string, backups: { label: string; count: number }[]): string {
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path);
  const lines = plan.agents.filter((a) => a.result).map((a) =>
    a.result === "done" ? `Done: ${a.name}, ${a.action === "add" ? "added" : a.action === "update" ? "updated" : "removed"}${a.backup ? ` (backup: ${tilde(a.backup)})` : ""}.` : `Failed: ${a.name}: ${a.error}`);
  for (const item of [plan.skill?.shared, plan.skill?.claude, plan.skill?.antigravity]) {
    if (!item || !plan.skill?.result || ["keep", "leave"].includes(item.action)) continue;
    lines.push(plan.skill.result === "done" ? `Done: the skill, ${SKILL_WHAT[item.action]}: ${tilde(item.path)}${item.made === "copy" && item.action !== "copy" ? " (a copy: a link couldn't be made)" : ""}.` : `Failed: the skill: ${plan.skill.error}`);
  }
  if (plan.hook?.result) lines.push(plan.hook.result === "done" ? `Done: the Claude Code hook, ${HOOK_WHAT[plan.hook.action]}${plan.hook.backup ? ` (backup: ${tilde(plan.hook.backup)})` : ""}.` : `Failed: the Claude Code hook: ${plan.hook.error}`);
  for (const h of plan.hooks.filter((x) => x.result)) {
    const name = AGENTS.find((a) => a.id === h.id)?.name;
    lines.push(h.result === "done" ? `Done: the ${name} hook, ${DONE[h.action]}${h.backup ? ` (backup: ${tilde(h.backup)})` : ""}.` : `Failed: the ${name} hook: ${h.error}`);
  }
  // Codex skips a new or changed hook until the user trusts it there (decision 0036).
  if (plan.hooks.some((h) => h.id === "codex" && h.result === "done" && h.action !== "remove")) lines.push("Codex CLI runs the hook only once you trust it: open /hooks in Codex and trust RepoMagpie's hook.");
  // Antigravity keeps a cache of its MCP servers (docs/agents.md).
  if (plan.remove && plan.agents.some((a) => a.id === "antigravity" && a.result === "done")) lines.push("Antigravity CLI may still list the MCP server until its cache, ~/.gemini/antigravity-cli/mcp/, is cleared.");
  if (!lines.length) lines.push("Nothing to change.");
  for (const b of backups) lines.push(`${tilde(b.label)} now has ${b.count} ${b.count === 1 ? "backup" : "backups"} from setup; repomagpie doctor lists them.`);
  if (plan.launch_error && !plan.remove) lines.push("No MCP entry was written.");
  const changed = plan.agents.some((a) => a.result === "done") || plan.skill?.result === "done" || plan.hook?.result === "done" || plan.hooks.some((h) => h.result === "done");
  if (changed) lines.push("Restart your agents to load the change. Run repomagpie doctor to check.");
  return `${lines.map((line) => clean(line)).join("\n")}\n`;
}
