import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mcpEntry, readJsonc, type Platform } from "./agents.ts";
import { codexHookHash } from "./codex-hooks.ts";
import { removeFolder } from "./copy-folder.ts";
import { runDoctor, type DoctorRequest } from "./doctor.ts";
import { hookLaunch, hookShell, LAUNCHER, launcherText, type HookSub } from "./hook-launch.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import { renderNote } from "./write.ts";

// repomagpie doctor (decision 0035) on a scratch home: HOME, USERPROFILE, APPDATA and the XDG
// folders point into it, PATH holds only its bin/ folder, and nothing outside it is read.

const platform = process.platform as Platform;
const windows = platform === "win32";

function scratchHome() {
  const root = scratchBase("doctor");
  const home = join(root, "home");
  const bin = join(root, "bin");
  for (const folder of [home, bin, join(root, "project", ".git")]) mkdirSync(folder, { recursive: true });
  const env = { PATH: bin, PATHEXT: ".COM;.EXE;.BAT;.CMD", HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData", "Roaming"), XDG_CONFIG_HOME: join(home, ".config"), MAGPIE_HOME: join(home, ".magpie") };
  const request: DoctorRequest = { home, env, cwd: join(root, "project"), platform, version: "0.2.0", node: { path: process.execPath, version: process.versions.node } };
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  return { root, home, bin, env, request, write };
}

// A command on PATH as npm installs it: on Windows a .cmd shim that runs the package's entry file;
// elsewhere a link to it. `pkg` null: a program that is no npm package.
function command(box: ReturnType<typeof scratchHome>, name: string, pkg: { name: string; version: string } | null) {
  if (!pkg) {
    if (windows) box.write(join(box.bin, `${name}.cmd`), "@echo off\r\necho another magpie\r\n");
    else {
      box.write(join(box.bin, name), "#!/bin/sh\necho another magpie\n");
      chmodSync(join(box.bin, name), 0o755);
    }
    return;
  }
  const entry = join(box.bin, "node_modules", pkg.name, "dist", "cli", "main.js");
  box.write(join(box.bin, "node_modules", pkg.name, "package.json"), JSON.stringify(pkg));
  box.write(entry, "#!/usr/bin/env node\n");
  if (windows) box.write(join(box.bin, `${name}.cmd`), `@ECHO off\r\nnode  "%dp0%\\node_modules\\${pkg.name}\\dist\\cli\\main.js" %*\r\n`);
  else {
    chmodSync(entry, 0o755);
    symlinkSync(entry, join(box.bin, name));
  }
}

// Every file under a folder, with its size and modification time: proves nothing was written.
function snapshot(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true }).map((d) => {
    const path = join(d.parentPath, d.name);
    const s = statSync(path, { throwIfNoEntry: false });
    return `${path} ${s?.size} ${s?.mtimeMs}`;
  }).sort();
}

test("a home with nothing set up: nothing found, what to do, and nothing written", () => {
  const box = scratchHome();
  const before = snapshot(box.root);
  const report = runDoctor(box.request);
  assert.deepEqual(snapshot(box.root), before);
  assert.deepEqual(report.commands, [{ name: "repomagpie", found: [] }, { name: "magpie", found: [] }]);
  assert.deepEqual(report.skills, []);
  assert.deepEqual(report.hook, []);
  assert.ok(report.agents.every((a) => !a.installed && a.mcp === null));
  assert.deepEqual(report.journals, [{ scope: "personal", path: join(box.home, ".magpie"), exists: false, notes: 0, skipped: [], unreadable: [] }]);
  assert.deepEqual(report.problems, ["repomagpie isn't on PATH. Install it with npm install -g repomagpie.", "The skill isn't installed. Run repomagpie setup."]);
  assert.deepEqual(report.backups, []);
});

