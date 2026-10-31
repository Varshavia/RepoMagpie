import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DoctorJson } from "../core/doctor.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// repomagpie doctor (decision 0035): human output and --json, exit 0 whatever it finds.

const RTL = String.fromCharCode(0x202e);

function box() {
  const b = sandbox({ "bin/": null });
  const env = { MAGPIE_HOME: b.journal, PATH: join(b.root, "bin"), APPDATA: join(b.home, "AppData", "Roaming"), XDG_CONFIG_HOME: join(b.home, ".config") };
  return { ...b, env };
}

test("--json prints the report; human output has every section and what to do; exit 0 with problems", async () => {
  const b = box();
  mkdirSync(join(b.home, ".claude"), { recursive: true });
  writeFileSync(join(b.home, ".claude", "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "magpie hook claude-code" }] }] } }));
  const json = await magpie(b, ["doctor", "--json"], { env: b.env });
  assert.equal(json.code, 0);
  assert.equal(json.err, "");
  const report = JSON.parse(json.out);
  assert.deepEqual(Object.keys(report), ["version", "node", "platform", "commands", "skills", "hook", "reminder", "agent_hooks", "agents", "backups", "journals", "git_repository", "github", "problems"]);
  assert.equal(report.hook[0].entries[0].form, "old");
  assert.deepEqual(report.github, { connected: false, source: null }, "no token in the environment, no gh on PATH");
  assert.deepEqual(report.reminder, [], "the Stop reminder is off unless asked for");
  assert.deepEqual(report.agent_hooks.map((h: { id: string }) => h.id), ["codex", "cursor", "gemini", "antigravity", "copilot"]);

  const human = await magpie(b, ["doctor"], { env: b.env });
  assert.equal(human.code, 0);
  assert.match(human.out, /^Claude Code Stop reminder\n {2}off \(repomagpie setup --capture-reminder turns it on\)$/m);
  for (const heading of ["Commands on PATH (the first one runs)", "Skill", "Claude Code hook", "Hooks in other agents", "MCP server in each agent", "Backups from setup", "Journals", "GitHub: not connected, limited to 10 searches a minute.", "To do"]) {
    assert.ok(human.out.split(/\r?\n/).includes(heading), heading);
  }
  assert.match(human.out, /^ {2}~[\\/]\.claude[\\/]settings\.json: magpie hook claude-code {2}\(the old name\)$/m);
  // ~/.claude without the claude command: found by its folder only, so not called installed (decision 0038).
  assert.match(human.out, /^ {2}Claude Code {3}found ~[\\/]\.claude only; no repomagpie entry in ~[\\/]\.claude\.json$/m);
  assert.match(human.out, /^ {2}VS Code \(GitHub Copilot\) {2}not installed$/m);
  assert.match(human.out, /^ {2}- The Claude Code hook in ~[\\/]\.claude[\\/]settings\.json runs magpie hook claude-code, the old name\./m);
});

test("the Stop reminder on: its entry under its heading, and a to-do when its paths are gone; never mistaken for the hook", async () => {
  const b = box();
  mkdirSync(join(b.home, ".claude"), { recursive: true });
  const gone = join(b.root, "gone");
  writeFileSync(join(b.home, ".claude", "settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: join(gone, "node.exe"), args: [join(gone, "main.js"), "hook", "claude-code-stop"] }] }] } }));
  const report = JSON.parse((await magpie(b, ["doctor", "--json"], { env: b.env })).out);
  assert.equal(report.reminder.length, 1);
  assert.equal(report.reminder[0].form, "exec");
  assert.deepEqual(report.hook.flatMap((h: { entries: unknown[] }) => h.entries), [], "the reminder isn't the PreToolUse hook");
  assert.ok(report.problems.some((p: string) => p.startsWith("The Claude Code Stop reminder in ")), report.problems.join("\n"));
  const human = await magpie(b, ["doctor"], { env: b.env });
  assert.match(human.out, /^Claude Code Stop reminder\n {2}on: .*gone[\\/]node\.exe .*main\.js hook claude-code-stop {2}\(a path is missing\)$/m);
});

test("text from config files reaches the terminal with markers, never raw", async () => {
  const b = box();
  mkdirSync(join(b.home, ".cursor"), { recursive: true });
  writeFileSync(join(b.home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { repomagpie: { command: `node${RTL}exe`, args: ["x.js"] } } }));
  const human = await magpie(b, ["doctor"], { env: b.env });
  assert.ok(human.out.includes("node<U+202E>exe"), human.out);
  assert.ok(!human.out.includes(RTL));
  const json = await magpie(b, ["doctor", "--json"], { env: b.env });
  assert.equal(JSON.parse(json.out).agents.find((a: { id: string }) => a.id === "cursor").mcp.command, "node<U+202E>exe");
});

// Home is the scratch root here, so the walk stops there and never sees its .git fence.
test("journals: outside a git repository, a parent folder's .magpie is no project journal, and the line says to use --project", async () => {
  const b = box();
  mkdirSync(join(b.root, "shared", ".magpie", "notes"), { recursive: true });
  mkdirSync(join(b.root, "shared", "me"), { recursive: true });
  const outside = { env: b.env, home: b.root, cwd: join(b.root, "shared", "me") };
  const r = await magpie(b, ["doctor"], outside);
  assert.match(r.out, /^ {2}project {3}none here; outside a git repository, use --project <path>$/m);
  assert.ok(!/^ {2}- .*--project/m.test(r.out), "information, not a to-do");
  const json = JSON.parse((await magpie(b, ["doctor", "--json"], outside)).out);
  assert.deepEqual(json.journals.map((j: { scope: string }) => j.scope), ["personal"]);
  assert.match((await magpie(b, ["doctor", "--project", join(b.root, "shared")], outside)).out, /^ {2}project {2}.*\.magpie {2}0 notes$/m);
});

test("journals: in a git repository without .magpie, one line says how a project journal starts; elsewhere only none here; never a to-do", async () => {
  const b = box();
  const inGit = await magpie(b, ["doctor"], { env: b.env });
  assert.match(inGit.out, /^ {2}project {3}none here; repomagpie note <x> --to project starts one, shared through git$/m);
  assert.ok(!/^ {2}- .*--to project/m.test(inGit.out), "information, not a to-do");
  assert.equal(JSON.parse((await magpie(b, ["doctor", "--json"], { env: b.env })).out).git_repository, true);

  // The home folder is no project, even with a .git there (dotfiles).
  mkdirSync(join(b.home, ".git"));
  const atHome = await magpie(b, ["doctor"], { env: b.env, cwd: b.home });
  assert.match(atHome.out, /^ {2}project {3}none here; outside a git repository, use --project <path>$/m);
  assert.equal(JSON.parse((await magpie(b, ["doctor", "--json"], { env: b.env, cwd: b.home })).out).git_repository, false);

  // With a project journal, its own row instead.
  mkdirSync(join(b.project, ".magpie", "notes"), { recursive: true });
  assert.match((await magpie(b, ["doctor"], { env: b.env })).out, /^ {2}project {2}.*\.magpie {2}0 notes$/m);
});

test("everything wired: no To do section", async () => {
  // A report without problems renders its closing line; core's tests cover how each problem arises.
  const { render } = await import("./doctor.ts");
  const out = render({ version: "0.2.0", node: { path: "/n", version: "24" }, platform: "linux", commands: [], skills: [], hook: [], reminder: [], agent_hooks: [], agents: [], backups: [], journals: [], git_repository: false, problems: [], github: { connected: false, source: null } }, "/home/me");
  assert.ok(out.endsWith("Everything is wired.\n"));
  assert.ok(!out.includes("To do"));
  assert.match(out, /^Backups from setup\n {2}none$/m);
  // Not connected to GitHub is information, with the two ways to connect.
  assert.ok(out.includes([
    "GitHub: not connected, limited to 10 searches a minute.",
    "  Install the GitHub CLI (cli.github.com) and run gh auth login.",
    "  Or set GITHUB_TOKEN to a token before you start RepoMagpie.",
    "",
  ].join("\n")), out);
});

test("GitHub connected: one line naming where the token comes from, never the token", async () => {
  const { render } = await import("./doctor.ts");
  const report = { version: "0.2.0", node: { path: "/n", version: "24" }, platform: "linux" as const, commands: [], skills: [], hook: [], reminder: [], agent_hooks: [], agents: [], backups: [], journals: [], git_repository: false, problems: [] };
  assert.match(render({ ...report, github: { connected: true, source: "gh" } }, "/home/me"), /^GitHub: using your GitHub CLI login\n\nEverything is wired\.$/m);
  assert.match(render({ ...report, github: { connected: true, source: "GH_TOKEN" } }, "/home/me"), /^GitHub: using GH_TOKEN\n\n/m);
});

test("hooks in other agents: one line per agent, with the form, the flags and Codex's trust", async () => {
  const { render } = await import("./doctor.ts");
  const hook = (id: string, name: string, by: "command" | "folder" | null, entries: unknown[], off: string | null = null) =>
    ({ id, name, installed: by !== null, found: by && { by, path: `/home/me/.${id}` }, file: `/home/me/.${id}/hooks.json`, entries, off });
  const entry = { form: "setup", command: "x", node: "/n", entry: "/e", node_found: true, entry_found: true, flags: [], trust: null };
  const out = render({ version: "0.2.0", node: { path: "/n", version: "24" }, platform: "linux", commands: [], skills: [], hook: [], reminder: [], agents: [], backups: [], journals: [], git_repository: false, problems: [], github: { connected: false, source: null },
    agent_hooks: [
      hook("codex", "Codex CLI", "command", [{ ...entry, trust: "not trusted" }]),
      hook("cursor", "Cursor", "command", [{ ...entry, flags: ["--inform-only"], entry_found: false }]),
      hook("gemini", "Gemini CLI", "folder", [], "Gemini CLI's hooks are turned off (hooksConfig.enabled is false in x); setup doesn't turn them on"),
      hook("antigravity", "Antigravity CLI", null, []),
      hook("copilot", "Copilot CLI", "command", [{ ...entry, form: "name", node_found: true }]),
    ] as DoctorJson["agent_hooks"] }, "/home/me");
  assert.ok(out.includes([
    "Hooks in other agents",
    "  Codex CLI        ~/.codex/hooks.json: node started directly, not trusted",
    "  Cursor           ~/.cursor/hooks.json: node started directly, a path is missing, --inform-only",
    "  Gemini CLI       none (found ~/.gemini only)  (Gemini CLI's hooks are turned off (hooksConfig.enabled is false in x))",
    "  Antigravity CLI  not installed",
    "  Copilot CLI      ~/.copilot/hooks.json: repomagpie through the shell",
    "",
  ].join("\n")), out);
});

test("backups from setup: each with its date, one word on tokens and deleting; still everything wired", async () => {
  const { render } = await import("./doctor.ts");
  const backups = [
    { path: "/home/me/.claude.json.repomagpie-backup-20261015-010147Z", date: "2026-10-15T01:01:47Z" },
    { path: "/home/me/.cursor/mcp.json.repomagpie-backup-20261015-020000Z", date: "2026-10-15T02:00:00Z" },
  ];
  const out = render({ version: "0.2.0", node: { path: "/n", version: "24" }, platform: "linux", commands: [], skills: [], hook: [], reminder: [], agent_hooks: [], agents: [], backups, journals: [], git_repository: false, problems: [], github: { connected: false, source: null } }, "/home/me");
  assert.ok(out.includes([
    "Backups from setup",
    "  ~/.claude.json.repomagpie-backup-20261015-010147Z  2026-10-15 01:01 UTC",
    "  ~/.cursor/mcp.json.repomagpie-backup-20261015-020000Z  2026-10-15 02:00 UTC",
    "  Each is a whole copy of the file: those of ~/.claude.json can hold sign-in tokens and MCP servers' secrets. repomagpie setup --delete-backups deletes them, after asking; with --keep-latest it keeps the newest of each file.",
    "",
  ].join("\n")), out);
  assert.ok(out.endsWith("Everything is wired.\n"));
});
