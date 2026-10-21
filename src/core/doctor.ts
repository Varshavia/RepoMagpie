// repomagpie doctor (decision 0035): what is wired and what isn't, for the user and for a bug
// report. Read-only: it writes nothing, not even a cache. Values from config files' `env` never
// appear, only their names. Never prints.
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { AGENTS, claudeSettings, isInstalled, mcpEntry, onPath, packageOf, readJsonc, skillFolders, type Agent, type McpEntry, type Platform, type Where } from "./agents.ts";
import { findProjectJournal, homeJournal, resolvePersonalJournal, samePath, type Place } from "./journals.ts";
import { NO_CODEGEN } from "./launch.ts";
import { backupsOf, CONFIG_LIMIT } from "./config-write.ts";
import { redactArgs, redactText } from "./redact.ts";
import { findHooks } from "./setup-hook.ts";
import { findAgentHooks, HOOK_SPECS, type HookSpec } from "./setup-agent-hooks.ts";
import { codexHookHash, codexHooksOff, codexTrust } from "./codex-hooks.ts";
import { readNote } from "./note.ts";
import { noteSignature } from "./note-cache.ts";

export interface DoctorRequest extends Place {
  platform: Platform;
  version: string; // this CLI's version
  node: { path: string; version: string }; // the Node.js running it
}

export interface Command {
  path: string;
  package: string | null; // the npm package the file runs, when it names one
  version: string | null;
  ours: boolean;
}

export interface HookEntry {
  matcher: string | null;
  command: string;
  args: string[] | null; // the exec form's arguments; null for the shell form
  // exec: node started directly (what setup writes in the user's settings); shell: `repomagpie hook
  // claude-code`; old: `magpie hook claude-code`; other: anything else that runs our hook.
  form: "exec" | "shell" | "old" | "other";
  // For the exec form, as for an MCP entry: whether its node and entry file exist, and whether node
  // gets --disallow-code-generation-from-strings before the script. null for the other forms.
  node_found: boolean | null;
  entry_found: boolean | null;
  code_generation_off: boolean | null;
}

export interface AgentReport {
  id: Agent["id"];
  name: string;
  installed: boolean; // its marker exists (agents.ts), or its command is on PATH
  config: string; // the file that holds its MCP entry
  mcp: (McpEntry & { allow_write: boolean; code_generation_off: boolean; node_found: boolean; entry: string | null; entry_found: boolean; version: string | null }) | null;
  error?: string; // the file exists but can't be read
}

// A hook entry in another agent's file (decision 0036), read as setup writes it.
export interface AgentHookEntry {
  // setup: node started directly, only when it and the entry file exist (what setup writes);
  // name: `repomagpie hook <agent>` through the shell; other: anything else that runs our hook.
  form: "setup" | "name" | "other";
  command: string;
  node: string | null; // for the name form, the program it starts (repomagpie.cmd)
  entry: string | null;
  // For the setup form, whether its node and entry file exist; for the name form, whether its
  // program is on PATH (node_found). null otherwise.
  node_found: boolean | null;
  entry_found: boolean | null;
  flags: string[];
  // Codex CLI only: the trust Codex keeps for this entry in config.toml. null for other agents, or
  // when config.toml can't be read.
  trust: "trusted" | "not trusted" | "changed since trusted" | "turned off" | null;
}

export interface AgentHookReport {
  id: Agent["id"];
  name: string;
  installed: boolean;
  file: string;
  entries: AgentHookEntry[];
  off: string | null; // the agent's hooks are turned off, which setup leaves as it is
  error?: string; // the file exists but can't be read
}

export interface JournalReport {
  scope: "personal" | "project";
  path: string;
  exists: boolean;
  notes: number;
  skipped: string[]; // links and files over 256 KB (decision 0032), and why
  unreadable: string[]; // notes whose frontmatter can't be read
}

