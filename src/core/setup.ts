// repomagpie setup (decision 0035): a plan per agent, then applying it. The MCP entry through the
// agent's own CLI where it has one, otherwise a round-trip-safe edit of plain JSON, otherwise a
// snippet for the user to paste; then the skill (setup-skill.ts), the Claude Code hook
// (setup-hook.ts) and the other agents' hooks (setup-agent-hooks.ts, decision 0036). A backup
// before every change; never through a link, never outside the home
// folder (or the project, with --project); nothing that weakens an agent's safety (no trust or
// auto-approve key is written). Never prints, never prompts.
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./agent-cli.ts";
import { AGENTS, foundBy, mcpEntry, onPath, readJsonc, type Agent, type Found, type McpEntry, type McpFormat, type Where } from "./agents.ts";
import { backupName, pathProblem, readConfig, writeAtomically } from "./config-write.ts";
import { setMember } from "./json-edit.ts";
import { redactArgs, redactText } from "./redact.ts";
import { ALLOW_WRITE, noteTool, type Launch } from "./launch.ts";
import { applyAgentHook, HOOK_SPECS, planAgentHook, type AgentHookPlan, type AgentHookTarget } from "./setup-agent-hooks.ts";
import { applyHook, planHook, type HookPlan, type HookTarget } from "./setup-hook.ts";
import { applySkill, planSkill, type SkillPlan, type SkillRequest } from "./setup-skill.ts";

// The package's skill: beside dist/ in the package, beside src/ in the repository.
export const SKILL_SOURCE = fileURLToPath(new URL("../../skills/repomagpie/", import.meta.url));

export const NAME = "repomagpie";

export type Action = "add" | "update" | "keep" | "remove" | "manual" | "refused" | "skip";

export interface AgentPlan {
  id: Agent["id"];
  name: string;
  installed: boolean;
  found: Found | null; // how it was found: its command, its app, or only its folder
  file: string; // the file that holds its MCP entry
  action: Action;
  method: "cli" | "json" | null; // how an add, update or remove is made
  reason: string | null; // why manual, refused or skip
  current: { command: string | null; args: string[] } | null; // the entry there now
  // The note tool (--allow-write) in the entry now (null: no entry yet) and after this run; null
  // when the entry is removed or can't be planned.
  note_tool: { from: boolean | null; to: boolean } | null;
  backup: string | null; // the backup an add, update or remove writes first
  snippet: string | null; // for manual: what to paste, or the command to run
  result?: "done" | "failed"; // after applying
  error?: string;
}

export interface SetupPlan {
  remove: boolean;
  project: string | null; // --project: where the skill and the hook go
  launch: { command: string; args: string[] } | null; // the entry a new agent gets
  launch_error: string | null;
  agents: AgentPlan[]; // the MCP entries, always in the user's settings
  skill: SkillPlan | null; // when any agent is set up
  hook: HookPlan | null; // when Claude Code is set up
  hooks: AgentHookPlan[]; // the other agents' hooks, for each one set up that has a hook (decision 0036)
}

export interface SetupRequest {
  where: Where;
  launch: Launch;
  // --allow-write (true), --no-allow-write (false) or the user's answer; left out, each entry keeps
  // its own and a new one starts without the note tool.
  noteTool?: boolean;
  remove: boolean;
  // --agents; default: every agent found by its command or app, and with remove every agent found,
  // since an earlier setup may have written to one found by its folder only.
  only?: Agent["id"][];
  stamp: string; // for backup names: YYYYMMDD-HHMMSSZ, in UTC
  project?: string; // --project: the project root, for the skill and the hook
  skillSource?: string; // default: the package's
}

// The agent CLIs' commands (docs/agents.md). VS Code's CLI can add but not remove.
const CLI: Record<Agent["id"], { add?: (l: { command: string; args: string[] }) => string[]; remove?: string[]; edit: boolean }> = {
  "claude-code": { add: (l) => ["mcp", "add", "--scope", "user", "--transport", "stdio", NAME, "--", l.command, ...l.args], remove: ["mcp", "remove", "--scope", "user", NAME], edit: false },
  codex: { add: (l) => ["mcp", "add", NAME, "--", l.command, ...l.args], remove: ["mcp", "remove", NAME], edit: false },
  // Gemini CLI's command comes before --: what follows -- only joins its args.
  gemini: { add: (l) => ["mcp", "add", "--scope", "user", NAME, l.command, "--", ...l.args], remove: ["mcp", "remove", "--scope", "user", NAME], edit: true },
  cursor: { edit: true },
  vscode: { add: (l) => ["--add-mcp", JSON.stringify({ name: NAME, command: l.command, args: l.args })], edit: true },
  antigravity: { edit: true },
  copilot: { add: (l) => ["mcp", "add", NAME, "--", l.command, ...l.args], remove: ["mcp", "remove", NAME], edit: true },
};

