// repomagpie doctor (decision 0035): the human output of core's runDoctor. Read-only, and exits 0
// whatever it finds, so its output can always go into a bug report.
import { runDoctor, type AgentReport, type DoctorJson } from "../core/doctor.ts";
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

// Sections in the order they are wired: the commands, the skill, the hook, each agent's MCP server,
// the journals; then what to do. Every line is cleaned (paths and commands come from other files).
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

  lines.push("", "MCP server in each agent");
  for (const a of r.agents) lines.push(`  ${a.name.padEnd(12)}  ${agentLine(a, tilde)}`);

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

function agentLine(a: AgentReport, tilde: (path: string) => string): string {
  if (a.error) return `can't read ${tilde(a.config)}: ${a.error}`;
  if (!a.mcp) return a.installed ? `installed; no repomagpie entry in ${tilde(a.config)}` : "not installed";
  const m = a.mcp;
  const parts = [`${tilde(m.command ?? "(no command)")}${m.node_found ? "" : " (missing)"}`];
  if (m.entry) parts.push(`${tilde(m.entry)}${m.entry_found ? "" : " (missing)"}`);
  if (m.version) parts.push(`version ${m.version}`);
  parts.push(m.code_generation_off ? "code generation off" : "code generation NOT off");
  if (m.allow_write) parts.push("note tool on");
  return `${a.installed ? "" : "not installed, but "}registered: ${parts.join(", ")}`;
}