export interface DoctorJson {
  version: string;
  node: { path: string; version: string };
  platform: Platform;
  commands: { name: "repomagpie" | "magpie"; found: Command[] }[]; // the first one found runs
  skills: { path: string; link: string | null; version: string | null }[]; // the folders that exist
  hook: { file: string; entries: HookEntry[]; error?: string }[]; // the settings files that exist
  agent_hooks: AgentHookReport[]; // Codex CLI, Cursor, Gemini CLI, Antigravity CLI and Copilot CLI
  agents: AgentReport[];
  backups: { path: string; date: string }[]; // setup's backups, for the user to delete; never a problem
  journals: JournalReport[];
  problems: string[]; // what to do, one sentence each
}


export function runDoctor(request: DoctorRequest): DoctorJson {
  const where: Where = { home: request.home, env: request.env, platform: request.platform };
  const problems: string[] = [];
  const tilde = (path: string) => (path.startsWith(request.home) ? `~${path.slice(request.home.length)}` : path);

  // Commands on PATH.
  const commands = (["repomagpie", "magpie"] as const).map((name) => ({
    name,
    found: onPath(name, where).map((path): Command => {
      const pkg = packageOf(path);
      return { path, package: pkg?.name ?? null, version: pkg?.version ?? null, ours: pkg?.name === "repomagpie" };
    }),
  }));
  const [repomagpie, magpie] = commands.map((c) => c.found[0]);
  if (!repomagpie) problems.push("repomagpie isn't on PATH. Install it with npm install -g repomagpie.");
  else if (!repomagpie.ours) problems.push(`repomagpie on PATH runs another program (${repomagpie.path}). Agents that start repomagpie by name run it.`);
  else if (repomagpie.version !== request.version) problems.push(`repomagpie on PATH is version ${repomagpie.version}; this is ${request.version}.`);
  if (magpie && !magpie.ours) problems.push(`magpie on PATH runs another program (${magpie.path}), not RepoMagpie. Use repomagpie; hooks and skills already do.`);

  // The skill.
  const skills = skillFolders(where).filter((path) => existsSync(join(path, "SKILL.md"))).map((path) => ({ path, link: linkTarget(path), version: skillVersion(join(path, "SKILL.md")) }));
  if (!skills.length) problems.push("The skill isn't installed. Run repomagpie setup.");
  for (const skill of skills) {
    if (skill.version !== null && skill.version !== request.version) problems.push(`The skill in ${tilde(skill.path)} is version ${skill.version}; the CLI is ${request.version}. Run repomagpie setup.`);
  }

  // The Claude Code hook.
  // Run in the home folder, ~/.claude/settings.json is the user's settings and the project's: listed once.
  const hookFiles = [claudeSettings(where), ...projectSettings(request).filter((file) => !samePath(file, claudeSettings(where)))].filter((file) => existsSync(file));
  const hook = hookFiles.map((file) => {
    const read = readConfig(file);
    if ("error" in read) return { file, entries: [], error: redactText(read.error) };
    const parsed = readJsonc(read.text);
    return "error" in parsed ? { file, entries: [], error: parsed.error } : { file, entries: hookEntries(parsed.value, where) };
  });
  const userSettings = claudeSettings(where);
  for (const { file, entries, error } of hook) {
    if (error) problems.push(`Couldn't read ${tilde(file)}: ${error}.`);
    if (entries.some((e) => e.form === "old")) problems.push(`The Claude Code hook in ${tilde(file)} runs magpie hook claude-code, the old name. Run repomagpie setup to change it.`);
    if (file === userSettings && entries.some((e) => e.form === "shell")) problems.push(`The Claude Code hook in ${tilde(file)} starts through a shell, which takes about 190 ms longer on Windows. Run repomagpie setup to start node directly.`);
    for (const e of entries.filter((x) => x.form === "exec")) {
      if (!e.node_found || !e.entry_found) problems.push(`The Claude Code hook in ${tilde(file)} starts ${!e.node_found ? e.command : e.args?.find((a) => /\.[cm]?js$/.test(a)) ?? "(no entry file)"}, which doesn't exist. Run repomagpie setup again.`);
      else if (!e.code_generation_off) problems.push(`The Claude Code hook in ${tilde(file)} doesn't start node with ${NO_CODEGEN}. Run repomagpie setup again.`);
    }
  }

  // The other agents' hooks. A broken Copilot CLI hook goes first: Copilot CLI denies every tool
  // call when a hook fails, which setup's entry avoids only while its paths exist.
  const agentHooks = HOOK_SPECS.map((spec) => agentHookReport(spec, where));
  for (const h of agentHooks) {
    for (const e of h.entries) {
      // No node in setup's form: Antigravity CLI's launcher (the entry's command) is missing or not ours.
      const missing = e.form === "setup" ? (!e.node_found ? e.node ?? e.command : !e.entry_found ? e.entry : null) : e.form === "name" && !e.node_found ? e.node : null;
      if (missing) {
        const what = e.form === "setup" ? "so it does nothing. Run repomagpie setup again." : h.id === "copilot" ? "so Copilot CLI denies every tool call. Run repomagpie setup again." : "so it fails on every shell command. Run repomagpie setup again.";
        const line = `The ${h.name} hook in ${tilde(h.file)} starts ${missing}, which isn't there, ${what}`;
        if (h.id === "copilot") problems.unshift(line);
        else problems.push(line);
      } else if (e.form === "name") problems.push(`The ${h.name} hook in ${tilde(h.file)} starts repomagpie through the shell. Run repomagpie setup to start node directly.`);
      if (e.trust === "not trusted") problems.push("Codex CLI skips RepoMagpie's hook until you trust it: open /hooks in Codex and trust it.");
      if (e.trust === "changed since trusted") problems.push("RepoMagpie's hook changed since you trusted it, so Codex CLI skips it: open /hooks in Codex and trust it again.");
    }
    if (h.error) problems.push(`Couldn't read ${h.name}'s ${tilde(h.file)}: ${h.error}.`);
  }

  // Each agent's MCP entry.
  const agents = AGENTS.map((agent): AgentReport => {
    const config = agent.mcpFile(where);
    const installed = isInstalled(agent, where);
    const report: AgentReport = { id: agent.id, name: agent.name, installed, config, mcp: null };
    if (!existsSync(config)) return report;
    const read = readConfig(config);
    const found = "error" in read ? read : mcpEntry(read.text, agent.format, "repomagpie");
    if ("error" in found) return { ...report, error: redactText(found.error) };
    if (!found.entry) return report;
    const entry = found.entry;
    const script = entry.args.find((arg) => /\.[cm]?js$/.test(arg)) ?? null;
    const pkg = script && existsSync(script) ? packageOf(script) : null;
    return {
      ...report,
      mcp: {
        // Shown with secrets redacted; the checks below use the real values.
        command: entry.command === null ? null : redactText(entry.command),
        args: redactArgs(entry.args),
        env_keys: entry.env_keys,
        allow_write: entry.args.includes("--allow-write"),
        // node's flag before the script: the server can't run generated code (decision 0034).
        code_generation_off: script !== null && entry.args.indexOf(NO_CODEGEN) >= 0 && entry.args.indexOf(NO_CODEGEN) < entry.args.indexOf(script),
        node_found: entry.command !== null && (isAbsolute(entry.command) ? isFile(entry.command) : onPath(entry.command, where).length > 0),
        entry: script,
        entry_found: script !== null && isFile(script),
        version: pkg?.name === "repomagpie" ? pkg.version : null,
      },
    };
  });
  for (const agent of agents) {
    if (agent.error) problems.push(`Couldn't read ${agent.name}'s ${tilde(agent.config)}: ${agent.error}.`);
    else if (agent.installed && !agent.mcp) problems.push(`${agent.name} has no repomagpie MCP server. Run repomagpie setup.`);
    else if (agent.mcp && (!agent.mcp.node_found || !agent.mcp.entry_found)) {
      const missing = !agent.mcp.node_found ? agent.mcp.command ?? "(no command)" : agent.mcp.entry ?? "(no entry file)";
      problems.push(`${agent.name}'s repomagpie MCP server starts ${missing}, which doesn't exist. Run repomagpie setup again.`);
    } else if (agent.mcp?.version && agent.mcp.version !== request.version) problems.push(`${agent.name}'s repomagpie MCP server runs version ${agent.mcp.version}; this is ${request.version}. Run repomagpie setup again.`);
    else if (agent.mcp && !agent.mcp.code_generation_off) problems.push(`${agent.name}'s repomagpie MCP server doesn't start node with ${NO_CODEGEN}. Run repomagpie setup again.`);
  }

  // Setup's backups: beside each file it edits, and beside the skills folders (setup-skill.ts).
  const backedUp = [...AGENTS.map((agent) => agent.mcpFile(where)), claudeSettings(where), ...HOOK_SPECS.map((spec) => spec.file(where)),
    join(request.home, ".agents", "repomagpie-skill"), join(request.home, ".claude", "repomagpie-skill"), join(request.home, ".gemini", "repomagpie-skill")];
  const backups = [...new Set(backedUp)].flatMap((file) => backupsOf(file, request.home));

  // The journals.
  const personal = resolvePersonalJournal({ home: request.home, env: request.env, cwd: request.cwd, flag: request.homeFlag });
  const project = findProjectJournal({ cwd: request.cwd, home: request.home, personalJournal: personal.path, flag: request.projectFlag });
  const journals = [journalReport("personal", personal.path)];
  if (project && !samePath(project, personal.path) && !samePath(project, homeJournal(request.home))) journals.push(journalReport("project", project));
  for (const j of journals) {
    if (j.skipped.length) problems.push(`${j.skipped.length} ${j.skipped.length === 1 ? "file" : "files"} skipped in the ${j.scope} journal (${tilde(j.path)}).`);
    if (j.unreadable.length) problems.push(`${j.unreadable.length} ${j.unreadable.length === 1 ? "note has" : "notes have"} frontmatter that can't be read in the ${j.scope} journal.`);
  }

  return { version: request.version, node: request.node, platform: request.platform, commands, skills, hook, agent_hooks: agentHooks, agents, backups, journals, problems };
}

