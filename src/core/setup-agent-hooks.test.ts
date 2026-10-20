import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Platform, Where } from "./agents.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import { hookLaunch, hookShell } from "./hook-launch.ts";
import { applyAgentHook, HOOK_SPECS, planAgentHook, type AgentHookTarget } from "./setup-agent-hooks.ts";

// The hook entries setup writes for Codex CLI, Cursor, Gemini CLI, Antigravity CLI and Copilot CLI
// (decision 0036): each agent's file and shape, ours only, a 10-second timeout, appended last,
// older entries of ours migrated with their flags, --remove, and every file setup leaves alone.

const platform = process.platform as Platform;
const STAMP = "20261020-120000Z";

function scratch() {
  const root = scratchBase("agent-hooks");
  const home = join(root, "home");
  mkdirSync(home);
  const where: Where = { home, env: { HOME: home, USERPROFILE: home }, platform };
  const target: AgentHookTarget = { node: join(root, "Program Files", "nodejs", "node.exe"), entry: join(root, "npm", "node_modules", "repomagpie", "dist", "cli", "main.js") };
  const spec = (id: string) => HOOK_SPECS.find((s) => s.id === id) as (typeof HOOK_SPECS)[number];
  const file = (id: string) => spec(id).file(where);
  const write = (id: string, text: string) => {
    mkdirSync(dirname(file(id)), { recursive: true });
    writeFileSync(file(id), text);
  };
  const read = (id: string) => readFileSync(file(id), "utf8");
  const plan = (id: string, remove = false, t: AgentHookTarget = target) => planAgentHook(spec(id), where, remove, STAMP, t);
  const run = (id: string, remove = false, t: AgentHookTarget = target) => applyAgentHook(plan(id, remove, t), spec(id), where, STAMP, t);
  const command = (sub: Parameters<typeof hookLaunch>[3], flags: string[] = []) => hookLaunch(hookShell(sub, platform), target.node, target.entry, sub, flags) as string;
  const backups = (id: string) => readdirSync(dirname(file(id))).filter((name) => name.includes(".repomagpie-backup-"));
  return { root, home, where, target, file, write, read, plan, run, command, backups };
}

test("a new file for each agent: its own shape, our entry only, a 10-second timeout", () => {
  const s = scratch();
  for (const id of ["codex", "cursor", "gemini", "antigravity", "copilot"]) assert.deepEqual([id, s.run(id).result], [id, "done"]);
  const shellField = platform === "win32" ? "powershell" : "bash";
  assert.deepEqual(JSON.parse(s.read("codex")), { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: s.command("codex"), timeout: 10 }] }] } });
  assert.deepEqual(JSON.parse(s.read("cursor")), { version: 1, hooks: { beforeShellExecution: [{ command: s.command("cursor"), timeout: 10 }] } });
  assert.deepEqual(JSON.parse(s.read("gemini")), { hooks: { BeforeTool: [{ matcher: "run_shell_command", hooks: [{ type: "command", name: "repomagpie", command: s.command("gemini-cli"), timeout: 10_000 }] }] } });
  assert.deepEqual(JSON.parse(s.read("antigravity")), { repomagpie: { PreToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: s.command("antigravity"), timeout: 10 }] }] } });
  assert.deepEqual(JSON.parse(s.read("copilot")), { version: 1, hooks: { preToolUse: [{ type: "command", [shellField]: s.command("copilot"), timeoutSec: 10 }] } });
  assert.equal(s.file("copilot"), join(s.home, ".copilot", "hooks", "repomagpie.json"), "its own file");
  // Nothing that approves or trusts.
  for (const id of ["codex", "cursor", "gemini", "antigravity", "copilot"]) assert.doesNotMatch(s.read(id), /"(decision|permission\w*|trust\w*|auto\w*|enabled)"\s*:/i, id);
  // Twice: nothing to do, no backup.
  for (const id of ["codex", "cursor", "gemini", "antigravity", "copilot"]) assert.equal(s.plan(id).action, "keep", id);
});

