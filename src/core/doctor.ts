// repomagpie doctor (decision 0035): what is wired and what isn't, for the user and for a bug
// report. Read-only: it writes nothing, not even a cache. Values from config files' `env` never
// appear, only their names. Never prints.
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { AGENTS, claudeSettings, foundBy, mcpEntry, onPath, packageOf, readJsonc, skillFolders, type Agent, type Found, type McpEntry, type Platform, type Where } from "./agents.ts";
import { findProjectJournal, gitRoot, homeJournal, resolvePersonalJournal, samePath, usable, type Place } from "./journals.ts";
import { NO_CODEGEN } from "./launch.ts";
import { CONFIG_LIMIT, pathProblem } from "./config-write.ts";
import { setupBackups } from "./backups.ts";
import { redactArgs, redactText } from "./redact.ts";
import { mcpByHand, mcpRemovable } from "./setup.ts";
import { findHooks, lacksMonitor, PRE_TOOL_USE, STOP, type HookKind } from "./setup-hook.ts";
import { findAgentHooks, HOOK_SPECS, type HookSpec } from "./setup-agent-hooks.ts";
import { codexHookHash, codexHooksOff, codexTrust } from "./codex-hooks.ts";
import { DOMAIN_IDS, noteDomains } from "./domains.ts";
import { githubAuth, type GitHubAuth } from "./github-auth.ts";
import type { GitHubSource } from "./github-connection.ts";
import { readNote } from "./note.ts";
import { noteSignature } from "./note-cache.ts";

export interface DoctorRequest extends Place {
  github?: () => GitHubAuth; // the GitHub token's lookup (decision 0053); without it, the environment alone
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
  installed: boolean; // found: its command is on PATH, its app is there, or its marker exists (agents.ts)
  found: Found | null; // how; setup chooses only agents found by command or app
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
  found: Found | null;
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
  unknown_domains: { file: string; values: string[] }[]; // values of domains or domains_suggested outside the vocabulary (decision 0040), kept in the files
}

export interface DoctorJson {
  version: string;
  node: { path: string; version: string };
  platform: Platform;
  commands: { name: "repomagpie" | "magpie"; found: Command[] }[]; // the first one found runs
  skills: { path: string; link: string | null; version: string | null }[]; // the folders that exist
  hook: { file: string; entries: HookEntry[]; error?: string }[]; // the settings files that exist
  // The opt-in Stop reminder (decision 0042): its entries in the user's settings; [] when off.
  reminder: HookEntry[];
  agent_hooks: AgentHookReport[]; // Codex CLI, Cursor, Gemini CLI, Antigravity CLI and Copilot CLI
  agents: AgentReport[];
  backups: { path: string; date: string }[]; // setup's backups, which setup --delete-backups deletes; never a problem
  journals: JournalReport[];
  git_repository: boolean; // the working directory is in a git repository (not one at home), where a project journal could start
  github: { connected: boolean; source: GitHubSource | null }; // where the GitHub token comes from; never the token
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
  // setup keeps the shared folder current (not a link of the user's), and links Claude Code's and
  // Antigravity CLI's folders to it; it never writes the others.
  const [shared, claudeSkill, , , geminiSkill] = skillFolders(where);
  const sharedFolder = skills.find((s) => s.path === shared && !s.link) ? realpathSync(shared) : null;
  for (const skill of skills) {
    if (skill.version === null || skill.version === request.version) continue;
    const fix = skill.link && sharedFolder && samePath(skill.link, sharedFolder) ? "Run repomagpie setup."
      : skill.link ? "It is a link, which setup leaves: update the folder it points to, or delete the link and run repomagpie setup."
      : skill.path === shared ? "Run repomagpie setup."
        : skill.path === claudeSkill ? `Run ${setupFor("claude-code", foundBy(AGENTS[0], where))}.`
          : skill.path === geminiSkill ? `Run ${setupFor("antigravity", foundBy(AGENTS.find((a) => a.id === "antigravity") as Agent, where))}, or delete it if Antigravity CLI didn't put it there.`
            : `setup doesn't write that folder: update it the way you installed it (npx skills update), or delete it; the agents also read ${tilde(shared)}, which setup keeps current.`;
    problems.push(`The skill in ${tilde(skill.path)} is version ${skill.version}; the CLI is ${request.version}. ${fix}`);
  }

