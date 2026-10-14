import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mcpEntry, readJsonc, type Platform } from "./agents.ts";
import { runDoctor, type DoctorRequest } from "./doctor.ts";
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

test("the old hook entry is found and named; the current one is fine", () => {
  const box = scratchHome();
  const settings = (command: string) => JSON.stringify({ permissions: { allow: ["Bash(npm test)"] }, hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [{ type: "command", command }] }] } });
  box.write(join(box.home, ".claude", "settings.json"), settings("magpie hook claude-code"));
  const old = runDoctor(box.request);
  assert.deepEqual(old.hook, [{ file: join(box.home, ".claude", "settings.json"), entries: [{ matcher: "Bash|PowerShell", command: "magpie hook claude-code", form: "old" }] }]);
  assert.ok(old.problems.some((p) => p.includes("runs magpie hook claude-code, the old name")));
  assert.ok(old.problems.includes("Claude Code has no repomagpie MCP server. Run repomagpie setup."), "~/.claude exists, so Claude Code counts as installed");

  box.write(join(box.home, ".claude", "settings.json"), settings("repomagpie hook claude-code"));
  const current = runDoctor(box.request);
  assert.equal(current.hook[0].entries[0].form, "current");
  assert.ok(!current.problems.some((p) => p.includes("old name")));
});

test("MCP entries: a broken path is found; a good one shows its version and --allow-write; env values never appear", () => {
  const box = scratchHome();
  command(box, "repomagpie", { name: "repomagpie", version: "0.2.0" });
  const entry = join(box.bin, "node_modules", "repomagpie", "dist", "cli", "main.js");
  box.write(join(box.home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { repomagpie: { command: join(box.root, "gone", "node.exe"), args: [entry, "mcp"] } } }));
  box.write(join(box.home, ".gemini", "settings.json"), JSON.stringify({ theme: "x", mcpServers: { repomagpie: { command: process.execPath, args: [entry, "mcp", "--allow-write"], env: { GITHUB_TOKEN: "ghp_secret123" } } } }));
  const report = runDoctor(box.request);
  const cursor = report.agents.find((a) => a.id === "cursor");
  const gemini = report.agents.find((a) => a.id === "gemini");
  assert.equal(cursor?.mcp?.node_found, false);
  assert.equal(cursor?.mcp?.entry_found, true);
  assert.ok(report.problems.some((p) => p.startsWith("Cursor's repomagpie MCP server starts") && p.endsWith("which doesn't exist. Run repomagpie setup again.")));
  assert.deepEqual(gemini?.mcp, { command: process.execPath, args: [entry, "mcp", "--allow-write"], env_keys: ["GITHUB_TOKEN"], allow_write: true, node_found: true, entry: entry, entry_found: true, version: "0.2.0" });
  assert.ok(!JSON.stringify(report).includes("ghp_secret123"));
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
  assert.deepEqual(mcpEntry('{"mcpServers": []}', "mcpServers", "repomagpie"), { error: '"mcpServers" is not an object' });
  assert.deepEqual(mcpEntry('{"mcpServers": {"repomagpie": "x"}}', "mcpServers", "repomagpie"), { error: '"mcpServers.repomagpie" is not an object' });
  assert.deepEqual(mcpEntry('{"mcpServers": {}}', "mcpServers", "repomagpie"), { entry: null });
  assert.deepEqual(mcpEntry('[mcp_servers."repomagpie"]\ncommand = "node"\nargs = "nope"\n', "codex-toml", "repomagpie"), { error: "args isn't a one-line list" });
});
