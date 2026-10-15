import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

// A terminal that types `keys`, one burst per prompt, as each prompt opens; `drawn()` is what the
// prompts wrote.
function terminal(...bursts: string[]): Terminal & { drawn: () => string } {
  const input = Object.assign(new PassThrough(), { isRaw: false, setRawMode(on: boolean) { input.isRaw = on; return input; } });
  const output = new PassThrough();
  let text = "";
  output.on("data", (chunk: Buffer) => { text += chunk.toString(); });
  input.on("resume", () => { const keys = bursts.shift(); if (keys !== undefined) setImmediate(() => input.write(keys)); });
  return { input, output, drawn: () => text };
}

const backups = (folder: string) => readdirSync(folder).filter((name) => name.includes(".repomagpie-backup-")).length;

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

test("the note tool: a plain --yes keeps it as it is; --no-allow-write turns it off and --allow-write on, each after a backup", async () => {
  const b = box();
  const folder = join(b.home, ".cursor");
  assert.equal((await magpie(b, ["setup", "--yes", "--allow-write"], b.over)).code, 0);
  assert.deepEqual(b.entry().args, [NO_CODEGEN, b.self.entry, "mcp", "--allow-write"]);

  const again = await magpie(b, ["setup", "--yes"], b.over);
  assert.equal(again.code, 0, again.err);
  assert.deepEqual(b.entry().args, [NO_CODEGEN, b.self.entry, "mcp", "--allow-write"], "still on");
  assert.match(again.err, /^ {2}Cursor {8}already set up$/m);
  assert.match(again.err, /^ {16}note tool: on$/m);
  assert.equal(backups(folder), 0);

  const off = await magpie(b, ["setup", "--yes", "--no-allow-write"], b.over);
  assert.equal(off.code, 0, off.err);
  assert.match(off.err, /^ {2}Cursor {8}update: edit ~[\\/]\.cursor[\\/]mcp\.json$/m);
  assert.match(off.err, /^ {16}note tool: on → off$/m);
  assert.deepEqual(b.entry().args, [NO_CODEGEN, b.self.entry, "mcp"]);
  assert.equal(backups(folder), 1);

  assert.equal((await magpie(b, ["setup", "--yes"], b.over)).code, 0);
  assert.deepEqual(b.entry().args, [NO_CODEGEN, b.self.entry, "mcp"], "still off");
  assert.equal(backups(folder), 1);

  // --dry-run and --json show the same change, and write nothing.
  const dry = await magpie(b, ["setup", "--dry-run", "--allow-write"], b.over);
  assert.match(dry.err, /^ {16}note tool: off → on$/m);
  const json = JSON.parse((await magpie(b, ["setup", "--dry-run", "--json", "--allow-write"], b.over)).out);
  assert.equal(json.allow_write, true);
  assert.deepEqual(json.agents.find((a: { id: string }) => a.id === "cursor").note_tool, { from: false, to: true });
  assert.equal(JSON.parse((await magpie(b, ["setup", "--dry-run", "--json"], b.over)).out).allow_write, null, "neither flag: each entry keeps its own");
  assert.deepEqual(b.entry().args, [NO_CODEGEN, b.self.entry, "mcp"]);

  const write = await magpie(b, ["setup", "--yes", "--allow-write"], b.over);
  assert.match(write.err, /^ {16}note tool: off → on$/m);
  assert.deepEqual(b.entry().args, [NO_CODEGEN, b.self.entry, "mcp", "--allow-write"]);
  assert.equal(backups(folder), 2);
});

test("the note tool, mixed: with neither flag Cursor's and Gemini CLI's entries each keep their own", async () => {
  const b = box();
  const gemini = join(b.home, ".gemini", "settings.json");
  mkdirSync(join(b.home, ".gemini"));
  const launch = { command: b.self.execPath, args: [NO_CODEGEN, b.self.entry, "mcp"] };
  writeFileSync(b.cursor, JSON.stringify({ mcpServers: { repomagpie: { ...launch, args: [...launch.args, "--allow-write"] } } }));
  writeFileSync(gemini, JSON.stringify({ mcpServers: { repomagpie: launch } }));
  const r = await magpie(b, ["setup", "--yes"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(b.entry().args, [...launch.args, "--allow-write"]);
  assert.deepEqual(JSON.parse(readFileSync(gemini, "utf8")).mcpServers.repomagpie.args, launch.args);
  assert.equal(backups(join(b.home, ".cursor")) + backups(join(b.home, ".gemini")), 0);
});

test("the note-tool question says what it is now; Enter keeps it on only when every entry has it on", async () => {
  const launch = (b: ReturnType<typeof box>) => ({ command: b.self.execPath, args: [NO_CODEGEN, b.self.entry, "mcp"] });
  const states: { name: string; cursor: boolean | null; gemini: boolean | null; asks: RegExp; after: [boolean, boolean] }[] = [
    { name: "no entries", cursor: null, gemini: null, asks: /Now not set up in Cursor and Gemini CLI\. \(y\/N\)/, after: [false, false] },
    { name: "both on", cursor: true, gemini: true, asks: /Now on in Cursor and Gemini CLI\. \(Y\/n\)/, after: [true, true] },
    { name: "both off", cursor: false, gemini: false, asks: /Now off in Cursor and Gemini CLI\. \(y\/N\)/, after: [false, false] },
    { name: "mixed", cursor: true, gemini: false, asks: /Now on in Cursor, off in Gemini CLI\. \(y\/N\)/, after: [false, false] },
    { name: "one new, one on", cursor: true, gemini: null, asks: /Now on in Cursor, not set up in Gemini CLI\. \(Y\/n\)/, after: [true, true] },
  ];
  for (const state of states) {
    const b = box();
    const gemini = join(b.home, ".gemini", "settings.json");
    mkdirSync(join(b.home, ".gemini"));
    const entry = (on: boolean | null) => (on === null ? {} : { repomagpie: { ...launch(b), args: [...launch(b).args, ...(on ? ["--allow-write"] : [])] } });
    writeFileSync(b.cursor, JSON.stringify({ mcpServers: entry(state.cursor) }));
    writeFileSync(gemini, JSON.stringify({ mcpServers: entry(state.gemini) }));
    const t = terminal("\r", "\r", "\r");
    const r = await magpie(b, ["setup"], { ...b.over, interactive: true, terminal: t });
    assert.equal(r.code, 0, r.err);
    assert.match(t.drawn(), state.asks, state.name);
    const on = (file: string) => JSON.parse(readFileSync(file, "utf8")).mcpServers.repomagpie.args.includes("--allow-write");
    assert.deepEqual([on(b.cursor), on(gemini)], state.after, state.name);
  }
});

test("in a terminal, --allow-write or --no-allow-write answers the note-tool question", async () => {
  for (const [flag, on] of [["--allow-write", true], ["--no-allow-write", false]] as const) {
    const b = box();
    const t = terminal("\r", "\r");
    const r = await magpie(b, ["setup", flag], { ...b.over, interactive: true, terminal: t });
    assert.equal(r.code, 0, r.err);
    assert.doesNotMatch(t.drawn(), /note tool\?/);
    assert.equal(b.entry().args.includes("--allow-write"), on, flag);
  }
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