// The entry as a JSON edit writes it. Copilot CLI's file names the type and the tools, as its docs
// show (`copilot mcp add` gives every tool by default).
const jsonEntry = (id: Agent["id"], l: { command: string; args: string[] }) =>
  id === "copilot" ? { type: "local", command: l.command, args: l.args, tools: ["*"] } : { command: l.command, args: l.args };

export function planSetup(request: SetupRequest): SetupPlan {
  const { where } = request;
  const launch = "error" in request.launch ? null : noteTool(request.launch, request.noteTool === true);
  const plan: SetupPlan = { remove: request.remove, project: request.project ?? null, launch, launch_error: "error" in request.launch ? request.launch.error : null, agents: [], skill: null, hook: null, hooks: [] };
  for (const agent of AGENTS) {
    const found = foundBy(agent, where);
    const installed = found !== null;
    const file = agent.mcpFile(where);
    const base: AgentPlan = { id: agent.id, name: agent.name, installed, found, file, action: "skip", method: null, reason: null, current: null, note_tool: null, backup: null, snippet: null };
    if (request.only ? !request.only.includes(agent.id) : !found || (found.by === "folder" && !request.remove)) {
      if (!request.only) plan.agents.push({ ...base, reason: found ? `found ${found.path} only` : "not installed" });
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
  if (chosen.length) plan.skill = planSkill(skillRequest(request, plan));
  if (claude) plan.hook = planHook(join(root, ".claude", "settings.json"), root, request.remove, request.stamp, hookTarget(request));
  // The other agents' hooks: always in the user's settings, as the MCP entries are.
  for (const spec of HOOK_SPECS.filter((s) => chosen.some((a) => a.id === s.id))) {
    const hook = planAgentHook(spec, where, request.remove, request.stamp, agentHookTarget(request));
    // Gemini CLI's hook is in the file its MCP entry is in: a second backup in this run gets its own name.
    const mcp = chosen.find((a) => a.id === spec.id);
    if (hook.backup && hook.backup === mcp?.backup) hook.backup = `${hook.backup}-2`;
    plan.hooks.push(hook);
  }
  return plan;
}

// The skill's folders: Claude Code's link when it is set up, and Antigravity CLI's in the user's
// ~/.gemini/skills (in a project, Antigravity reads the project's .agents/skills).
function skillRequest(request: SetupRequest, plan: Pick<SetupPlan, "agents">): SkillRequest {
  const root = ROOT(request);
  const chosen = (id: Agent["id"]) => plan.agents.some((a) => a.id === id && a.action !== "skip");
  return {
    source: request.skillSource ?? SKILL_SOURCE, shared: join(root, ".agents", "skills", NAME), claude: chosen("claude-code") ? join(root, ".claude", "skills", NAME) : null,
    antigravity: chosen("antigravity") && request.project === undefined ? join(root, ".gemini", "skills", NAME) : null,
    root, remove: request.remove, stamp: request.stamp, platform: request.where.platform, project: request.project !== undefined,
  };
}

// The other agents' hook entries start what the MCP entry starts: its node and entry file.
function agentHookTarget(request: SetupRequest): AgentHookTarget {
  if ("error" in request.launch) return { error: request.launch.error };
  return { node: request.launch.command, entry: request.launch.args[1] };
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
  const plain = isPlain(agent, text);
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
  // The note tool: as asked, else as the entry has it now; a new entry starts without it.
  const from = entry ? entry.args.includes(ALLOW_WRITE) : null;
  const tool = { from, to: request.noteTool ?? from ?? false };
  const wanted = noteTool(launch, tool.to);
  const planned = { ...withCurrent, note_tool: tool };
  if (entry && same(entry, wanted)) return { ...planned, action: "keep", backup: null };
  const action: Action = current ? "update" : "add";
  const method = writeMethod(agent, cli, plain, current !== null);
  if (method === "cli") return { ...planned, action, method };
  if ("error" in read) return { ...planned, action: "refused", backup: null, reason: `${base.file} can't be read: ${read.error}`, snippet: snippet(agent, wanted) };
  if (method === "json") return { ...planned, action, method };
  return { ...planned, action: "manual", backup: null, reason: manualReason(agent, cli, plain), snippet: snippet(agent, wanted) };
}

// The JSON file has no comments, trailing commas or a key written twice (Codex's TOML is never edited).
const isPlain = (agent: Agent, text: string | null) =>
  text === null || agent.format === "codex-toml" || (() => { const r = readJsonc(text); return !("error" in r) && r.plain; })();

// How setup adds or updates an entry: through the agent's CLI (an update needs it to remove the old
// entry first), by a JSON edit, or not at all (by hand).
function writeMethod(agent: Agent, cli: string | undefined, plain: boolean, hasEntry: boolean): "cli" | "json" | null {
  const how = CLI[agent.id];
  if (cli && how.add && (!hasEntry || how.remove)) return "cli";
  return how.edit && plain ? "json" : null;
}

// Why setup can only print this agent's entry for the user to paste, or null when it writes the entry
// itself; for doctor's to-dos (decision 0035), which then name the action that works. `text` is the
// file's text, null when it doesn't exist.
export function mcpByHand(agent: Agent, where: Where, text: string | null, hasEntry: boolean): string | null {
  const unsafe = pathProblem(agent.mcpFile(where), where.home);
  if (unsafe) return unsafe.replace(/\.$/, "");
  const cli = onPath(agent.cli, where)[0];
  const plain = isPlain(agent, text);
  return writeMethod(agent, cli, plain, hasEntry) ? null : manualReason(agent, cli, plain);
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
    const wanted = p.action === "remove" || !plan.launch ? null : noteTool(plan.launch, p.note_tool?.to ?? false);
    if (p.method === "cli") {
      const cli = onPath(agent.cli, where)[0];
      const how = CLI[agent.id];
      const steps = [...(p.action !== "add" && how.remove ? [how.remove] : []), ...(wanted && how.add ? [how.add(wanted)] : [])];
      for (const args of steps) {
        const run = runCli(cli, args, { env: where.env, platform: where.platform, cwd: where.home });
        // The first lines: a CLI puts its error there, and its help after.
        const said = (run.stderr || run.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" ");
        if (run.status !== 0) return fail(`${agent.cli} ${args.slice(0, 2).join(" ")} failed (exit ${run.status}): ${redactText(said)}`);
      }
    } else {
      try {
        const read = readConfig(p.file);
        if ("error" in read) return fail(read.error);
        const container = agent.format as Exclude<McpFormat, "codex-toml">;
        writeAtomically(p.file, setMember(read.text, [container, NAME], wanted ? jsonEntry(agent.id, wanted) : undefined));
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
  const skill = plan.skill && applySkill(plan.skill, skillRequest(request, plan));
  const hook = plan.hook && applyHook(plan.hook, ROOT(request), hookTarget(request));
  const hooks = plan.hooks.map((h) => applyAgentHook(h, HOOK_SPECS.find((s) => s.id === h.id) as (typeof HOOK_SPECS)[number], where, request.stamp, agentHookTarget(request)));
  return { ...plan, agents, skill, hook, hooks };
}

const same = (a: Pick<McpEntry, "command" | "args">, b: { command: string; args: string[] }) =>
  a.command === b.command && a.args.length === b.args.length && a.args.every((arg, i) => arg === b.args[i]);

function manualReason(agent: Agent, cli: string | undefined, plain: boolean): string {
  if (!cli && agent.id === "codex") return "the codex command isn't on PATH, and setup doesn't edit TOML itself";
  if (!cli && agent.id === "claude-code") return "the claude command isn't on PATH, and setup doesn't edit ~/.claude.json, which Claude Code rewrites while it runs";
  if (!plain) return "the file has comments, trailing commas or a key written twice, which setup doesn't edit";
  return "its CLI can't make this change";
}

// What the user pastes into the file: the entry in the file's own format. (A TOML basic string reads
// JSON's escapes, so JSON.stringify writes valid TOML strings.)
function snippet(agent: Agent, launch: { command: string; args: string[] }): string {
  if (agent.format === "codex-toml") return `[mcp_servers.${NAME}]\ncommand = ${JSON.stringify(launch.command)}\nargs = ${JSON.stringify(launch.args)}`;
  return JSON.stringify({ [agent.format]: { [NAME]: jsonEntry(agent.id, launch) } }, null, 2);
}
