// repomagpie doctor (decision 0035): the human output of core's runDoctor. Read-only, and exits 0
// whatever it finds, so its output can always go into a bug report.
import { runDoctor, type AgentHookEntry, type AgentReport, type DoctorJson } from "../core/doctor.ts";
import type { Platform } from "../core/agents.ts";
import { clean, cleanAll } from "../core/text.ts";
import { packageVersion } from "../core/version.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export async function doctorCommand(options: GlobalOptions, io: Io): Promise<number> {
  const { fetch: _fetch, today: _today, ...place } = contextOf(io, options);
  const report = runDoctor({ ...place, platform: process.platform as Platform, version: packageVersion(), node: { path: process.execPath, version: process.versions.node } });
  // Strings from config files and journals get markers for hidden characters, in --json too (decision 0032, rule 1).
  if (options.json) io.out(`${JSON.stringify(cleanAll(report))}\n`);
  else io.out(render(report, io.home));
  return 0;
}

// Sections in the order they are wired: the commands, the skill, the Claude Code hook, the other
// agents' hooks, each agent's MCP server, the journals; then what to do. Every line is cleaned (paths and commands come from other files).
export function render(r: DoctorJson, home: string): string {
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path);
  const lines = [`RepoMagpie ${r.version}, Node.js ${r.node.version} (${tilde(r.node.path)})`, ""];

  lines.push("Commands on PATH (the first one runs)");
  for (const { name, found } of r.commands) {
    if (!found.length) lines.push(`  ${name.padEnd(10)}  not found`);
    for (const [i, c] of found.entries()) {
      const what = c.ours ? `RepoMagpie ${c.version}` : c.package ? `another program: ${c.package} ${c.version}` : "another program";
      lines.push(`  ${(i ? "" : name).padEnd(10)}  ${tilde(c.path)}  ${what}`);
    }
  }

  lines.push("", "Skill");
  if (!r.skills.length) lines.push("  not installed");
  for (const s of r.skills) lines.push(`  ${tilde(s.path)}  ${s.version ? `version ${s.version}` : "version unknown"}${s.link ? `  (a link to ${tilde(s.link)})` : ""}`);

  lines.push("", "Claude Code hook");
  if (!r.hook.some((h) => h.entries.length)) lines.push("  none");
  for (const h of r.hook) {
    for (const e of h.entries) {
      const shown = [e.command, ...(e.args ?? [])].map((part) => tilde(part)).join(" ");
      const note = e.form === "old" ? "  (the old name)" : e.form === "exec" ? `  (node started directly${e.node_found && e.entry_found ? "" : "; a path is missing"}${e.code_generation_off ? ", code generation off" : ""})` : "";
      lines.push(`  ${tilde(h.file)}: ${shown}${note}`);
    }
    if (h.error) lines.push(`  ${tilde(h.file)}: can't be read: ${h.error}`);
  }

  lines.push("", "Hooks in other agents");
  for (const h of r.agent_hooks) {
    const off = h.off ? `  (${h.off.split(";")[0]})` : "";
    if (h.error) lines.push(`  ${h.name.padEnd(15)}  can't read ${tilde(h.file)}: ${h.error}`);
    else if (!h.entries.length) lines.push(`  ${h.name.padEnd(15)}  ${!h.found ? "not installed" : h.found.by === "folder" ? `none (found ${tilde(h.found.path)} only)` : "none"}${off}`);
    for (const e of h.entries) lines.push(`  ${h.name.padEnd(15)}  ${tilde(h.file)}: ${agentHookLine(e)}${off}`);
  }

  lines.push("", "MCP server in each agent");
  for (const a of r.agents) lines.push(`  ${a.name.padEnd(12)}  ${agentLine(a, tilde)}`);

  // Information, not a to-do: the first backup is the file as it was before setup, so only the user
  // decides when to delete them.
  lines.push("", "Backups from setup");
  if (!r.backups.length) lines.push("  none");
  for (const b of r.backups) lines.push(`  ${tilde(b.path)}  ${b.date.slice(0, 10)} ${b.date.slice(11, 16)} UTC`);
  if (r.backups.length) lines.push(`  Each is a whole copy of the file: those of ~${r.platform === "win32" ? "\\" : "/"}.claude.json can hold sign-in tokens and MCP servers' secrets. repomagpie setup --delete-backups deletes them, after asking; with --keep-latest it keeps the newest of each file.`);

  lines.push("", "Journals");
  for (const j of r.journals) {
    const state = j.exists ? `${j.notes} ${j.notes === 1 ? "note" : "notes"}${j.skipped.length ? `, ${j.skipped.length} skipped` : ""}${j.unreadable.length ? `, ${j.unreadable.length} unreadable` : ""}` : "doesn't exist yet";
    lines.push(`  ${j.scope.padEnd(8)}  ${tilde(j.path)}  ${state}`);
    for (const s of j.skipped) lines.push(`            skipped: ${s}`);
    for (const u of j.unreadable) lines.push(`            unreadable: ${u}`);
  }
  if (!r.journals.some((j) => j.scope === "project")) lines.push("  project   none here");

  lines.push("");
  if (r.problems.length) lines.push("To do", ...r.problems.map((p) => `  - ${p}`));
  else lines.push("Everything is wired.");
  return `${lines.map((line) => clean(line)).join("\n")}\n`;
}

function agentHookLine(e: AgentHookEntry): string {
  const parts = [e.form === "setup" ? `node started directly${e.node_found && e.entry_found ? "" : ", a path is missing"}`
    : e.form === "name" ? `repomagpie through the shell${e.node_found ? "" : ", not found"}` : "runs RepoMagpie another way"];
  if (e.flags.length) parts.push(e.flags.join(" "));
  if (e.trust) parts.push(e.trust);
  return parts.join(", ");
}

function agentLine(a: AgentReport, tilde: (path: string) => string): string {
  if (a.error) return `can't read ${tilde(a.config)}: ${a.error}`;
  // Found by its folder only: setup doesn't choose it, so it isn't called installed.
  const state = a.found?.by === "folder" ? `found ${tilde(a.found.path)} only` : "installed";
  // Antigravity lists the servers from its own cache (docs/agents.md).
  if (!a.mcp && a.installed && a.id === "antigravity") return `${state}; no repomagpie entry in ${tilde(a.config)} (a removed entry can stay listed until ~/.gemini/antigravity-cli/mcp/ is cleared)`;
  if (!a.mcp) return a.installed ? `${state}; no repomagpie entry in ${tilde(a.config)}` : "not installed";
  const m = a.mcp;
  const parts = [`${tilde(m.command ?? "(no command)")}${m.node_found ? "" : " (missing)"}`];
  if (m.entry) parts.push(`${tilde(m.entry)}${m.entry_found ? "" : " (missing)"}`);
  if (m.version) parts.push(`version ${m.version}`);
  parts.push(m.code_generation_off ? "code generation off" : "code generation NOT off");
  if (m.allow_write) parts.push("note tool on");
  return `${a.installed ? "" : "not installed, but "}registered: ${parts.join(", ")}`;
}