  // The Claude Code hook.
  // Run in the home folder, ~/.claude/settings.json is the user's settings and the project's: listed once.
  const hookFiles = [claudeSettings(where), ...projectSettings(request).filter((file) => !samePath(file, claudeSettings(where)))].filter((file) => existsSync(file));
  const plainHook = new Map<string, boolean>(); // false: setup gives a snippet instead of editing it
  const sharedMatcher = new Map<string, boolean>(); // our entry shares a group, whose matcher lacks Monitor, with another hook
  const hook = hookFiles.map((file) => {
    const read = readConfig(file);
    if ("error" in read) return { file, entries: [], error: redactText(read.error) };
    const parsed = readJsonc(read.text);
    if ("error" in parsed) return { file, entries: [], error: parsed.error };
    plainHook.set(file, parsed.plain);
    const found = findHooks(parsed.value);
    const groups = (parsed.value as { hooks?: Record<string, { matcher?: unknown }[]> } | null)?.hooks?.[PRE_TOOL_USE.event];
    if (typeof found !== "string") sharedMatcher.set(file, found.some((f) => f.form !== "other" && !f.alone && lacksMonitor(groups?.[f.group]?.matcher)));
    return { file, entries: hookEntries(parsed.value, where) };
  });
  const userSettings = claudeSettings(where);
  // The reminder lives in the user's settings only (setup never writes it in a project).
  const userRead = existsSync(userSettings) ? readConfig(userSettings) : null;
  const userParsed = userRead && !("error" in userRead) ? readJsonc(userRead.text) : null;
  const reminder = userParsed && !("error" in userParsed) ? hookEntries(userParsed.value, where, STOP) : [];
  // What fixes an entry in this file, as setup would: in the user's settings `setup`, in the
  // project's `setup --project .`; by hand where setup leaves the file (comments, a link) or never
  // writes it (settings.local.json). `why` says what the run does ("to change it", "again").
  const hookFix = (file: string, why: string): string => {
    if (basename(file) === "settings.local.json") return "Change it by hand: setup writes .claude/settings.json, never settings.local.json.";
    const project = file === userSettings ? "" : " --project .";
    const unsafe = pathProblem(file, file === userSettings ? request.home : request.cwd);
    const hand = unsafe ? unsafe.replace(/\.$/, "") : plainHook.get(file) === false ? COMMENTS : null;
    return hand ? `Change it by hand (${hand}); repomagpie setup --dry-run${project} --agents claude-code prints the entry.` : `Run repomagpie setup${project} ${why}.`;
  };
  for (const { file, entries, error } of hook) {
    if (error) problems.push(`Couldn't read ${tilde(file)}: ${error}.`);
    if (entries.some((e) => e.form === "old")) problems.push(`The Claude Code hook in ${tilde(file)} runs magpie hook claude-code, the old name. ${hookFix(file, "to change it")}`);
    // Monitor runs shell commands too. setup adds it to a group of ours alone, never to a shared one.
    if (entries.some((e) => e.form !== "other" && lacksMonitor(e.matcher))) {
      problems.push(`The Claude Code hook in ${tilde(file)} doesn't run on Claude Code's Monitor tool, which also runs shell commands. ${sharedMatcher.get(file) ? "Add Monitor to its matcher by hand: its group holds another hook too." : hookFix(file, "to add it")}`);
    }
    if (file === userSettings && entries.some((e) => e.form === "shell")) problems.push(`The Claude Code hook in ${tilde(file)} starts through a shell, which takes about 190 ms longer on Windows. ${hookFix(file, "to start node directly")}`);
    for (const e of entries.filter((x) => x.form === "exec")) {
      if (!e.node_found || !e.entry_found) problems.push(`The Claude Code hook in ${tilde(file)} starts ${!e.node_found ? e.command : e.args?.find((a) => /\.[cm]?js$/.test(a)) ?? "(no entry file)"}, which doesn't exist. ${hookFix(file, "again")}`);
      else if (!e.code_generation_off) problems.push(`The Claude Code hook in ${tilde(file)} doesn't start node with ${NO_CODEGEN}. ${hookFix(file, "again")}`);
    }
  }
  for (const e of reminder.filter((x) => x.form === "exec" && (!x.node_found || !x.entry_found))) {
    problems.push(`The Claude Code Stop reminder in ${tilde(userSettings)} starts ${!e.node_found ? e.command : e.args?.find((a) => /\.[cm]?js$/.test(a)) ?? "(no entry file)"}, which doesn't exist. ${hookFix(userSettings, "again")}`);
  }