test("an existing file: our group goes last (Codex keeps trust by position), every other byte stays, a backup first", () => {
  const s = scratch();
  const theirs = '{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "python3 ~/.codex/guard.py" }] }\n    ],\n    "Stop": []\n  }\n}\n';
  s.write("codex", theirs);
  const plan = s.plan("codex");
  assert.deepEqual([plan.action, plan.backup], ["add", `${s.file("codex")}.repomagpie-backup-${STAMP}`]);
  assert.equal(s.run("codex").result, "done");
  assert.equal(readFileSync(`${s.file("codex")}.repomagpie-backup-${STAMP}`, "utf8"), theirs);
  const groups = JSON.parse(s.read("codex")).hooks.PreToolUse;
  assert.equal(groups.length, 2);
  assert.equal(groups[0].hooks[0].command, "python3 ~/.codex/guard.py", "theirs stays first");
  assert.equal(groups[1].hooks[0].command, s.command("codex"));
  assert.ok(s.read("codex").startsWith(theirs.slice(0, theirs.indexOf("\n    ],"))));
  assert.equal(s.plan("codex").action, "keep");
  // Cursor's list and Gemini CLI's settings, with their own keys.
  s.write("cursor", '{\n  "version": 1,\n  "hooks": {\n    "beforeShellExecution": [{ "command": "./audit.sh" }]\n  }\n}\n');
  s.run("cursor");
  assert.deepEqual(JSON.parse(s.read("cursor")).hooks.beforeShellExecution, [{ command: "./audit.sh" }, { command: s.command("cursor"), timeout: 10 }]);
  s.write("gemini", '{\n  "theme": "Dracula",\n  "mcpServers": {}\n}\n');
  s.run("gemini");
  assert.ok(s.read("gemini").startsWith('{\n  "theme": "Dracula",\n  "mcpServers": {},\n  "hooks": {'));
  // Antigravity's other named hooks stay.
  s.write("antigravity", '{ "audit": { "PreToolUse": [] } }\n');
  s.run("antigravity");
  assert.deepEqual(Object.keys(JSON.parse(s.read("antigravity"))), ["audit", "repomagpie"]);
});

test("older entries of ours become the current one in place, flags and other keys kept; two become one", () => {
  const s = scratch();
  s.write("codex", JSON.stringify({ hooks: { PreToolUse: [
    { matcher: "Bash", hooks: [{ type: "command", command: "repomagpie.cmd hook codex --inform-only", commandWindows: "repomagpie.cmd hook codex --inform-only", timeout: 30, statusMessage: "notes" }] },
    { matcher: "Bash", hooks: [{ type: "command", command: "repomagpie hook codex" }] },
  ] } }, null, 2));
  assert.equal(s.plan("codex").action, "migrate");
  assert.equal(s.run("codex").result, "done");
  assert.deepEqual(JSON.parse(s.read("codex")).hooks.PreToolUse, [{ matcher: "Bash", hooks: [{ type: "command", command: s.command("codex", ["--inform-only"]), timeout: 10, statusMessage: "notes" }] }]);
  // setup's own form with other paths (node moved, a reinstall elsewhere).
  const old = hookLaunch(hookShell("cursor", platform), join(s.root, "old", "node.exe"), join(s.root, "old", "main.js"), "cursor", []) as string;
  s.write("cursor", JSON.stringify({ version: 1, hooks: { beforeShellExecution: [{ command: old, timeout: 10 }] } }));
  assert.equal(s.plan("cursor").action, "migrate");
  s.run("cursor");
  assert.equal(JSON.parse(s.read("cursor")).hooks.beforeShellExecution[0].command, s.command("cursor"));
  // Copilot CLI's file as its help shows it.
  s.write("copilot", JSON.stringify({ version: 1, hooks: { preToolUse: [{ type: "command", bash: "repomagpie hook copilot", powershell: "repomagpie.cmd hook copilot", timeoutSec: 10 }] } }));
  assert.equal(s.plan("copilot").action, "migrate");
  s.run("copilot");
  assert.equal(JSON.parse(s.read("copilot")).hooks.preToolUse.length, 1);
  assert.equal(s.plan("copilot").action, "keep");
});

