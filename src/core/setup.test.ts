import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Platform, Where } from "./agents.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import { NO_CODEGEN } from "./launch.ts";
import { applySetup, planSetup, type SetupRequest } from "./setup.ts";

// repomagpie setup's MCP part (decision 0035) on a scratch home, with fake agent CLIs on PATH that
// record their arguments and change their files as the real ones' docs say (fixtures/fake-agent.ts).

const platform = process.platform as Platform;
const FAKE = fileURLToPath(new URL("./fixtures/fake-agent.ts", import.meta.url));
const CLIS = { "claude-code": "claude", codex: "codex", gemini: "gemini", vscode: "code", copilot: "copilot" } as const;
// Antigravity CLI and Copilot CLI (decision 0036) aren't installed unless a test says so.
const NEW: [string, string, null][] = [["antigravity", "skip", null], ["copilot", "skip", null]];

function scratch(clis: (keyof typeof CLIS)[] = ["claude-code", "codex", "gemini", "vscode"], extra: Record<string, string> = {}) {
  const root = scratchBase("setup");
  const home = join(root, "home");
  const bin = join(root, "bin with space");
  const log = join(root, "agents.jsonl");
  mkdirSync(home);
  mkdirSync(bin);
  writeFileSync(log, "");
  for (const id of clis) {
    const name = CLIS[id];
    if (platform === "win32") writeFileSync(join(bin, `${name}.cmd`), `@"${process.execPath}" "${FAKE}" ${name} %*\r\n`);
    else {
      writeFileSync(join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${name} "$@"\n`);
      chmodSync(join(bin, name), 0o755);
    }
  }
  const env = {
    PATH: bin, PATHEXT: ".COM;.EXE;.BAT;.CMD", SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
    HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData", "Roaming"), XDG_CONFIG_HOME: join(home, ".config"), FAKE_AGENT_LOG: log, ...extra,
  };
  const where: Where = { home, env, platform };
  // Paths with spaces and backslashes, as on Windows.
  const launch = { command: join(root, "Program Files", "nodejs", "node.exe"), args: [NO_CODEGEN, join(root, "npm", "node_modules", "repomagpie", "dist", "cli", "main.js"), "mcp"] };
  const request = (over: Partial<SetupRequest> = {}): SetupRequest => ({ where, launch, remove: false, stamp: "20261014-120000", ...over });
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const logged = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as { agent: string; args: string[]; cwd: string });
  const calls = () => logged().map(({ agent, args }) => ({ agent, args }));
  const vscodeMcp = platform === "win32" ? join(home, "AppData", "Roaming", "Code", "User", "mcp.json")
    : platform === "darwin" ? join(home, "Library", "Application Support", "Code", "User", "mcp.json") : join(home, ".config", "Code", "User", "mcp.json");
  return { root, home, bin, launch, request, write, calls, logged, vscodeMcp, files: { claude: join(home, ".claude.json"), codex: join(home, ".codex", "config.toml"), cursor: join(home, ".cursor", "mcp.json"), gemini: join(home, ".gemini", "settings.json") } };
}

const snapshot = (folder: string) => readdirSync(folder, { recursive: true, withFileTypes: true })
  .map((d) => { const p = join(d.parentPath, d.name); const s = statSync(p, { throwIfNoEntry: false }); return `${p} ${s?.size} ${s?.mtimeMs}`; }).sort();

test("the plan: each installed agent, how it is written, and nothing written yet", () => {
  const s = scratch();
  mkdirSync(join(s.home, ".cursor"));
  const before = snapshot(s.root);
  const plan = planSetup(s.request());
  assert.deepEqual(snapshot(s.root), before);
  assert.deepEqual(plan.agents.map((a) => [a.id, a.action, a.method]), [
    ["claude-code", "add", "cli"], ["codex", "add", "cli"], ["cursor", "add", "json"], ["gemini", "add", "cli"], ["vscode", "add", "cli"], ...NEW,
  ]);
  assert.deepEqual(s.calls(), []);
});

test("applying: every agent's CLI gets the exact arguments, every file holds the entry, nothing else is set", () => {
  const s = scratch();
  mkdirSync(join(s.home, ".cursor"));
  const done = applySetup(planSetup(s.request()), s.request());
  assert.deepEqual(done.agents.map((a) => [a.id, a.result, a.error]), [
    ["claude-code", "done", undefined], ["codex", "done", undefined], ["cursor", "done", undefined], ["gemini", "done", undefined], ["vscode", "done", undefined],
    ["antigravity", undefined, undefined], ["copilot", undefined, undefined],
  ]);
  const { command, args } = s.launch;
  assert.deepEqual(s.calls(), [
    { agent: "claude", args: ["mcp", "add", "--scope", "user", "--transport", "stdio", "repomagpie", "--", command, ...args] },
    { agent: "codex", args: ["mcp", "add", "repomagpie", "--", command, ...args] },
    { agent: "gemini", args: ["mcp", "add", "--scope", "user", "repomagpie", "--", command, ...args] },
    { agent: "code", args: ["--add-mcp", JSON.stringify({ name: "repomagpie", command, args })] },
  ]);
  assert.deepEqual(JSON.parse(readFileSync(s.files.cursor, "utf8")), { mcpServers: { repomagpie: { command, args } } });
  // Each CLI ran by the absolute path found on PATH, in the home folder, not the folder setup ran in.
  assert.ok(s.logged().every((call) => call.cwd === s.home), JSON.stringify(s.logged().map((c) => c.cwd)));
  assert.ok(args.includes(NO_CODEGEN));
  // Nothing that weakens an agent's safety.
  for (const file of [s.files.claude, s.files.cursor, s.files.gemini, s.vscodeMcp]) assert.doesNotMatch(readFileSync(file, "utf8"), /trust|autoApprove|alwaysAllow|approval/i, file);
});

test("idempotent: a second run plans keep everywhere, calls no CLI and writes no backup", () => {
  const s = scratch();
  mkdirSync(join(s.home, ".cursor"));
  applySetup(planSetup(s.request()), s.request());
  const calls = s.calls().length;
  const before = snapshot(s.root);
  const again = planSetup(s.request({ stamp: "20261014-130000" }));
  assert.ok(again.agents.filter((a) => a.installed).every((a) => a.action === "keep"), JSON.stringify(again.agents.map((a) => a.action)));
  assert.deepEqual(again.hooks.map((h) => [h.id, h.action]), [["codex", "keep"], ["cursor", "keep"], ["gemini", "keep"]]);
  applySetup(again, s.request({ stamp: "20261014-130000" }));
  assert.equal(s.calls().length, calls);
  assert.deepEqual(snapshot(s.root), before);
});

// The note tool (--allow-write): a choice the user made stays until they make another.
test("the note tool: without a choice each entry keeps its own, a new one starts off; on and off change only what differs", () => {
  const s = scratch(["gemini", "vscode"]);
  const on = { command: s.launch.command, args: [...s.launch.args, "--allow-write"] };
  s.write(s.files.cursor, JSON.stringify({ mcpServers: { repomagpie: on } }, null, 2));
  s.write(s.files.gemini, JSON.stringify({ mcpServers: { repomagpie: s.launch } }, null, 2));
  const tools = (plan: ReturnType<typeof planSetup>) => plan.agents.filter((a) => a.installed).map((a) => [a.id, a.action, a.note_tool]);

  // No choice: Cursor stays on, Gemini CLI stays off, VS Code's new entry starts off. Only VS Code is written.
  const kept = planSetup(s.request());
  assert.deepEqual(tools(kept), [["cursor", "keep", { from: true, to: true }], ["gemini", "keep", { from: false, to: false }], ["vscode", "add", { from: null, to: false }]]);
  assert.deepEqual(kept.launch, s.launch, "the entry a new agent gets: without --allow-write");
  const mcpOnly = () => snapshot(join(s.home, ".cursor")).filter((line) => !line.includes("hooks.json"));
  const before = mcpOnly();
  applySetup(kept, s.request());
  assert.deepEqual(mcpOnly(), before, "no backup, no change");
  assert.deepEqual(s.calls().map((c) => c.agent), ["code"]);
  assert.deepEqual(JSON.parse(readFileSync(s.vscodeMcp, "utf8")).servers.repomagpie.args, s.launch.args);

  // Off: only Cursor's entry changes, after a backup.
  const off = planSetup(s.request({ noteTool: false, stamp: "20261014-130000" }));
  assert.deepEqual(tools(off), [["cursor", "update", { from: true, to: false }], ["gemini", "keep", { from: false, to: false }], ["vscode", "keep", { from: false, to: false }]]);
  applySetup(off, s.request({ noteTool: false, stamp: "20261014-130000" }));
  assert.deepEqual(JSON.parse(readFileSync(s.files.cursor, "utf8")).mcpServers.repomagpie, s.launch);
  assert.ok(existsSync(`${s.files.cursor}.repomagpie-backup-20261014-130000`));

  // On: every entry, --allow-write right after mcp.
  const all = planSetup(s.request({ noteTool: true, stamp: "20261014-140000" }));
  assert.deepEqual(tools(all).map(([id, action]) => [id, action]), [["cursor", "update"], ["gemini", "update"], ["vscode", "update"]]);
  assert.deepEqual(all.launch, on);
  const done = applySetup(all, s.request({ noteTool: true, stamp: "20261014-140000" }));
  assert.ok(done.agents.filter((a) => a.installed).every((a) => a.result === "done"), JSON.stringify(done.agents.map((a) => a.error)));
  assert.deepEqual(JSON.parse(readFileSync(s.files.cursor, "utf8")).mcpServers.repomagpie, on);
  assert.deepEqual(JSON.parse(readFileSync(s.files.gemini, "utf8")).mcpServers.repomagpie.args, on.args);
  assert.deepEqual(s.calls().at(-1), { agent: "gemini", args: ["mcp", "add", "--scope", "user", "repomagpie", "--", on.command, ...on.args] });
  assert.deepEqual(JSON.parse(readFileSync(s.vscodeMcp, "utf8")).servers.repomagpie.args, on.args, "VS Code's CLI can't remove: its file is edited");

  // A snippet to paste names the same choice: Codex without its CLI, an entry that has the note tool on.
  s.write(s.files.codex, `[mcp_servers.repomagpie]\ncommand = ${JSON.stringify(s.launch.command)}\nargs = ${JSON.stringify(on.args)}\n`);
  assert.deepEqual(planSetup(s.request()).agents.find((a) => a.id === "codex")?.note_tool, { from: true, to: true });
  assert.deepEqual(planSetup(s.request({ remove: true })).agents.filter((a) => a.installed).map((a) => a.note_tool), [null, null, null, null], "--remove has no note-tool choice");
});

test("an existing file is backed up first; its other keys stay byte for byte", () => {
  const s = scratch(["gemini"]);
  const cursor = '{\n\t"mcpServers": {\n\t\t"other": { "command": "x" }\n\t},\n\t"z": 1\n}\n';
  s.write(s.files.cursor, cursor);
  const gemini = '{\n  "theme": "Dracula",\n  "mcpServers": {}\n}\n';
  s.write(s.files.gemini, gemini);
  const plan = planSetup(s.request());
  assert.equal(plan.agents.find((a) => a.id === "cursor")?.backup, `${s.files.cursor}.repomagpie-backup-20261014-120000`);
  applySetup(plan, s.request());
  assert.equal(readFileSync(`${s.files.cursor}.repomagpie-backup-20261014-120000`, "utf8"), cursor);
  assert.equal(readFileSync(`${s.files.gemini}.repomagpie-backup-20261014-120000`, "utf8"), gemini);
  const after = readFileSync(s.files.cursor, "utf8");
  assert.ok(after.startsWith('{\n\t"mcpServers": {\n\t\t"other": { "command": "x" },\n\t\t"repomagpie": {\n'), after);
  assert.ok(after.endsWith('\n\t},\n\t"z": 1\n}\n'));
});

test("--remove deletes only our entries, leaves the file as it was otherwise, and keeps later changes", () => {
  const s = scratch(["gemini", "vscode"]);
  const cursor = '{\n  "mcpServers": {\n    "other": { "command": "x" }\n  }\n}\n';
  s.write(s.files.cursor, cursor);
  applySetup(planSetup(s.request()), s.request());
  // Another tool changes the file after our backup.
  const changed = readFileSync(s.files.cursor, "utf8").replace('"other": { "command": "x" }', '"other": { "command": "y" }');
  writeFileSync(s.files.cursor, changed);
  const removal = planSetup(s.request({ remove: true, stamp: "20261014-140000" }));
  assert.deepEqual(removal.agents.map((a) => [a.id, a.action, a.method]), [["claude-code", "skip", null], ["codex", "skip", null], ["cursor", "remove", "json"], ["gemini", "remove", "cli"], ["vscode", "remove", "json"], ...NEW]);
  const done = applySetup(removal, s.request({ remove: true, stamp: "20261014-140000" }));
  assert.ok(done.agents.filter((a) => a.installed).every((a) => a.result === "done"), JSON.stringify(done.agents));
  assert.equal(readFileSync(s.files.cursor, "utf8"), cursor.replace('"command": "x"', '"command": "y"'));
  assert.deepEqual(JSON.parse(readFileSync(s.files.gemini, "utf8")).mcpServers, {});
  assert.deepEqual(JSON.parse(readFileSync(s.vscodeMcp, "utf8")).servers, {});
  assert.ok(existsSync(`${s.files.cursor}.repomagpie-backup-20261014-140000`));
});

test("an entry named repomagpie that runs something else is an update that shows the old command", () => {
  const s = scratch(["gemini"]);
  s.write(s.files.cursor, JSON.stringify({ mcpServers: { repomagpie: { command: "npx", args: ["-y", "repomagpie", "mcp"] } } }));
  s.write(s.files.gemini, JSON.stringify({ mcpServers: { repomagpie: { command: "repomagpie", args: ["mcp"] } } }));
  const plan = planSetup(s.request());
  const cursor = plan.agents.find((a) => a.id === "cursor");
  assert.deepEqual([cursor?.action, cursor?.current], ["update", { command: "npx", args: ["-y", "repomagpie", "mcp"] }]);
  const done = applySetup(plan, s.request());
  assert.deepEqual(done.agents.filter((a) => a.installed).map((a) => a.result), ["done", "done"]);
  assert.deepEqual(s.calls().map((c) => c.args.slice(0, 2)), [["mcp", "remove"], ["mcp", "add"]]);
  assert.equal(JSON.parse(readFileSync(s.files.gemini, "utf8")).mcpServers.repomagpie.command, s.launch.command);
});

test("refused or manual, never edited: JSON with comments, a linked config folder, Codex without its CLI", () => {
  const s = scratch([]);
  s.write(s.files.cursor, '{\n  // mine\n  "mcpServers": {}\n}\n');
  const outside = join(s.root, "elsewhere");
  mkdirSync(outside);
  writeFileSync(join(outside, "settings.json"), "{}");
  symlinkSync(outside, join(s.home, ".gemini"), "junction");
  mkdirSync(join(s.home, ".codex"));
  const before = snapshot(s.root);
  const plan = planSetup(s.request());
  const by = (id: string) => plan.agents.find((a) => a.id === id);
  assert.equal(by("cursor")?.action, "manual");
  assert.match(by("cursor")?.reason ?? "", /comments/);
  assert.deepEqual(JSON.parse(by("cursor")?.snippet ?? ""), { mcpServers: { repomagpie: { command: s.launch.command, args: s.launch.args } } });
  assert.equal(by("gemini")?.action, "refused");
  assert.match(by("gemini")?.reason ?? "", /is a link; setup never writes through one/);
  assert.equal(by("codex")?.action, "manual");
  assert.equal(by("codex")?.snippet, `[mcp_servers.repomagpie]\ncommand = ${JSON.stringify(s.launch.command)}\nargs = ${JSON.stringify(s.launch.args)}`);
  assert.match(by("codex")?.reason ?? "", /codex command isn't on PATH/);
  // The hooks have files of their own: Codex's and Cursor's are written; Gemini CLI's, behind the link, isn't.
  assert.deepEqual(plan.hooks.map((h) => [h.id, h.action]), [["codex", "add"], ["cursor", "add"], ["gemini", "refused"]]);
  applySetup(plan, s.request());
  // Only the skill and those two hook files are written: no MCP config file changed.
  const skill = join(s.home, ".agents");
  const written = (line: string) => line.startsWith(skill) || line.startsWith(`${s.home} `) || /[\\/]\.(codex|cursor)( |[\\/]hooks\.json )/.test(line);
  assert.deepEqual(snapshot(s.root).filter((line) => !written(line)), before.filter((line) => !written(line)));
  assert.equal(readFileSync(join(outside, "settings.json"), "utf8"), "{}");
});

test("a failing CLI, and a CLI that records something else, are failures that say so", () => {
  const s = scratch(["gemini", "vscode"], { FAKE_AGENT_FAIL: "gemini", FAKE_AGENT_MANGLE: "code" });
  const done = applySetup(planSetup(s.request()), s.request());
  const by = (id: string) => done.agents.find((a) => a.id === id);
  assert.equal(by("gemini")?.result, "failed");
  assert.match(by("gemini")?.error ?? "", /gemini mcp add failed \(exit 1\): gemini: something went wrong/);
  assert.equal(by("vscode")?.result, "failed");
  assert.match(by("vscode")?.error ?? "", /didn't record the entry as expected/);
});

test("with Claude Code: its MCP entry, the skill linked, and the old magpie hook migrated; --remove takes all three out", () => {
  const s = scratch(["claude-code"]);
  const settings = join(s.home, ".claude", "settings.json");
  const original = '{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "magpie hook claude-code" }] }\n    ]\n  }\n}\n';
  s.write(settings, original);
  const plan = planSetup(s.request());
  assert.deepEqual([plan.skill?.shared.action, plan.skill?.claude?.action, plan.hook?.action], ["add", "link", "migrate"]);
  const done = applySetup(plan, s.request());
  assert.deepEqual([done.agents[0].result, done.skill?.result, done.hook?.result], ["done", "done", "done"], JSON.stringify([done.skill?.error, done.hook?.error]));
  // The exec form: the MCP entry's node and entry file, then hook claude-code.
  assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")).hooks.PreToolUse[0].hooks, [{ type: "command", command: s.launch.command, args: [NO_CODEGEN, s.launch.args[1], "hook", "claude-code"] }]);
  assert.ok(existsSync(join(s.home, ".agents", "skills", "repomagpie", "SKILL.md")));
  assert.ok(lstatSync(join(s.home, ".claude", "skills", "repomagpie")).isSymbolicLink());

  const removed = applySetup(planSetup(s.request({ remove: true, stamp: "20261014-140000" })), s.request({ remove: true, stamp: "20261014-140000" }));
  assert.deepEqual([removed.agents[0].result, removed.skill?.result, removed.hook?.result], ["done", "done", "done"]);
  assert.equal(readFileSync(settings, "utf8"), '{\n  "hooks": {\n    "PreToolUse": []\n  }\n}\n');
  assert.ok(!existsSync(join(s.home, ".agents", "skills", "repomagpie")) && !existsSync(join(s.home, ".claude", "skills", "repomagpie")));
});

test("a launch that can't work refuses every agent and writes nothing; --agents limits the plan", () => {
  const s = scratch();
  const blocked = planSetup(s.request({ launch: { error: "This copy of RepoMagpie runs from npx's cache" } }));
  assert.equal(blocked.launch_error, "This copy of RepoMagpie runs from npx's cache");
  assert.ok(blocked.agents.filter((a) => a.installed).every((a) => a.action === "refused"));
  const only = planSetup(s.request({ only: ["codex", "cursor"] }));
  assert.deepEqual(only.agents.map((a) => [a.id, a.action]), [["codex", "add"], ["cursor", "skip"]]);
  assert.match(only.agents[1].reason ?? "", /^not installed: no /);
});

test("Copilot CLI: its CLI adds and removes the entry; without it, its mcp-config.json is edited with the type and the tools", () => {
  const s = scratch(["copilot"]);
  const config = join(s.home, ".copilot", "mcp-config.json");
  const done = applySetup(planSetup(s.request()), s.request());
  const copilot = done.agents.find((a) => a.id === "copilot");
  assert.deepEqual([copilot?.installed, copilot?.method, copilot?.result], [true, "cli", "done"]);
  assert.deepEqual(s.calls(), [{ agent: "copilot", args: ["mcp", "add", "repomagpie", "--", s.launch.command, ...s.launch.args] }]);
  applySetup(planSetup(s.request({ remove: true, stamp: "20261014-130000" })), s.request({ remove: true, stamp: "20261014-130000" }));
  assert.deepEqual(s.calls().at(-1), { agent: "copilot", args: ["mcp", "remove", "repomagpie"] });
  assert.deepEqual(JSON.parse(readFileSync(config, "utf8")).mcpServers, {});

  const t = scratch([]);
  t.write(join(t.home, ".copilot", "config.json"), "{}");
  const plan = planSetup(t.request());
  assert.deepEqual(plan.agents.filter((a) => a.installed).map((a) => [a.id, a.action, a.method]), [["copilot", "add", "json"]]);
  applySetup(plan, t.request());
  assert.deepEqual(JSON.parse(readFileSync(join(t.home, ".copilot", "mcp-config.json"), "utf8")).mcpServers.repomagpie, { type: "local", ...t.launch, tools: ["*"] });
  // ~/.copilot alone (VS Code reads it too) isn't Copilot CLI.
  const u = scratch([]);
  mkdirSync(join(u.home, ".copilot", "skills"), { recursive: true });
  assert.equal(planSetup(u.request()).agents.find((a) => a.id === "copilot")?.installed, false);
});

test("every agent with a hook gets its entry beside its MCP entry; Gemini CLI's one file gets two backups; --remove takes all out", () => {
  const s = scratch(["codex", "gemini", "copilot"]);
  mkdirSync(join(s.home, ".cursor"));
  mkdirSync(join(s.home, ".gemini", "antigravity-cli"), { recursive: true });
  s.write(s.files.gemini, '{\n  "theme": "Dracula"\n}\n');
  const plan = planSetup(s.request());
  assert.deepEqual(plan.hooks.map((h) => [h.id, h.action]), [["codex", "add"], ["cursor", "add"], ["gemini", "add"], ["antigravity", "add"], ["copilot", "add"]]);
  const gemini = plan.hooks.find((h) => h.id === "gemini");
  assert.equal(gemini?.backup, `${s.files.gemini}.repomagpie-backup-20261014-120000-2`, "the MCP entry's backup has the plain name");
  const done = applySetup(plan, s.request());
  assert.deepEqual(done.hooks.map((h) => [h.id, h.result, h.error]), ["codex", "cursor", "gemini", "antigravity", "copilot"].map((id) => [id, "done", undefined]));
  const settings = JSON.parse(readFileSync(s.files.gemini, "utf8"));
  assert.ok(settings.mcpServers.repomagpie && settings.hooks.BeforeTool.length === 1, "both in settings.json");
  assert.equal(readFileSync(`${s.files.gemini}.repomagpie-backup-20261014-120000`, "utf8"), '{\n  "theme": "Dracula"\n}\n');
  assert.ok(existsSync(`${s.files.gemini}.repomagpie-backup-20261014-120000-2`));
  // The skill: Claude Code isn't here, so its folder gets no link; Antigravity CLI's does.
  assert.deepEqual([done.skill?.claude, done.skill?.antigravity?.action], [null, "link"]);
  // Twice: nothing.
  const again = planSetup(s.request({ stamp: "20261014-130000" }));
  assert.ok(again.hooks.every((h) => h.action === "keep"), JSON.stringify(again.hooks));
  const removed = applySetup(planSetup(s.request({ remove: true, stamp: "20261014-140000" })), s.request({ remove: true, stamp: "20261014-140000" }));
  assert.deepEqual(removed.hooks.map((h) => [h.id, h.action, h.result]), ["codex", "cursor", "gemini", "antigravity", "copilot"].map((id) => [id, "remove", "done"]));
  assert.equal(JSON.parse(readFileSync(s.files.gemini, "utf8")).hooks.BeforeTool.length, 0);
  assert.equal(existsSync(join(s.home, ".copilot", "hooks", "repomagpie.json")), false);
  assert.equal(existsSync(join(s.home, ".gemini", "skills", "repomagpie")), false);
});

// Antigravity CLI keeps its files in ~/.gemini too (config/mcp_config.json, antigravity-cli/), and
// reads neither ~/.gemini/settings.json nor an entry setup writes there (docs/agents.md).
test("an Antigravity ~/.gemini without settings.json and no gemini command isn't Gemini CLI: Antigravity's own files only", () => {
  const s = scratch([]);
  const mcp = join(s.home, ".gemini", "config", "mcp_config.json");
  s.write(mcp, '{ "mcpServers": {} }\n');
  mkdirSync(join(s.home, ".gemini", "antigravity-cli", "skills"), { recursive: true });
  const plan = planSetup(s.request());
  const by = (id: string) => plan.agents.find((a) => a.id === id);
  assert.deepEqual([by("gemini")?.installed, by("gemini")?.action, by("gemini")?.reason], [false, "skip", "not installed"]);
  assert.deepEqual([by("antigravity")?.installed, by("antigravity")?.action, by("antigravity")?.method], [true, "add", "json"]);
  applySetup(plan, s.request());
  assert.equal(existsSync(s.files.gemini), false);
  assert.deepEqual(JSON.parse(readFileSync(mcp, "utf8")).mcpServers.repomagpie, s.launch);
  assert.ok(existsSync(join(s.home, ".gemini", "config", "hooks.json")));
  assert.ok(lstatSync(join(s.home, ".gemini", "skills", "repomagpie")).isSymbolicLink(), "the skill's link in the shared ~/.gemini/skills");
  assert.equal(existsSync(join(s.home, ".gemini", "antigravity-cli", "skills", "repomagpie")), false);
  const asked = planSetup(s.request({ only: ["gemini"] })).agents[0];
  assert.equal(asked.reason, `not installed: no ${s.files.gemini} and no gemini command`);
  // Gemini CLI's own settings.json, without its command on PATH: installed, edited as JSON.
  s.write(s.files.gemini, "{}\n");
  const own = planSetup(s.request()).agents.find((a) => a.id === "gemini");
  assert.deepEqual([own?.installed, own?.action, own?.method], [true, "add", "json"]);
});