test("setup's backups beside each file it edits and the skill's: listed with their dates, never a to-do", () => {
  const box = scratchHome();
  const vscode = windows ? join(box.home, "AppData", "Roaming", "Code", "User", "mcp.json")
    : platform === "darwin" ? join(box.home, "Library", "Application Support", "Code", "User", "mcp.json") : join(box.home, ".config", "Code", "User", "mcp.json");
  const backups = [
    `${join(box.home, ".claude.json")}.repomagpie-backup-20261015-010147`,
    `${join(box.home, ".claude.json")}.repomagpie-backup-20261015-020000Z`,
    `${join(box.home, ".cursor", "mcp.json")}.repomagpie-backup-20261015-020000Z`,
    `${vscode}.repomagpie-backup-20261015-020000Z`,
    `${join(box.home, ".claude", "settings.json")}.repomagpie-backup-20261015-020000Z`,
  ];
  for (const path of backups) box.write(path, "{}");
  const skill = join(box.home, ".agents", "repomagpie-skill.repomagpie-backup-20261015-020000Z");
  box.write(join(skill, "SKILL.md"), "---\nname: repomagpie\n---\n");
  const before = snapshot(box.root);
  const report = runDoctor(box.request);
  assert.deepEqual(snapshot(box.root), before);
  assert.deepEqual(report.backups.map((b) => b.path), [...backups, skill]);
  assert.deepEqual(report.backups[0], { path: backups[0], date: "2026-10-15T01:01:47Z" });
  assert.ok(!report.problems.some((p) => /backup/i.test(p)), JSON.stringify(report.problems));
});

test("an Antigravity ~/.gemini without settings.json isn't Gemini CLI; the gemini command on PATH is", () => {
  const box = scratchHome();
  box.write(join(box.home, ".gemini", "config", "mcp_config.json"), '{ "mcpServers": {} }\n');
  mkdirSync(join(box.home, ".gemini", "antigravity-cli", "skills"), { recursive: true });
  const gemini = () => runDoctor(box.request).agents.find((a) => a.id === "gemini");
  assert.equal(gemini()?.installed, false);
  assert.ok(!runDoctor(box.request).problems.some((p) => p.includes("Gemini CLI")));
  box.write(windows ? join(box.bin, "gemini.cmd") : join(box.bin, "gemini"), windows ? "@echo off\r\n" : "#!/bin/sh\n");
  if (!windows) chmodSync(join(box.bin, "gemini"), 0o755);
  assert.equal(gemini()?.installed, true);
  assert.ok(runDoctor(box.request).problems.includes("Gemini CLI has no repomagpie MCP server. Run repomagpie setup."));
});

test("PATH: our repomagpie with its version, and a magpie that isn't ours is flagged", () => {
  const box = scratchHome();
  command(box, "repomagpie", { name: "repomagpie", version: "0.1.0" });
  command(box, "magpie", null);
  const report = runDoctor(box.request);
  const [repomagpie, magpie] = report.commands;
  assert.equal(repomagpie.found.length, 1);
  assert.deepEqual({ ...repomagpie.found[0], path: undefined }, { path: undefined, package: "repomagpie", version: "0.1.0", ours: true });
  assert.deepEqual({ ...magpie.found[0], path: undefined }, { path: undefined, package: null, version: null, ours: false });
  assert.ok(report.problems.includes("repomagpie on PATH is version 0.1.0; this is 0.2.0."));
  assert.ok(report.problems.some((p) => p.startsWith("magpie on PATH runs another program")));
});

test("the hook's shell forms in the user's settings: the old name, and the slower shell, are to-dos", () => {
  const box = scratchHome();
  const settings = (command: string) => JSON.stringify({ permissions: { allow: ["Bash(npm test)"] }, hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [{ type: "command", command }] }] } });
  box.write(join(box.home, ".claude", "settings.json"), settings("magpie hook claude-code"));
  const old = runDoctor(box.request);
  assert.deepEqual(old.hook, [{ file: join(box.home, ".claude", "settings.json"), entries: [{ matcher: "Bash|PowerShell", command: "magpie hook claude-code", args: null, form: "old", node_found: null, entry_found: null, code_generation_off: null }] }]);
  assert.ok(old.problems.some((p) => p.includes("runs magpie hook claude-code, the old name")));
  assert.ok(old.problems.includes("Claude Code has no repomagpie MCP server. Run repomagpie setup."), "~/.claude exists, so Claude Code counts as installed");

  box.write(join(box.home, ".claude", "settings.json"), settings("repomagpie hook claude-code"));
  const shell = runDoctor(box.request);
  assert.equal(shell.hook[0].entries[0].form, "shell");
  assert.ok(!shell.problems.some((p) => p.includes("old name")));
  assert.ok(shell.problems.some((p) => p.includes("starts through a shell") && p.endsWith("Run repomagpie setup to start node directly.")));
});