test("--remove: a group of ours goes whole, ours alone from a shared group; Antigravity's named hook and Copilot CLI's file go", () => {
  const s = scratch();
  const theirs = '{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "python3 guard.py" }] }\n    ]\n  }\n}\n';
  s.write("codex", theirs);
  s.run("codex");
  assert.equal(s.run("codex", true).result, "done");
  assert.equal(s.read("codex"), theirs);
  s.write("gemini", JSON.stringify({ hooks: { BeforeTool: [{ matcher: "run_shell_command", hooks: [{ type: "command", command: "./mine.sh" }, { type: "command", name: "repomagpie", command: "repomagpie hook gemini-cli" }] }] } }, null, 2));
  s.run("gemini", true);
  assert.deepEqual(JSON.parse(s.read("gemini")).hooks.BeforeTool, [{ matcher: "run_shell_command", hooks: [{ type: "command", command: "./mine.sh" }] }]);
  s.write("antigravity", '{ "audit": { "PreToolUse": [] } }\n');
  s.run("antigravity");
  s.run("antigravity", true);
  assert.deepEqual(JSON.parse(s.read("antigravity")), { audit: { PreToolUse: [] } });
  s.run("copilot");
  assert.equal(s.run("copilot", true).result, "done");
  assert.equal(existsSync(s.file("copilot")), false);
  assert.equal(s.backups("copilot").length, 1, "the file is backed up first, under a name Copilot CLI doesn't read (not *.json)");
  assert.equal(s.plan("copilot", true).action, "keep", "nothing left to remove");
});

test("left alone, and said so: comments (a snippet instead), wrong types, a link, files and names that aren't ours, another way of running us", () => {
  const s = scratch();
  s.write("gemini", '{\n  // mine\n  "theme": "x"\n}\n');
  const manual = s.plan("gemini");
  assert.equal(manual.action, "manual");
  assert.equal(JSON.parse(manual.snippet ?? "").hooks.BeforeTool[0].hooks[0].command, s.command("gemini-cli"));
  s.write("codex", '{ "hooks": { "PreToolUse": {} } }');
  assert.deepEqual([s.plan("codex").action, s.plan("codex").reason], ["refused", `hooks.PreToolUse isn't a list, so setup leaves ${s.file("codex")} alone`]);
  s.write("copilot", '{ "version": 1, "hooks": { "preToolUse": [{ "type": "command", "bash": "./other.sh" }] } }');
  assert.match(s.plan("copilot").reason ?? "", /holds something else; setup leaves it/);
  s.write("antigravity", '{ "repomagpie": { "PreToolUse": [{ "matcher": "run_command", "hooks": [{ "command": "./x.sh" }] }] } }');
  assert.match(s.plan("antigravity").reason ?? "", /a hook named repomagpie that runs something else/);
  s.write("cursor", JSON.stringify({ version: 1, hooks: { beforeShellExecution: [{ command: "node /opt/repomagpie/dist/cli/main.js hook cursor" }] } }));
  assert.deepEqual([s.plan("cursor").action, s.plan("cursor").reason], ["keep", "a hook entry already runs RepoMagpie another way; setup keeps it"]);
  // ~/.cursor as a link: never written through.
  const t = scratch();
  const elsewhere = join(t.root, "elsewhere");
  mkdirSync(elsewhere);
  symlinkSync(elsewhere, join(t.home, ".cursor"), "junction");
  assert.equal(t.plan("cursor").action, "refused");
  assert.equal(t.run("cursor").result, undefined);
  assert.equal(existsSync(join(elsewhere, "hooks.json")), false);
  // No launch (npx's cache): nothing is written; --remove still works.
  assert.deepEqual([t.plan("codex", false, { error: "npx" }).action, t.plan("codex", false, { error: "npx" }).reason], ["refused", "npx"]);
});

test("an agent's hooks turned off stay off: setup says so and writes nothing (Codex's [features], Gemini CLI's hooksConfig)", () => {
  const s = scratch();
  mkdirSync(join(s.home, ".codex"));
  writeFileSync(join(s.home, ".codex", "config.toml"), "[features]\nhooks = false\n");
  s.write("gemini", '{ "hooksConfig": { "enabled": false } }');
  for (const id of ["codex", "gemini"]) {
    const plan = s.plan(id);
    assert.equal(plan.action, "refused", id);
    assert.match(plan.reason ?? "", /hooks are turned off .*; setup doesn't turn them on/, id);
    s.run(id);
  }
  assert.equal(existsSync(s.file("codex")), false);
  assert.equal(s.read("gemini"), '{ "hooksConfig": { "enabled": false } }');
});