// An agent's hook entries, read as setup reads them (setup-agent-hooks.ts), with their paths checked
// and, for Codex CLI, the trust config.toml keeps for each.
function agentHookReport(spec: HookSpec, where: Where): AgentHookReport {
  const agent = AGENTS.find((a) => a.id === spec.id) as Agent;
  const file = spec.file(where);
  const report: AgentHookReport = { id: spec.id, name: agent.name, installed: isInstalled(agent, where), file, entries: [], off: spec.off?.(where) ?? null };
  if (!existsSync(file)) return report;
  const read = readConfig(file);
  const parsed = "error" in read ? read : readJsonc(read.text);
  if ("error" in parsed) return { ...report, error: redactText(parsed.error) };
  const found = findAgentHooks(spec, parsed.value, where.platform);
  if (typeof found === "string") return { ...report, error: found };
  const windows = where.platform === "win32";
  // Codex's config.toml, beside hooks.json: none means nothing is trusted yet; unreadable, unknown.
  const configToml = join(dirname(file), "config.toml");
  const tomlRead = spec.id !== "codex" ? null : existsSync(configToml) ? readConfig(configToml) : { text: "" };
  const toml = tomlRead && "text" in tomlRead ? tomlRead.text : null;
  report.entries = found.map((f): AgentHookEntry => {
    const command = String(spec.commandOf(f.value, where.platform));
    const program = f.parsed.form === "name" ? command.trim().replace(/^&\s*/, "").split(/\s+/)[0].replace(/^['"]|['"]$/g, "") : null;
    let trust: AgentHookEntry["trust"] = null;
    if (spec.id === "codex" && toml !== null) {
      const state = codexTrust(toml, file, f.group, f.handler, windows);
      trust = state && !state.enabled ? "turned off" : !state?.trusted_hash ? "not trusted" : state.trusted_hash === codexHookHash(f.matcher, f.value, windows) ? "trusted" : "changed since trusted";
    }
    return {
      form: f.parsed.form,
      command: redactText(command),
      node: f.parsed.node ?? program,
      entry: f.parsed.entry,
      node_found: f.parsed.form === "setup" ? f.parsed.node !== null && isFile(f.parsed.node) : program !== null ? (isAbsolute(program) ? isFile(program) : onPath(program.replace(/\.(cmd|ps1)$/i, ""), where).length > 0) : null,
      entry_found: f.parsed.form === "setup" ? f.parsed.entry !== null && isFile(f.parsed.entry) : null,
      flags: f.parsed.flags,
      trust,
    };
  });
  return report;
}

// Claude Code's project settings, in the project root (where a .claude/ folder is).
function projectSettings(request: DoctorRequest): string[] {
  return [join(request.cwd, ".claude", "settings.json"), join(request.cwd, ".claude", "settings.local.json")];
}

// Our hook entries, read as setup reads them (setup-hook.ts), with the exec form's paths checked.
function hookEntries(settings: unknown, where: Where): HookEntry[] {
  const found = findHooks(settings);
  // No hooks, no PreToolUse, or one that isn't a list: no entries. Found ones mean PreToolUse is a list.
  if (typeof found === "string" || !found.length) return [];
  const groups = (settings as { hooks: { PreToolUse: { matcher?: unknown }[] } }).hooks.PreToolUse;
  return found.map((f) => {
    const matcher = groups[f.group]?.matcher;
    const exec = f.form === "exec" && f.args !== null;
    const script = exec ? f.args?.find((a) => /\.[cm]?js$/.test(a)) ?? null : null;
    return {
      matcher: typeof matcher === "string" ? matcher : null,
      command: redactText(f.command),
      args: f.args && redactArgs(f.args),
      form: f.form,
      node_found: exec ? (isAbsolute(f.command) ? isFile(f.command) : onPath(f.command, where).length > 0) : null,
      entry_found: exec ? script !== null && isFile(script) : null,
      code_generation_off: exec ? script !== null && (f.args as string[]).indexOf(NO_CODEGEN) >= 0 && (f.args as string[]).indexOf(NO_CODEGEN) < (f.args as string[]).indexOf(script) : null,
    };
  });
}

function journalReport(scope: "personal" | "project", path: string): JournalReport {
  if (!existsSync(path)) return { scope, path, exists: false, notes: 0, skipped: [], unreadable: [] };
  const { files, skipped } = noteSignature(path);
  const unreadable = files.filter((file) => {
    try {
      return readNote(readFileSync(join(path, "notes", file), "utf8")).warnings.some((w) => w.startsWith("The frontmatter"));
    } catch {
      return true;
    }
  });
  return { scope, path, exists: true, notes: files.length, skipped, unreadable };
}

// A config file's text, or why it can't be read. A link is read: it is the user's own file.
function readConfig(file: string): { text: string } | { error: string } {
  try {
    if (statSync(file).size > CONFIG_LIMIT) return { error: `larger than ${CONFIG_LIMIT / 1024 / 1024} MB` };
    return { text: readFileSync(file, "utf8") };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

function skillVersion(file: string): string | null {
  try {
    const metadata = readNote(readFileSync(file, "utf8")).frontmatter.metadata as { version?: unknown } | undefined;
    return typeof metadata?.version === "string" ? metadata.version : null;
  } catch {
    return null;
  }
}

function linkTarget(path: string): string | null {
  try {
    if (!lstatSync(path).isSymbolicLink()) return null;
    try {
      return realpathSync(path);
    } catch {
      return readlinkSync(path);
    }
  } catch {
    return null;
  }
}

const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};
