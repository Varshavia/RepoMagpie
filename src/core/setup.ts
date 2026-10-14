// repomagpie setup, the MCP part (decision 0035): a plan per agent, then applying it. Through the
// agent's own CLI where it has one, otherwise a round-trip-safe edit of plain JSON, otherwise a
// snippet for the user to paste. A backup before every change; never through a link, never outside
// the home folder; nothing that weakens an agent's safety (no trust or auto-approve key is written).
// Never prints, never prompts.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { runCli } from "./agent-cli.ts";
import { AGENTS, mcpEntry, onPath, readJsonc, type Agent, type McpEntry, type McpFormat, type Where } from "./agents.ts";
import { setMember } from "./json-edit.ts";
import type { Launch } from "./launch.ts";

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
  launch: { command: string; args: string[] } | null;
  launch_error: string | null;
  agents: AgentPlan[];
}

export interface SetupRequest {
  where: Where;
  launch: Launch;
  remove: boolean;
  only?: Agent["id"][]; // --agents; default: every installed agent
  stamp: string; // for backup names: YYYYMMDD-HHMMSS
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
  const plan: SetupPlan = { remove: request.remove, launch, launch_error: "error" in request.launch ? request.launch.error : null, agents: [] };
  for (const agent of AGENTS) {
    const installed = existsSync(agent.folder(where)) || onPath(agent.cli, where).length > 0;
    const file = agent.mcpFile(where);
    const base: AgentPlan = { id: agent.id, name: agent.name, installed, file, action: "skip", method: null, reason: null, current: null, backup: null, snippet: null };
    if (request.only ? !request.only.includes(agent.id) : !installed) {
      if (!request.only) plan.agents.push({ ...base, reason: "not installed" });
      continue;
    }
    if (!installed) {
      plan.agents.push({ ...base, reason: `not installed: no ${agent.folder(where)} and no ${agent.cli} command` });
      continue;
    }
    plan.agents.push(planAgent(agent, base, request, launch));
  }
  return plan;
}

function planAgent(agent: Agent, base: AgentPlan, request: SetupRequest, launch: SetupPlan["launch"]): AgentPlan {
  const { where } = request;
  const refuse = (reason: string): AgentPlan => ({ ...base, action: "refused", reason });
  const unsafe = pathProblem(base.file, where.home);
  if (unsafe) return refuse(unsafe);

  const text = existsSync(base.file) ? readFileSync(base.file, "utf8") : null;
  const read = text === null ? { entry: null } : mcpEntry(text, agent.format, NAME);
  const plain = text === null || agent.format === "codex-toml" || (() => { const r = readJsonc(text); return !("error" in r) && r.plain; })();
  const current = "entry" in read && read.entry ? { command: read.entry.command, args: read.entry.args } : null;
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
  if (current && same(current, launch)) return { ...withCurrent, action: "keep", backup: null };
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
        if (run.status !== 0) return fail(`${agent.cli} ${args.slice(0, 2).join(" ")} failed (exit ${run.status}): ${(run.stderr || run.stdout).trim().split("\n").slice(-3).join(" ")}`);
      }
    } else {
      try {
        const text = existsSync(p.file) ? readFileSync(p.file, "utf8") : null;
        const container = agent.format as Exclude<McpFormat, "codex-toml">;
        writeAtomically(p.file, setMember(text, [container, NAME], wanted ? { command: wanted.command, args: wanted.args } : undefined));
      } catch (error) {
        return fail((error as Error).message);
      }
    }
    // Read it back: the change is done only if the file says so.
    const check = existsSync(p.file) ? mcpEntry(readFileSync(p.file, "utf8"), agent.format, NAME) : { entry: null };
    if ("error" in check) return fail(`${p.file} can't be read after the change: ${check.error}`);
    if (wanted ? !check.entry || !same(check.entry, wanted) : check.entry) {
      return fail(`${agent.name} didn't record the entry as expected in ${p.file}.${wanted ? ` Its entry now: ${JSON.stringify(check.entry)}.` : ""}`);
    }
    return { ...p, result: "done" };
  });
  return { ...plan, agents };
}

const same = (a: Pick<McpEntry, "command" | "args">, b: { command: string; args: string[] }) =>
  a.command === b.command && a.args.length === b.args.length && a.args.every((arg, i) => arg === b.args[i]);

// Why a config file can't be written: a link on its way from the home folder (decision 0032, rule
// 5), or a place outside the home folder. null when it can.
export function pathProblem(file: string, home: string): string | null {
  const inside = relative(resolve(home), resolve(file));
  if (!inside || inside.startsWith("..") || resolve(inside) === inside) return `${file} is outside your home folder; setup writes only inside it.`;
  let path = resolve(home);
  for (const part of inside.split(sep)) {
    path = join(path, part);
    try {
      if (lstatSync(path).isSymbolicLink()) return `${path} is a link; setup never writes through one.`;
    } catch {
      break; // doesn't exist yet: nothing below it does either
    }
  }
  return null;
}

function writeAtomically(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.repomagpie-${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text, { flag: "wx" });
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function backupName(file: string, stamp: string): string {
  let name = `${file}.repomagpie-backup-${stamp}`;
  for (let n = 2; existsSync(name); n++) name = `${file}.repomagpie-backup-${stamp}-${n}`;
  return name;
}

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