test("the hook's exec form: fine when both paths exist and code generation is off; each gap is a to-do", () => {
  const box = scratchHome();
  command(box, "repomagpie", { name: "repomagpie", version: "0.2.0" });
  const entry = join(box.bin, "node_modules", "repomagpie", "dist", "cli", "main.js");
  const settings = (node: string, args: string[]) => JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [{ type: "command", command: node, args }] }] } });
  const file = join(box.home, ".claude", "settings.json");
  const hookProblems = () => runDoctor(box.request).problems.filter((p) => p.startsWith("The Claude Code hook"));

  box.write(file, settings(process.execPath, ["--disallow-code-generation-from-strings", entry, "hook", "claude-code"]));
  const fine = runDoctor(box.request).hook[0].entries[0];
  assert.deepEqual([fine.form, fine.node_found, fine.entry_found, fine.code_generation_off], ["exec", true, true, true]);
  assert.deepEqual(hookProblems(), []);

  box.write(file, settings(join(box.root, "gone", "node.exe"), ["--disallow-code-generation-from-strings", entry, "hook", "claude-code"]));
  assert.match(hookProblems()[0], /starts .*gone.*node\.exe, which doesn't exist\. Run repomagpie setup again\.$/);
  box.write(file, settings(process.execPath, [entry, "hook", "claude-code"]));
  assert.match(hookProblems()[0], /doesn't start node with --disallow-code-generation-from-strings/);
});

// 0.2.0-beta.5 crashed here: run in the home folder, ~/.claude/settings.local.json had no hooks.PreToolUse.
test("Claude Code settings without our hook's place: no hooks, no PreToolUse, or a PreToolUse that isn't a list are no entries, never a crash", () => {
  const box = scratchHome();
  for (const settings of [{ permissions: { allow: ["Bash(npm test)"] } }, { hooks: {} }, { hooks: { PostToolUse: [] } }, { hooks: { PreToolUse: {} } }, { hooks: { PreToolUse: "x" } }, { hooks: { PreToolUse: null } }, { hooks: { PreToolUse: [] } }]) {
    box.write(join(box.home, ".claude", "settings.local.json"), JSON.stringify(settings));
    box.write(join(box.request.cwd, ".claude", "settings.json"), JSON.stringify(settings));
    for (const cwd of [box.home, box.request.cwd]) {
      const report = runDoctor({ ...box.request, cwd });
      assert.ok(report.hook.length > 0 && report.hook.every((h) => !h.entries.length && !h.error), `${JSON.stringify(settings)} from ${cwd}`);
    }
  }
});