  // The other agents' hooks. A broken Copilot CLI hook goes first: Copilot CLI denies every tool
  // call when a hook fails, which setup's entry avoids only while its paths exist.
  const plainAgentHook = new Map<Agent["id"], boolean>();
  const agentHooks = HOOK_SPECS.map((spec) => agentHookReport(spec, where, plainAgentHook));
  // What fixes an agent's hook entry, as setup would: setup, with --agents when the agent was found by
  // its folder only (setup doesn't choose it then); by hand where setup leaves the file (comments,
  // a link, the agent's hooks turned off).
  const hookByHand = (h: AgentHookReport): string | null => {
    const unsafe = pathProblem(h.file, request.home);
    return unsafe ? unsafe.replace(/\.$/, "") : h.off ? h.off.split(";")[0] : plainAgentHook.get(h.id) === false ? COMMENTS : null;
  };
  const agentHookFix = (h: AgentHookReport, why: string): string => {
    if (!h.found) return notFound(h.name, tilde(h.file));
    const hand = hookByHand(h);
    return hand ? `Change it by hand (${hand}); repomagpie setup --dry-run --agents ${h.id} prints the entry.` : `Run ${setupFor(h.id, h.found)} ${why}.`;
  };
  // An agent found by its folder only (decision 0038) may hold entries an earlier setup wrote, in an
  // agent the user no longer runs. Its problems are gathered into one to-do that names both ways
  // out: fix the entries (if you use it) or remove them (if you don't).
  const leftovers = new Map<Agent["id"], Leftover>();
  const leftover = (id: Agent["id"], name: string): Leftover => {
    if (!leftovers.has(id)) leftovers.set(id, { name, what: [], hook: false, mcp: false, trust: null, first: false });
    return leftovers.get(id) as Leftover;
  };
  for (const h of agentHooks) {
    const folder = h.found?.by === "folder" ? leftover(h.id, h.name) : null;
    for (const e of h.entries) {
      // No node in setup's form: Antigravity CLI's launcher (the entry's command) is missing or not ours.
      const missing = e.form === "setup" ? (!e.node_found ? e.node ?? e.command : !e.entry_found ? e.entry : null) : e.form === "name" && !e.node_found ? e.node : null;
      const problem = missing
        ? `The ${h.name} hook in ${tilde(h.file)} starts ${missing}, which isn't there, ${e.form === "setup" ? "so it does nothing." : h.id === "copilot" ? "so Copilot CLI denies every tool call." : "so it fails on every shell command."}`
        : e.form === "name" ? `The ${h.name} hook in ${tilde(h.file)} starts repomagpie through the shell.` : null;
      if (problem && folder) {
        folder.what.push(problem);
        folder.hook = true;
        folder.first ||= h.id === "copilot" && missing !== null;
      } else if (problem) {
        const line = `${problem} ${agentHookFix(h, missing ? "again" : "to start node directly")}`;
        if (h.id === "copilot" && missing) problems.unshift(line);
        else problems.push(line);
      }
      const trust = e.trust === "not trusted" ? "Codex CLI skips RepoMagpie's hook until you trust it"
        : e.trust === "changed since trusted" ? "RepoMagpie's hook changed since you trusted it, so Codex CLI skips it" : null;
      if (trust && folder) folder.trust = trust;
      else if (trust) problems.push(`${trust}: open /hooks in Codex and trust it${e.trust === "changed since trusted" ? " again" : ""}.`);
    }
    if (h.error) problems.push(`Couldn't read ${h.name}'s ${tilde(h.file)}: ${h.error}.`);
  }

