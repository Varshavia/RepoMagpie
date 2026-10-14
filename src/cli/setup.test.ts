import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { NO_CODEGEN } from "../core/launch.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";
import type { Terminal } from "./prompt.ts";

// repomagpie setup (decision 0035) with Cursor, whose file setup edits itself; core's tests cover the
// agent CLIs. The home is a scratch folder, PATH is empty, and `self` names a scratch node and entry.

function box(env: Record<string, string> = {}) {
  const b = sandbox({ "home/.cursor/": null });
  const self = { execPath: join(b.root, "nodejs", "node.exe"), entry: join(b.root, "npm", "node_modules", "repomagpie", "dist", "cli", "main.js") };
  const over = { env: { PATH: "", APPDATA: join(b.home, "AppData", "Roaming"), XDG_CONFIG_HOME: join(b.home, ".config"), ...env }, self };
  const cursor = join(b.home, ".cursor", "mcp.json");
  return { ...b, self, over, cursor, entry: () => JSON.parse(readFileSync(cursor, "utf8")).mcpServers.repomagpie };
}

// A terminal that types `keys`, one burst per prompt, as each prompt opens.
function terminal(...bursts: string[]): Terminal {
  const input = Object.assign(new PassThrough(), { isRaw: false, setRawMode(on: boolean) { input.isRaw = on; return input; } });
  const output = new PassThrough();
  output.resume();
  input.on("resume", () => { const keys = bursts.shift(); if (keys !== undefined) setImmediate(() => input.write(keys)); });
  return { input, output };
}

test("--dry-run shows the plan on stderr and changes nothing", async () => {
  const b = box();
  const r = await magpie(b, ["setup", "--dry-run"], b.over);
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
  assert.match(r.err, /^Each agent will start: .*node\.exe --disallow-code-generation-from-strings .*main\.js mcp$/m);
  assert.match(r.err, /^ {2}Cursor {8}add: edit ~[\\/]\.cursor[\\/]mcp\.json$/m);
  assert.match(r.err, /^ {2}VS Code {7}not installed$/m);
  assert.match(r.err, /Dry run: nothing changed\.\n$/);
  assert.equal(existsSync(b.cursor), false);
});

