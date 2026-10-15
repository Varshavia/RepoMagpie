// repomagpie setup (decision 0035): a plan per agent, then applying it. The MCP entry through the
// agent's own CLI where it has one, otherwise a round-trip-safe edit of plain JSON, otherwise a
// snippet for the user to paste; then the skill (setup-skill.ts) and the Claude Code hook
// (setup-hook.ts). A backup before every change; never through a link, never outside the home
// folder (or the project, with --project); nothing that weakens an agent's safety (no trust or
// auto-approve key is written). Never prints, never prompts.
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./agent-cli.ts";
import { AGENTS, isInstalled, mcpEntry, onPath, readJsonc, type Agent, type McpEntry, type McpFormat, type Where } from "./agents.ts";
import { backupName, pathProblem, readConfig, writeAtomically } from "./config-write.ts";
import { setMember } from "./json-edit.ts";
import { redactArgs, redactText } from "./redact.ts";
import type { Launch } from "./launch.ts";
import { applyHook, planHook, type HookPlan, type HookTarget } from "./setup-hook.ts";
import { applySkill, planSkill, type SkillPlan } from "./setup-skill.ts";

// The package's skill: beside dist/ in the package, beside src/ in the repository.
export const SKILL_SOURCE = fileURLToPath(new URL("../../skills/repomagpie/", import.meta.url));

export const NAME = "repomagpie";

export type Action = "add" | "update" | "keep" | "remove" | "manual" | "refused" | "skip";

export interface AgentPlan {
  id: Agent["id"];
  name: string;
  installed: boolean;
  file: string; // the file that holds its MCP entry
  action: Action;
  method: "cli" | "json" | null; // how an add, update or remove is made
  reason: string | null; // why manual, refused or skip
  current: { command: string | null; args: string[] } | null; // the entry there now
  backup: string | null; // the backup an add, update or remove writes first
  snippet: string | null; // for manual: what to paste, or the command to run
  result?: "done" | "failed"; // after applying
  error?: string;
}

export interface SetupPlan {
  remove: boolean;
  project: string | null; // --project: where the skill and the hook go
  launch: { command: string; args: string[] } | null;
  launch_error: string | null;
  agents: AgentPlan[]; // the MCP entries, always in the user's settings
  skill: SkillPlan | null; // when any agent is set up
  hook: HookPlan | null; // when Claude Code is set up
}

export interface SetupRequest {
  where: Where;
  launch: Launch;
  remove: boolean;
  only?: Agent["id"][]; // --agents; default: every installed agent
  stamp: string; // for backup names: YYYYMMDD-HHMMSS
  project?: string; // --project: the project root, for the skill and the hook
  skillSource?: string; // default: the package's
}

// The agent CLIs' commands (docs/agents.md). VS Code's CLI can add but not remove.
const CLI: Record<Agent["id"], { add?: (l: { command: string; args: string[] }) => string[]; remove?: string[]; edit: boolean }> = {
  "claude-code": { add: (l) => ["mcp", "add", "--scope", "user", "--transport", "stdio", NAME, "--", l.command, ...l.args], remove: ["mcp", "remove", "--scope", "user", NAME], edit: false },
  codex: { add: (l) => ["mcp", "add", NAME, "--", l.command, ...l.args], remove: ["mcp", "remove", NAME], edit: false },
  gemini: { add: (l) => ["mcp", "add", "--scope", "user", NAME, "--", l.command, ...l.args], remove: ["mcp", "remove", "--scope", "user", NAME], edit: true },
  cursor: { edit: true },
  vscode: { add: (l) => ["--add-mcp", JSON.stringify({ name: NAME, command: l.command, args: l.args })], edit: true },
};