  // Each agent's MCP entry.
  const texts = new Map<Agent["id"], string>(); // each MCP file's text, for what setup can do with it
  const agents = AGENTS.map((agent): AgentReport => {
    const config = agent.mcpFile(where);
    const by = foundBy(agent, where);
    const report: AgentReport = { id: agent.id, name: agent.name, installed: by !== null, found: by, config, mcp: null };
    if (!existsSync(config)) return report;
    const read = readConfig(config);
    if (!("error" in read)) texts.set(agent.id, read.text);
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
        node_found: entry.command !== null && (isAbsolute(entry.command) ? isFile(entry.command, where) : onPath(entry.command, where).length > 0),
        entry: script,
        entry_found: script !== null && isFile(script, where),
        version: pkg?.name === "repomagpie" ? pkg.version : null,
      },
    };
  });
  for (const agent of agents) {
    // What fixes it, as setup would: setup itself, or by hand where setup only prints the entry (Codex
    // CLI without its command, a file with comments). An agent found by its folder only and without
    // an entry is no to-do: setup doesn't choose it either.
    const hand = mcpByHand(AGENTS.find((a) => a.id === agent.id) as Agent, where, texts.get(agent.id) ?? null, agent.mcp !== null);
    const fix = !agent.found ? notFound(agent.name, tilde(agent.config))
      : hand ? `${agent.mcp ? "Replace the entry in" : "Paste the entry into"} ${tilde(agent.config)} by hand (${hand}); repomagpie setup --dry-run --agents ${agent.id} prints it.`
        : `Run ${setupFor(agent.id, agent.found)}${agent.mcp ? " again" : ""}.`;
    let problem: string | null = null;
    if (agent.error) problems.push(`Couldn't read ${agent.name}'s ${tilde(agent.config)}: ${agent.error}.`);
    else if (agent.found && agent.found.by !== "folder" && !agent.mcp) problem = `${agent.name} has no repomagpie MCP server.`;
    else if (agent.mcp && (!agent.mcp.node_found || !agent.mcp.entry_found)) {
      const missing = !agent.mcp.node_found ? agent.mcp.command ?? "(no command)" : agent.mcp.entry ?? "(no entry file)";
      problem = `${agent.name}'s repomagpie MCP server starts ${missing}, which doesn't exist.`;
    } else if (agent.mcp?.version && agent.mcp.version !== request.version) problem = `${agent.name}'s repomagpie MCP server runs version ${agent.mcp.version}; this is ${request.version}.`;
    else if (agent.mcp && !agent.mcp.code_generation_off) problem = `${agent.name}'s repomagpie MCP server doesn't start node with ${NO_CODEGEN}.`;
    if (problem && agent.found?.by === "folder") {
      const folder = leftover(agent.id, agent.name);
      folder.what.push(problem);
      folder.mcp = true;
    } else if (problem) problems.push(`${problem} ${fix}`);
  }

  // One to-do per agent found by its folder only, with both ways out, each by setup where setup can
  // (setup --remove edits the files setup would edit) and by hand where it can't.
  for (const [id, l] of leftovers) {
    if (!l.what.length && !l.trust) continue;
    const agent = AGENTS.find((a) => a.id === id) as Agent;
    const report = agents.find((a) => a.id === id) as AgentReport;
    const hook = agentHooks.find((h) => h.id === id);
    const trusting = id === "codex" ? ", then trust the hook in /hooks" : "";
    const use: string[] = [];
    const drop: string[] = [];
    let printed = false; // a by-hand step, which the dry run prints the entry for
    if (l.hook && hook) {
      const hand = hookByHand(hook);
      printed ||= hand !== null;
      use.push(hand ? `change the hook in ${tilde(hook.file)} by hand (${hand})${trusting}` : `run repomagpie setup --agents ${id}${trusting}`);
    } else if (l.trust) use.push("open /hooks in Codex and trust it");
    // A hook that only needs trusting goes the same way as a broken one.
    if ((l.hook || l.trust) && hook) {
      const keeps = pathProblem(hook.file, request.home) !== null || plainAgentHook.get(id) === false;
      drop.push(keeps ? `delete the hook entry in ${tilde(hook.file)} by hand` : `run repomagpie setup --remove --agents ${id}`);
    }
    if (l.mcp) {
      const text = texts.get(id) ?? null;
      const hand = mcpByHand(agent, where, text, true);
      printed ||= hand !== null;
      use.push(hand ? `replace the entry in ${tilde(report.config)} by hand (${hand})` : `run repomagpie setup --agents ${id}`);
      drop.push(mcpRemovable(agent, where, text) ? `run repomagpie setup --remove --agents ${id}` : `delete the repomagpie entry in ${tilde(report.config)} by hand`);
    }
    const what = [...l.what, ...(l.trust && !l.hook ? [`${l.trust}.`] : [])];
    const line = `${what.join(" ")} If you use ${l.name}: ${[...new Set(use)].join(", and ")}${printed ? `; repomagpie setup --dry-run --agents ${id} prints the entries` : ""}. If you don't: ${[...new Set(drop)].join(", and ")}.`;
    if (l.first) problems.unshift(line);
    else problems.push(line);
  }

  const backups = setupBackups(where);

  // The journals.
  const personal = resolvePersonalJournal({ home: request.home, env: request.env, cwd: request.cwd, flag: request.homeFlag });
  const project = findProjectJournal({ cwd: request.cwd, home: request.home, personalJournal: personal.path, flag: request.projectFlag });
  const journals = [journalReport("personal", personal.path)];
  if (project && !samePath(project, personal.path) && !samePath(project, homeJournal(request.home))) journals.push(journalReport("project", project));
  for (const j of journals) {
    if (j.skipped.length) problems.push(`${j.skipped.length} ${j.skipped.length === 1 ? "file" : "files"} skipped in the ${j.scope} journal (${tilde(j.path)}).`);
    if (j.unreadable.length) problems.push(`${j.unreadable.length} ${j.unreadable.length === 1 ? "note has" : "notes have"} frontmatter that can't be read in the ${j.scope} journal.`);
    for (const u of j.unknown_domains) problems.push(`Unknown domain in the ${j.scope} journal's ${u.file}: ${u.values.join(", ")}. Use one of: ${DOMAIN_IDS.join(", ")}.`);
  }

  const gitRepository = gitRoot(request.cwd, request.home) !== null; // as the project journal's walk decides

  // Information, not a to-do: RepoMagpie works without GitHub, only more slowly.
  const { source } = githubAuth(request);
  return { version: request.version, node: request.node, platform: request.platform, commands, skills, hook, reminder, agent_hooks: agentHooks, agents, backups, journals, git_repository: gitRepository, github: { connected: source !== null, source }, problems };
}