test("--yes applies: the entry starts node with code generation off; a summary; a second run changes nothing", async () => {
  const b = box();
  const r = await magpie(b, ["setup", "--yes"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(b.entry(), { command: b.self.execPath, args: [NO_CODEGEN, b.self.entry, "mcp"] });
  assert.match(r.err, /^Done: Cursor, added\.$/m);
  assert.match(r.err, /Run repomagpie doctor to check\.\n$/);
  const again = await magpie(b, ["setup", "--yes"], b.over);
  assert.match(again.err, /^ {2}Cursor {8}already set up$/m);
  assert.match(again.err, /^Nothing to change\.$/m);
});

test("--json needs --yes or --dry-run, and prints the plan with each result", async () => {
  const b = box();
  assert.equal((await magpie(b, ["setup", "--json"], b.over)).code, 2);
  const r = await magpie(b, ["setup", "--yes", "--json"], b.over);
  assert.equal(r.err, "");
  const doc = JSON.parse(r.out);
  assert.deepEqual(Object.keys(doc), ["dry_run", "allow_write", "remove", "project", "launch", "launch_error", "agents", "skill", "hook"]);
  assert.equal(doc.skill.result, "done");
  assert.equal(doc.hook, null, "no Claude Code here");
  const cursor = doc.agents.find((a: { id: string }) => a.id === "cursor");
  assert.deepEqual([cursor.action, cursor.method, cursor.result], ["add", "json", "done"]);
});

test("without a terminal it never asks: no --yes and no --dry-run is a usage error; so is an unknown agent", async () => {
  const b = box();
  const r = await magpie(b, ["setup"], b.over);
  assert.equal(r.code, 2);
  assert.match(r.err, /no terminal to ask in/);
  assert.equal((await magpie(b, ["setup", "--yes", "--agents", "cursor,emacs"], b.over)).code, 2);
});

test("in a terminal: choose the agents, answer the note-tool question, confirm; --allow-write goes into the entry", async () => {
  const b = box();
  const r = await magpie(b, ["setup"], { ...b.over, interactive: true, terminal: terminal("\r", "y", "\r") });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(b.entry().args, [NO_CODEGEN, b.self.entry, "mcp", "--allow-write"]);
});

test("in a terminal, Ctrl+C or no agent chosen changes nothing", async () => {
  for (const keys of [["\u0003"], [" \r"], ["\r", "n", "n"]]) {
    const b = box();
    const r = await magpie(b, ["setup"], { ...b.over, interactive: true, terminal: terminal(...keys) });
    assert.equal(r.code, 0);
    assert.match(r.err, /Cancelled\. Nothing changed\./, JSON.stringify(keys));
    assert.equal(existsSync(b.cursor), false);
  }
});

test("run from npx's cache: the plan says why and how to install, nothing is written, exit 1", async () => {
  const b = box();
  const npx = { execPath: b.self.execPath, entry: join(b.root, "npm-cache", "_npx", "f00d", "node_modules", "repomagpie", "dist", "cli", "main.js") };
  const r = await magpie(b, ["setup", "--yes"], { ...b.over, self: npx });
  assert.equal(r.code, 1);
  assert.match(r.err, /runs from npx's cache, which can disappear.*npm install -g repomagpie/);
  assert.equal(existsSync(b.cursor), false);
});

test("--remove takes out only our entry, after a backup", async () => {
  const b = box();
  writeFileSync(b.cursor, '{\n  "mcpServers": {\n    "other": { "command": "x" }\n  }\n}\n');
  await magpie(b, ["setup", "--yes"], b.over);
  const r = await magpie(b, ["setup", "--remove", "--yes"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(b.cursor, "utf8"), '{\n  "mcpServers": {\n    "other": { "command": "x" }\n  }\n}\n');
  assert.match(r.err, /^Done: Cursor, removed \(backup: ~[\\/]\.cursor[\\/]mcp\.json\.repomagpie-backup-\d{8}-\d{6}(-\d+)?\)\.$/m);
});

test("--project: the skill and the Claude Code hook go into the project; the MCP entries stay in the user's settings", async () => {
  const b = box();
  mkdirSync(join(b.home, ".claude"));
  const r = await magpie(b, ["--project", b.project, "setup", "--yes"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /In the project .* \(the MCP entries above stay in your own settings\):/);
  assert.ok(existsSync(join(b.project, ".agents", "skills", "repomagpie", "SKILL.md")));
  assert.ok(existsSync(join(b.project, ".claude", "skills", "repomagpie", "SKILL.md")));
  assert.equal(JSON.parse(readFileSync(join(b.project, ".claude", "settings.json"), "utf8")).hooks.PreToolUse[0].hooks[0].command, "repomagpie hook claude-code");
  assert.ok(!existsSync(join(b.home, ".agents")) && !existsSync(join(b.home, ".claude", "settings.json")));
  assert.deepEqual(b.entry().args.slice(0, 1), [NO_CODEGEN], "Cursor's MCP entry is in ~/.cursor, as without --project");
  assert.equal((await magpie(b, ["--project", join(b.root, "nope"), "setup", "--yes"], b.over)).code, 2);
});

test("a journal chosen with MAGPIE_HOME goes into the entry, since the agent won't have it", async () => {
  const b = box({ MAGPIE_HOME: join("x", "journal") });
  mkdirSync(join(b.project, "x"), { recursive: true });
  await magpie(b, ["setup", "--yes"], b.over);
  assert.deepEqual(b.entry().args.slice(-2), ["--home", join(b.project, "x", "journal")]);
});
