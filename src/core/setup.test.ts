import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
const CLIS = { "claude-code": "claude", codex: "codex", gemini: "gemini", vscode: "code" } as const;

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
  const calls = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as { agent: string; args: string[] });
  const vscodeMcp = platform === "win32" ? join(home, "AppData", "Roaming", "Code", "User", "mcp.json")
    : platform === "darwin" ? join(home, "Library", "Application Support", "Code", "User", "mcp.json") : join(home, ".config", "Code", "User", "mcp.json");
  return { root, home, bin, launch, request, write, calls, vscodeMcp, files: { claude: join(home, ".claude.json"), codex: join(home, ".codex", "config.toml"), cursor: join(home, ".cursor", "mcp.json"), gemini: join(home, ".gemini", "settings.json") } };
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
    ["claude-code", "add", "cli"], ["codex", "add", "cli"], ["cursor", "add", "json"], ["gemini", "add", "cli"], ["vscode", "add", "cli"],
  ]);
  assert.deepEqual(s.calls(), []);
});

test("applying: every agent's CLI gets the exact arguments, every file holds the entry, nothing else is set", () => {
  const s = scratch();
  mkdirSync(join(s.home, ".cursor"));
  const done = applySetup(planSetup(s.request()), s.request());
  assert.deepEqual(done.agents.map((a) => [a.id, a.result, a.error]), [
    ["claude-code", "done", undefined], ["codex", "done", undefined], ["cursor", "done", undefined], ["gemini", "done", undefined], ["vscode", "done", undefined],
  ]);
  const { command, args } = s.launch;
  assert.deepEqual(s.calls(), [
    { agent: "claude", args: ["mcp", "add", "--scope", "user", "--transport", "stdio", "repomagpie", "--", command, ...args] },
    { agent: "codex", args: ["mcp", "add", "repomagpie", "--", command, ...args] },
    { agent: "gemini", args: ["mcp", "add", "--scope", "user", "repomagpie", "--", command, ...args] },
    { agent: "code", args: ["--add-mcp", JSON.stringify({ name: "repomagpie", command, args })] },
  ]);
  assert.deepEqual(JSON.parse(readFileSync(s.files.cursor, "utf8")), { mcpServers: { repomagpie: { command, args } } });
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
  assert.ok(again.agents.every((a) => a.action === "keep"), JSON.stringify(again.agents.map((a) => a.action)));
  applySetup(again, s.request({ stamp: "20261014-130000" }));
  assert.equal(s.calls().length, calls);
  assert.deepEqual(snapshot(s.root), before);
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
  assert.deepEqual(removal.agents.map((a) => [a.id, a.action, a.method]), [["claude-code", "skip", null], ["codex", "skip", null], ["cursor", "remove", "json"], ["gemini", "remove", "cli"], ["vscode", "remove", "json"]]);
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
  applySetup(plan, s.request());
  assert.deepEqual(snapshot(s.root), before);
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

test("a launch that can't work refuses every agent and writes nothing; --agents limits the plan", () => {
  const s = scratch();
  const blocked = planSetup(s.request({ launch: { error: "This copy of RepoMagpie runs from npx's cache" } }));
  assert.equal(blocked.launch_error, "This copy of RepoMagpie runs from npx's cache");
  assert.ok(blocked.agents.filter((a) => a.installed).every((a) => a.action === "refused"));
  const only = planSetup(s.request({ only: ["codex", "cursor"] }));
  assert.deepEqual(only.agents.map((a) => [a.id, a.action]), [["codex", "add"], ["cursor", "skip"]]);
  assert.match(only.agents[1].reason ?? "", /^not installed: no /);
});
