// repomagpie setup (decision 0035): detect the agents, show a plan, ask, apply, then a summary.
// This part sets up the MCP server in each agent; the skill and the Claude Code hook come next.
// Under --json, or without a terminal, it never asks: --yes applies, --dry-run only shows.
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { AGENTS, type Agent, type Platform } from "../core/agents.ts";
import { resolvePersonalJournal } from "../core/journals.ts";
import { launchCommand } from "../core/launch.ts";
import { applySetup, planSetup, type AgentPlan, type SetupPlan, type SetupRequest } from "../core/setup.ts";
import { clean, cleanAll } from "../core/text.ts";
import type { GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";
import { confirm, multiSelect, type Terminal } from "./prompt.ts";

export interface SetupOptions extends GlobalOptions {
  yes?: boolean;
  dryRun?: boolean;
  agents?: string;
  remove?: boolean;
  allowWrite?: boolean;
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

  const platform = process.platform as Platform;
  const self = io.self ?? { execPath: process.execPath, entry: realpathSync(process.argv[1]) };
  // The journal the agent's server reads: the agent doesn't get --home or MAGPIE_HOME, so a journal
  // chosen by either goes into the entry.
  const journal = options.home || io.env.MAGPIE_HOME ? resolvePersonalJournal({ home: io.home, env: io.env, cwd: io.cwd, flag: options.home }).path : undefined;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const request = (allowWrite: boolean, only?: Agent["id"][]): SetupRequest => ({
    where: { home: io.home, env: io.env, platform },
    launch: launchCommand({ execPath: self.execPath, entry: self.entry, env: io.env, platform, tmp: tmpdir(), allowWrite, home: journal }),
    remove: Boolean(options.remove),
    only,
    stamp,
  });

  let allowWrite = Boolean(options.allowWrite);
  let only = ids as Agent["id"][] | undefined;
  let plan = planSetup(request(allowWrite, only));
  if (ask) {
    const terminal: Terminal = io.terminal ?? { input: process.stdin, output: process.stderr };
    const candidates = plan.agents.filter((a) => a.action !== "skip");
    if (!candidates.length) {
      io.err(render(plan, io.home));
      return 0;
    }
    const picked = await multiSelect(terminal, options.remove ? "Remove RepoMagpie from these agents?" : "Set up RepoMagpie's MCP server in these agents?", candidates.map((a) => ({ label: a.name })));
    if (picked === null || !picked.length) return cancelled(io);
    only = picked.map((i) => candidates[i].id);
    if (!options.remove && !options.allowWrite) {
      const write = await confirm(terminal, "Also let agents record your Verdicts with the note tool? It writes to your journal, only with your words.", false);
      if (write === null) return cancelled(io);
      allowWrite = write;
    }
    plan = planSetup(request(allowWrite, only));
    io.err(render(plan, io.home));
    if (!plan.agents.some(changes)) return 0;
    const go = await confirm(terminal, "Make these changes?", true);
    if (!go) return cancelled(io);
  } else if (!options.json) io.err(render(plan, io.home));

  const done = options.dryRun ? plan : applySetup(plan, request(allowWrite, only));
  if (options.json) io.out(`${JSON.stringify(cleanAll({ dry_run: Boolean(options.dryRun), allow_write: allowWrite, ...done }))}\n`);
  else if (!options.dryRun) io.err(summary(done, io.home));
  else io.err("Dry run: nothing changed.\n");
  const failed = done.agents.some((a) => a.result === "failed") || (!options.remove && done.launch_error !== null && done.agents.some((a) => a.installed));
  return failed && !options.dryRun ? 1 : 0;
}

const changes = (a: AgentPlan) => a.action === "add" || a.action === "update" || a.action === "remove";

function cancelled(io: Io): number {
  io.err("Cancelled. Nothing changed.\n");
  return 0;
}

const WHAT: Record<AgentPlan["action"], string> = {
  add: "add", update: "update", keep: "already set up", remove: "remove", manual: "by hand", refused: "can't", skip: "skip",
};

// The plan for people: what each agent's entry starts, then one line per agent, with where, how
// and the backup; a snippet to paste where setup won't write.
export function render(plan: SetupPlan, home: string): string {
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path);
  const lines: string[] = [];
  if (plan.launch_error && !plan.remove) lines.push(plan.launch_error, "");
  else if (plan.launch && !plan.remove) lines.push(`Each agent will start: ${[plan.launch.command, ...plan.launch.args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).map(tilde).join(" ")}`, "");
  for (const a of plan.agents) {
    if (a.action === "skip") {
      lines.push(`  ${a.name.padEnd(12)}  ${a.reason ?? "skip"}`);
      continue;
    }
    const how = a.method === "cli" ? `through the ${AGENTS.find((x) => x.id === a.id)?.cli} command, in ${tilde(a.file)}` : a.method === "json" ? `edit ${tilde(a.file)}` : "";
    lines.push(`  ${a.name.padEnd(12)}  ${WHAT[a.action]}${how ? `: ${how}` : ""}${a.reason ? `: ${a.reason}` : ""}`);
    if (a.action === "update" && a.current) lines.push(`                it now starts: ${[a.current.command ?? "(no command)", ...a.current.args].join(" ")}`);
    if (a.backup) lines.push(`                backup first: ${tilde(a.backup)}`);
    if (a.snippet) lines.push(`                ${a.action === "manual" && !plan.remove ? `paste into ${tilde(a.file)}:` : ""}`.trimEnd(), ...a.snippet.split("\n").map((line) => `                  ${line}`));
  }
  return `${lines.map((line) => clean(line)).join("\n")}\n`;
}

function summary(plan: SetupPlan, home: string): string {
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path);
  const lines = plan.agents.filter((a) => a.result).map((a) =>
    a.result === "done" ? `Done: ${a.name}, ${a.action === "add" ? "added" : a.action === "update" ? "updated" : "removed"}${a.backup ? ` (backup: ${tilde(a.backup)})` : ""}.` : `Failed: ${a.name}: ${a.error}`);
  if (!lines.length) lines.push("Nothing to change.");
  if (plan.launch_error && !plan.remove) lines.push("No MCP entry was written.");
  lines.push("Restart your agents to load the change. Run repomagpie doctor to check.");
  return `${lines.map((line) => clean(line)).join("\n")}\n`;
}