// An agent's hook entries, read as setup reads them (setup-agent-hooks.ts), with their paths checked
// and, for Codex CLI, the trust config.toml keeps for each. `plain` records whether setup would edit
// the file.
function agentHookReport(spec: HookSpec, where: Where, plain: Map<Agent["id"], boolean>): AgentHookReport {
  const agent = AGENTS.find((a) => a.id === spec.id) as Agent;
  const file = spec.file(where);
  const by = foundBy(agent, where);
  const report: AgentHookReport = { id: spec.id, name: agent.name, installed: by !== null, found: by, file, entries: [], off: spec.off?.(where) ?? null };
  if (!existsSync(file)) return report;
  const read = readConfig(file);
  const parsed = "error" in read ? read : readJsonc(read.text);
  if ("error" in parsed) return { ...report, error: redactText(parsed.error) };
  plain.set(spec.id, parsed.plain);
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
      node_found: f.parsed.form === "setup" ? f.parsed.node !== null && isFile(f.parsed.node, where) : program !== null ? (isAbsolute(program) ? isFile(program, where) : onPath(program.replace(/\.(cmd|ps1)$/i, ""), where).length > 0) : null,
      entry_found: f.parsed.form === "setup" ? f.parsed.entry !== null && isFile(f.parsed.entry, where) : null,
      flags: f.parsed.flags,
      trust,
    };
  });
  return report;
}