export function planSetup(request: SetupRequest): SetupPlan {
  const { where } = request;
  const launch = "error" in request.launch ? null : request.launch;
  const plan: SetupPlan = { remove: request.remove, project: request.project ?? null, launch, launch_error: "error" in request.launch ? request.launch.error : null, agents: [], skill: null, hook: null };
  for (const agent of AGENTS) {
    const installed = isInstalled(agent, where);
    const file = agent.mcpFile(where);
    const base: AgentPlan = { id: agent.id, name: agent.name, installed, file, action: "skip", method: null, reason: null, current: null, backup: null, snippet: null };
    if (request.only ? !request.only.includes(agent.id) : !installed) {
      if (!request.only) plan.agents.push({ ...base, reason: "not installed" });
      continue;
    }
    if (!installed) {
      plan.agents.push({ ...base, reason: `not installed: no ${agent.marker(where)} and no ${agent.cli} command` });
      continue;
    }
    plan.agents.push(planAgent(agent, base, request, launch));
  }
  // The skill and the hook: in the home folder, or the project's folders with --project.
  const chosen = plan.agents.filter((a) => a.action !== "skip");
  const claude = chosen.some((a) => a.id === "claude-code");
  const root = request.project ?? where.home;
  if (chosen.length) {
    plan.skill = planSkill({
      source: request.skillSource ?? SKILL_SOURCE, shared: join(root, ".agents", "skills", NAME), claude: claude ? join(root, ".claude", "skills", NAME) : null,
      root, remove: request.remove, stamp: request.stamp, platform: where.platform, project: request.project !== undefined,
    });
  }
  if (claude) plan.hook = planHook(join(root, ".claude", "settings.json"), root, request.remove, request.stamp, hookTarget(request));
  return plan;
}

// The hook entry: in a project the shell form, which a teammate's machine can run; in the user's
// settings the exec form, from the same node and entry file as the MCP entry, with code generation
// off (decision 0035).
function hookTarget(request: SetupRequest): HookTarget {
  if (request.project !== undefined) return { shell: true };
  if ("error" in request.launch) return { error: request.launch.error };
  const [flag, entry] = request.launch.args;
  return { exec: { command: request.launch.command, args: [flag, entry, "hook", "claude-code"] } };
}

const ROOT = (request: SetupRequest) => request.project ?? request.where.home;

function planAgent(agent: Agent, base: AgentPlan, request: SetupRequest, launch: SetupPlan["launch"]): AgentPlan {
  const { where } = request;
  const refuse = (reason: string): AgentPlan => ({ ...base, action: "refused", reason });
  const unsafe = pathProblem(base.file, where.home);
  if (unsafe) return refuse(unsafe);

  const config = readConfig(base.file);
  if ("error" in config) return refuse(config.error);
  const text = config.text;
  const read = text === null ? { entry: null } : mcpEntry(text, agent.format, NAME);
  const plain = text === null || agent.format === "codex-toml" || (() => { const r = readJsonc(text); return !("error" in r) && r.plain; })();
  const entry = "entry" in read ? read.entry : null;
  // Shown in the plan with secrets redacted (another server's command can hold a token); compared raw.
  const current = entry ? { command: entry.command === null ? null : redactText(entry.command), args: redactArgs(entry.args) } : null;
  const cli = onPath(agent.cli, where)[0];
  const how = CLI[agent.id];
  const backup = text === null ? null : backupName(base.file, request.stamp);
  const withCurrent = { ...base, current, backup };

  if (request.remove) {
    if (!current) return { ...withCurrent, action: "keep", backup: null };
    if (cli && how.remove) return { ...withCurrent, action: "remove", method: "cli" };
    if (how.edit && plain && !("error" in read)) return { ...withCurrent, action: "remove", method: "json" };
    return { ...withCurrent, action: "manual", backup: null, reason: manualReason(agent, cli, plain), snippet: agent.format === "codex-toml" ? `Delete the [mcp_servers.${NAME}] table in ${base.file}.` : `Delete "${NAME}" under "${agent.format}" in ${base.file}.` };
  }

  if (!launch) return { ...withCurrent, action: "refused", backup: null, reason: "this copy of RepoMagpie can't be started by an agent (see above)" };
  if (entry && same(entry, launch)) return { ...withCurrent, action: "keep", backup: null };
  const action: Action = current ? "update" : "add";
  // An update through a CLI needs it to remove the old entry first.
  if (cli && how.add && (!current || how.remove)) return { ...withCurrent, action, method: "cli" };
  if ("error" in read) return { ...withCurrent, action: "refused", backup: null, reason: `${base.file} can't be read: ${read.error}`, snippet: snippet(agent, launch) };
  if (how.edit && plain) return { ...withCurrent, action, method: "json" };
  return { ...withCurrent, action: "manual", backup: null, reason: manualReason(agent, cli, plain), snippet: snippet(agent, launch) };
}