test("run in the home folder, ~/.claude/settings.json is the user's settings and the project's: listed once, with the user's checks", () => {
  const box = scratchHome();
  box.write(join(box.home, ".claude", "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [{ type: "command", command: "repomagpie hook claude-code" }] }] } }));
  box.write(join(box.home, ".claude", "settings.local.json"), JSON.stringify({ permissions: {} }));
  const report = runDoctor({ ...box.request, cwd: box.home });
  assert.deepEqual(report.hook.map((h) => h.file), [join(box.home, ".claude", "settings.json"), join(box.home, ".claude", "settings.local.json")]);
  assert.equal(report.problems.filter((p) => p.includes("starts through a shell")).length, 1);
});

test("the other agents' hooks: setup's form with its paths and flags; a broken path is a to-do, Copilot CLI's first; the shell form is one", () => {
  const box = scratchHome();
  const entry = join(box.bin, "node_modules", "repomagpie", "dist", "cli", "main.js");
  box.write(entry, "");
  const launch = (sub: HookSub, node: string, flags: string[] = []) => hookLaunch(hookShell(sub, platform), node, entry, sub, flags) as string;
  const field = windows ? "powershell" : "bash";
  box.write(join(box.home, ".cursor", "hooks.json"), JSON.stringify({ version: 1, hooks: { beforeShellExecution: [{ command: launch("cursor", process.execPath, ["--inform-only"]), timeout: 10 }] } }));
  box.write(join(box.home, ".gemini", "settings.json"), JSON.stringify({ hooks: { BeforeTool: [{ matcher: "run_shell_command", hooks: [{ type: "command", name: "repomagpie", command: "repomagpie hook gemini-cli" }] }] } }));
  box.write(join(box.home, ".copilot", "hooks", "repomagpie.json"), JSON.stringify({ version: 1, hooks: { preToolUse: [{ type: "command", [field]: launch("copilot", join(box.root, "moved", "node.exe")), timeoutSec: 10 }] } }));
  const before = snapshot(box.root);
  const report = runDoctor(box.request);
  assert.deepEqual(snapshot(box.root), before, "read-only");
  const by = (id: string) => report.agent_hooks.find((h) => h.id === id);
  assert.deepEqual(report.agent_hooks.map((h) => [h.id, h.entries.length]), [["codex", 0], ["cursor", 1], ["gemini", 1], ["antigravity", 0], ["copilot", 1]]);
  assert.deepEqual(by("cursor")?.entries[0], { form: "setup", command: launch("cursor", process.execPath, ["--inform-only"]), node: process.execPath, entry, node_found: true, entry_found: true, flags: ["--inform-only"], trust: null });
  assert.deepEqual([by("gemini")?.entries[0].form, by("gemini")?.entries[0].node_found], ["name", false], "no repomagpie on this PATH");
  assert.deepEqual([by("copilot")?.entries[0].node_found, by("copilot")?.entries[0].entry_found], [false, true]);
  // Copilot CLI's broken path is the first to-do.
  assert.match(report.problems[0], /^The Copilot CLI hook in ~[\\/]\.copilot[\\/]hooks[\\/]repomagpie\.json starts .*moved.*node\.exe, which isn't there, so it does nothing\. Run repomagpie setup again\.$/);
  assert.ok(report.problems.some((p) => /^The Gemini CLI hook in .* starts repomagpie, which isn't there, so it fails on every shell command\./.test(p)), report.problems.join("\n"));
  assert.ok(!report.problems.some((p) => p.includes("Cursor hook")), "Cursor's is fine");
});

test("Antigravity CLI's hook on Windows: node and the entry file read from the launcher; a launcher that is gone is a to-do", { skip: !windows && "Windows only" }, () => {
  const box = scratchHome();
  const entry = join(box.bin, "node_modules", "repomagpie", "dist", "cli", "main.js");
  box.write(entry, "");
  const launcher = join(box.home, ".gemini", "config", LAUNCHER);
  box.write(launcher, launcherText(launcher, process.execPath, entry, hookLaunch("cmd", process.execPath, entry, "antigravity", ["--inform-only"]) as string) as string);
  box.write(join(box.home, ".gemini", "config", "hooks.json"), JSON.stringify({ repomagpie: { PreToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: launcher, timeout: 10 }] }] } }));
  const hook = () => runDoctor(box.request).agent_hooks.find((h) => h.id === "antigravity")?.entries[0];
  assert.deepEqual(hook(), { form: "setup", command: launcher, node: process.execPath, entry, node_found: true, entry_found: true, flags: ["--inform-only"], trust: null });
  removeFolder(launcher);
  assert.deepEqual([hook()?.form, hook()?.node, hook()?.node_found], ["setup", null, false]);
  assert.ok(runDoctor(box.request).problems.some((p) => p === `The Antigravity CLI hook in ~\\.gemini\\config\\hooks.json starts ${launcher}, which isn't there, so it does nothing. Run repomagpie setup again.`));
});

test("the Codex CLI hook's trust, from config.toml: not trusted yet and changed are to-dos; trusted and turned off aren't", () => {
  const box = scratchHome();
  const entry = join(box.bin, "main.js");
  box.write(entry, "");
  const hooksFile = join(box.home, ".codex", "hooks.json");
  const handler = { type: "command", command: hookLaunch(hookShell("codex", platform), process.execPath, entry, "codex", []) as string, timeout: 10 };
  box.write(hooksFile, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./theirs.sh" }] }, { matcher: "Bash", hooks: [handler] }] } }));
  const state = (body: string) => box.write(join(box.home, ".codex", "config.toml"), `[hooks.state.'${hooksFile}:pre_tool_use:1:0']\n${body}\n`);
  const trust = () => {
    const r = runDoctor(box.request);
    return [r.agent_hooks[0].entries[0].trust, r.problems.filter((p) => /Codex CLI skips|so Codex CLI skips it/.test(p)).length];
  };
  assert.deepEqual(trust(), ["not trusted", 1], "no config.toml");
  state(`trusted_hash = "${codexHookHash("Bash", handler, windows)}"`);
  assert.deepEqual(trust(), ["trusted", 0]);
  state('trusted_hash = "sha256:0000"');
  assert.deepEqual(trust(), ["changed since trusted", 1]);
  state(`trusted_hash = "${codexHookHash("Bash", handler, windows)}"\nenabled = false`);
  assert.deepEqual(trust(), ["turned off", 0], "the user's choice");
  box.write(join(box.home, ".codex", "config.toml"), "[features]\nhooks = false\n");
  assert.match(runDoctor(box.request).agent_hooks[0].off ?? "", /^Codex's hooks are turned off/);
});

test("MCP entries: a broken path is found; a good one shows its version and --allow-write; env values never appear", () => {
  const box = scratchHome();
  command(box, "repomagpie", { name: "repomagpie", version: "0.2.0" });
  const entry = join(box.bin, "node_modules", "repomagpie", "dist", "cli", "main.js");
  box.write(join(box.home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { repomagpie: { command: join(box.root, "gone", "node.exe"), args: [entry, "mcp"] } } }));
  box.write(join(box.home, ".gemini", "settings.json"), JSON.stringify({ theme: "x", mcpServers: { repomagpie: { command: process.execPath, args: ["--disallow-code-generation-from-strings", entry, "mcp", "--allow-write"], env: { GITHUB_TOKEN: "ghp_secret123" } } } }));
  const report = runDoctor(box.request);
  const cursor = report.agents.find((a) => a.id === "cursor");
  const gemini = report.agents.find((a) => a.id === "gemini");
  assert.equal(cursor?.mcp?.node_found, false);
  assert.equal(cursor?.mcp?.entry_found, true);
  assert.ok(report.problems.some((p) => p.startsWith("Cursor's repomagpie MCP server starts") && p.endsWith("which doesn't exist. Run repomagpie setup again.")));
  assert.deepEqual(gemini?.mcp, { command: process.execPath, args: ["--disallow-code-generation-from-strings", entry, "mcp", "--allow-write"], env_keys: ["GITHUB_TOKEN"], allow_write: true, code_generation_off: true, node_found: true, entry: entry, entry_found: true, version: "0.2.0" });
  assert.equal(cursor?.mcp?.code_generation_off, false);
  assert.ok(!report.problems.some((p) => p.startsWith("Gemini CLI's")), "a good entry has nothing to do");
  assert.ok(!JSON.stringify(report).includes("ghp_secret123"));
});

test("an entry without node's code-generation flag, or with it after the script, is a to-do", () => {
  const box = scratchHome();
  command(box, "repomagpie", { name: "repomagpie", version: "0.2.0" });
  const entry = join(box.bin, "node_modules", "repomagpie", "dist", "cli", "main.js");
  box.write(join(box.home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { repomagpie: { command: process.execPath, args: [entry, "--disallow-code-generation-from-strings", "mcp"] } } }));
  const report = runDoctor(box.request);
  assert.equal(report.agents.find((a) => a.id === "cursor")?.mcp?.code_generation_off, false);
  assert.ok(report.problems.includes("Cursor's repomagpie MCP server doesn't start node with --disallow-code-generation-from-strings. Run repomagpie setup again."));
});

test("VS Code's JSON with comments and Codex's TOML are read; an unreadable file is named", () => {
  const box = scratchHome();
  const user = windows ? join(box.home, "AppData", "Roaming", "Code", "User") : platform === "darwin" ? join(box.home, "Library", "Application Support", "Code", "User") : join(box.home, ".config", "Code", "User");
  box.write(join(user, "mcp.json"), `{\n  // mine\n  "servers": {\n    "repomagpie": { "type": "stdio", "command": "node", "args": ["/x/main.js", "mcp"], },\n  },\n}\n`);
  box.write(join(box.home, ".codex", "config.toml"), `model = "o4"\n\n[mcp_servers.repomagpie]\ncommand = 'C:\\node\\node.exe'\nargs = ["C:\\\\npm\\\\main.js", "mcp"]\n\n[mcp_servers.repomagpie.env]\nTOKEN = "s3cret"\n\n[other]\nx = 1\n`);
  box.write(join(box.home, ".cursor", "mcp.json"), "{ not json");
  const report = runDoctor(box.request);
  const by = (id: string) => report.agents.find((a) => a.id === id);
  assert.deepEqual(by("vscode")?.mcp?.args, ["/x/main.js", "mcp"]);
  assert.deepEqual({ command: by("codex")?.mcp?.command, args: by("codex")?.mcp?.args, env: by("codex")?.mcp?.env_keys }, { command: "C:\\node\\node.exe", args: ["C:\\npm\\main.js", "mcp"], env: [] });
  assert.match(by("cursor")?.error ?? "", /not valid JSON/);
  assert.ok(!JSON.stringify(report).includes("s3cret"));
});

test("the skill: each folder with its version, and a link shown as one", () => {
  const box = scratchHome();
  const skill = (version: string | null) => `---\nname: repomagpie\ndescription: x\n${version ? `metadata:\n  version: "${version}"\n` : ""}---\n\n# RepoMagpie\n`;
  box.write(join(box.home, ".agents", "skills", "repomagpie", "SKILL.md"), skill("0.1.9"));
  mkdirSync(join(box.home, ".claude", "skills"), { recursive: true });
  symlinkSync(join(box.home, ".agents", "skills", "repomagpie"), join(box.home, ".claude", "skills", "repomagpie"), "junction");
  box.write(join(box.home, ".cursor", "skills", "repomagpie", "SKILL.md"), skill(null));
  const report = runDoctor(box.request);
  const shared = join(box.home, ".agents", "skills", "repomagpie");
  assert.deepEqual(report.skills, [
    { path: shared, link: null, version: "0.1.9" },
    { path: join(box.home, ".claude", "skills", "repomagpie"), link: shared, version: "0.1.9" },
    { path: join(box.home, ".cursor", "skills", "repomagpie"), link: null, version: null },
  ]);
  assert.equal(report.problems.filter((p) => p.includes("is version 0.1.9; the CLI is 0.2.0")).length, 2);
});

test("journals: note counts, skipped files and unreadable frontmatter", () => {
  const box = scratchHome();
  const notes = join(box.home, ".magpie", "notes");
  box.write(join(notes, "npm--a.md"), renderNote({ id: "pkg:npm/a", name: "a", explored: "2026-10-14", kind: "library", tags: [] }));
  box.write(join(notes, "npm--broken.md"), "---\nid: [unclosed\n---\n\n## Verdict\n");
  box.write(join(notes, "npm--huge.md"), "x".repeat(300 * 1024));
  box.write(join(box.root, "project", ".magpie", "notes", "npm--b.md"), renderNote({ id: "pkg:npm/b", name: "b", explored: "2026-10-14", kind: "library", tags: [] }));
  const report = runDoctor(box.request);
  const [personal, project] = report.journals;
  assert.equal(personal.notes, 2);
  assert.equal(personal.skipped.length, 1);
  assert.match(personal.skipped[0], /npm--huge\.md/);
  assert.deepEqual(personal.unreadable, ["npm--broken.md"]);
  assert.deepEqual({ scope: project.scope, notes: project.notes }, { scope: "project", notes: 1 });
});

test("readJsonc and mcpEntry: comments, trailing commas, // inside strings, wrong types", () => {
  assert.deepEqual(readJsonc('{"url": "https://x//y", /* c */ "a": [1,],}'), { value: { url: "https://x//y", a: [1] }, plain: false });
  assert.deepEqual(readJsonc('{"a": "b"}'), { value: { a: "b" }, plain: true });
  // An empty or whitespace-only file is an empty object (Antigravity CLI creates mcp_config.json empty).
  for (const text of ["", " \r\n\t", String.fromCharCode(0xfeff)]) assert.deepEqual(readJsonc(text), { value: {}, plain: true }, JSON.stringify(text));
  assert.deepEqual(mcpEntry("", "mcpServers", "repomagpie"), { entry: null });
  for (const text of ["x", "{", "// only a comment"]) assert.ok("error" in readJsonc(text), text);
  assert.deepEqual(mcpEntry('{"mcpServers": []}', "mcpServers", "repomagpie"), { error: '"mcpServers" is not an object' });
  assert.deepEqual(mcpEntry('{"mcpServers": {"repomagpie": "x"}}', "mcpServers", "repomagpie"), { error: '"mcpServers.repomagpie" is not an object' });
  assert.deepEqual(mcpEntry('{"mcpServers": {}}', "mcpServers", "repomagpie"), { entry: null });
  assert.deepEqual(mcpEntry('[mcp_servers."repomagpie"]\ncommand = "node"\nargs = "nope"\n', "codex-toml", "repomagpie"), { error: "args isn't a one-line list" });
});