const COMMENTS = "it has comments, trailing commas or a key written twice, which setup doesn't edit";

// The setup command that chooses this agent: without --agents, setup chooses only agents found by
// their command or app.
const setupFor = (id: Agent["id"], found: Found | null) => `repomagpie setup${found?.by === "folder" ? ` --agents ${id}` : ""}`;

// An entry in the files of an agent that isn't found: setup skips that agent, even with --agents.
const notFound = (name: string, file: string) => `${name} isn't installed, so setup leaves its files: delete the entry in ${file} by hand, or install ${name} and run repomagpie setup.`;

// The problems with an agent's entries when it was found by its folder only, for one to-do.
interface Leftover {
  name: string;
  what: string[]; // each problem, a sentence without its fix
  hook: boolean; // the hook entry needs fixing
  mcp: boolean; // the MCP entry needs fixing
  trust: string | null; // Codex CLI skips the hook until it is trusted
  first: boolean; // Copilot CLI denies every tool call: the first to-do
}

// Claude Code's project settings, in the project root (where a .claude/ folder is).
function projectSettings(request: DoctorRequest): string[] {
  return [join(request.cwd, ".claude", "settings.json"), join(request.cwd, ".claude", "settings.local.json")];
}

// Our hook entries, read as setup reads them (setup-hook.ts), with the exec form's paths checked.
function hookEntries(settings: unknown, where: Where, kind: HookKind = PRE_TOOL_USE): HookEntry[] {
  const found = findHooks(settings, kind);
  // No hooks, no such event, or one that isn't a list: no entries. Found ones mean it is a list.
  if (typeof found === "string" || !found.length) return [];
  const groups = (settings as { hooks: Record<string, { matcher?: unknown }[]> }).hooks[kind.event];
  return found.map((f) => {
    const matcher = groups[f.group]?.matcher;
    const exec = f.form === "exec" && f.args !== null;
    const script = exec ? f.args?.find((a) => /\.[cm]?js$/.test(a)) ?? null : null;
    return {
      matcher: typeof matcher === "string" ? matcher : null,
      command: redactText(f.command),
      args: f.args && redactArgs(f.args),
      form: f.form,
      node_found: exec ? (isAbsolute(f.command) ? isFile(f.command, where) : onPath(f.command, where).length > 0) : null,
      entry_found: exec ? script !== null && isFile(script, where) : null,
      code_generation_off: exec ? script !== null && (f.args as string[]).indexOf(NO_CODEGEN) >= 0 && (f.args as string[]).indexOf(NO_CODEGEN) < (f.args as string[]).indexOf(script) : null,
    };
  });
}

function journalReport(scope: "personal" | "project", path: string): JournalReport {
  if (!existsSync(path)) return { scope, path, exists: false, notes: 0, skipped: [], unreadable: [], unknown_domains: [] };
  const { files, skipped } = noteSignature(path);
  const unreadable: string[] = [];
  const unknownDomains: JournalReport["unknown_domains"] = [];
  for (const file of files) {
    try {
      const note = readNote(readFileSync(join(path, "notes", file), "utf8"));
      if (note.warnings.some((w) => w.startsWith("The frontmatter"))) unreadable.push(file);
      const { unknown } = noteDomains(note.frontmatter);
      if (unknown.length) unknownDomains.push({ file, values: unknown });
    } catch {
      unreadable.push(file);
    }
  }
  return { scope, path, exists: true, notes: files.length, skipped, unreadable, unknown_domains: unknownDomains };
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

// A file a config names, unless it is on another machine outside the user's home: a project's
// settings are its committers', and looking there would send that machine the user's Windows sign-in
// hash. It counts as not found.
const isFile = (path: string, where: Where) => {
  if (!usable(path, where.home, where.platform)) return false;
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};