export function applySetup(plan: SetupPlan, request: SetupRequest): SetupPlan {
  const { where } = request;
  const agents = plan.agents.map((p): AgentPlan => {
    if (!["add", "update", "remove"].includes(p.action) || !p.method) return p;
    const agent = AGENTS.find((a) => a.id === p.id) as Agent;
    const fail = (error: string): AgentPlan => ({ ...p, result: "failed", error });
    const unsafe = pathProblem(p.file, where.home); // again: the folder may have changed since the plan
    if (unsafe) return fail(unsafe);
    try {
      if (p.backup && existsSync(p.file)) copyFileSync(p.file, p.backup, 1 /* COPYFILE_EXCL: never overwrite a backup */);
    } catch (error) {
      return fail(`Couldn't write the backup ${p.backup}: ${(error as Error).message}`);
    }
    const wanted = p.action === "remove" ? null : plan.launch;
    if (p.method === "cli") {
      const cli = onPath(agent.cli, where)[0];
      const how = CLI[agent.id];
      const steps = [...(p.action !== "add" && how.remove ? [how.remove] : []), ...(wanted && how.add ? [how.add(wanted)] : [])];
      for (const args of steps) {
        const run = runCli(cli, args, { env: where.env, platform: where.platform, cwd: where.home });
        if (run.status !== 0) return fail(`${agent.cli} ${args.slice(0, 2).join(" ")} failed (exit ${run.status}): ${redactText((run.stderr || run.stdout).trim().split("\n").slice(-3).join(" "))}`);
      }
    } else {
      try {
        const read = readConfig(p.file);
        if ("error" in read) return fail(read.error);
        const container = agent.format as Exclude<McpFormat, "codex-toml">;
        writeAtomically(p.file, setMember(read.text, [container, NAME], wanted ? { command: wanted.command, args: wanted.args } : undefined));
      } catch (error) {
        return fail((error as Error).message);
      }
    }
    // Read it back: the change is done only if the file says so.
    const after = readConfig(p.file);
    if ("error" in after) return fail(after.error);
    const check = after.text === null ? { entry: null } : mcpEntry(after.text, agent.format, NAME);
    if ("error" in check) return fail(`${p.file} can't be read after the change: ${check.error}`);
    if (wanted ? !check.entry || !same(check.entry, wanted) : check.entry) {
      return fail(`${agent.name} didn't record the entry as expected in ${p.file}.${wanted ? ` Its entry now: ${redactText(JSON.stringify(check.entry && { ...check.entry, args: redactArgs(check.entry.args) }))}.` : ""}`);
    }
    return { ...p, result: "done" };
  });
  const root = ROOT(request);
  const skill = plan.skill && applySkill(plan.skill, {
    source: request.skillSource ?? SKILL_SOURCE, shared: plan.skill.shared.path, claude: plan.skill.claude?.path ?? null,
    root, remove: request.remove, stamp: request.stamp, platform: where.platform, project: request.project !== undefined,
  });
  const hook = plan.hook && applyHook(plan.hook, root, hookTarget(request));
  return { ...plan, agents, skill, hook };
}

const same = (a: Pick<McpEntry, "command" | "args">, b: { command: string; args: string[] }) =>
  a.command === b.command && a.args.length === b.args.length && a.args.every((arg, i) => arg === b.args[i]);

function manualReason(agent: Agent, cli: string | undefined, plain: boolean): string {
  if (!cli && agent.id === "codex") return "the codex command isn't on PATH, and setup doesn't edit TOML itself";
  if (!cli && agent.id === "claude-code") return "the claude command isn't on PATH, and setup doesn't edit ~/.claude.json, which Claude Code rewrites while it runs";
  if (!plain) return "the file has comments or trailing commas, which setup doesn't edit";
  return "its CLI can't make this change";
}

// What the user pastes into the file: the entry in the file's own format. (A TOML basic string reads
// JSON's escapes, so JSON.stringify writes valid TOML strings.)
function snippet(agent: Agent, launch: { command: string; args: string[] }): string {
  if (agent.format === "codex-toml") return `[mcp_servers.${NAME}]\ncommand = ${JSON.stringify(launch.command)}\nargs = ${JSON.stringify(launch.args)}`;
  return JSON.stringify({ [agent.format]: { [NAME]: { command: launch.command, args: launch.args } } }, null, 2);
}
