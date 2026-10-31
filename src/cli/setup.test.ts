import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { AGENTS } from "../core/agents.ts";
import { NO_CODEGEN } from "../core/launch.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";
import type { Terminal } from "./prompt.ts";

// repomagpie setup (decision 0035) with Cursor, whose file setup edits itself; core's tests cover the
// agent CLIs. The home is a scratch folder, PATH holds only a `cursor` command (setup chooses agents
// found by command or app, decision 0038; it never runs Cursor's, which can't add an entry), and
// `self` names a scratch node and entry.

function box(env: Record<string, string> = {}) {
  const b = sandbox({ "home/.cursor/": null, [process.platform === "win32" ? "bin/cursor.cmd" : "bin/cursor"]: "exit 1\n" });
  if (process.platform !== "win32") chmodSync(join(b.root, "bin", "cursor"), 0o755);
  const self = { execPath: join(b.root, "nodejs", "node.exe"), entry: join(b.root, "npm", "node_modules", "repomagpie", "dist", "cli", "main.js") };
  const over = { env: { PATH: join(b.root, "bin"), APPDATA: join(b.home, "AppData", "Roaming"), XDG_CONFIG_HOME: join(b.home, ".config"), ...env }, self };
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
  // Named for what uses the entry: GitHub Copilot, in VS Code.
  assert.match(r.err, /^ {2}VS Code \(GitHub Copilot\) {2}not installed$/m);
  assert.match(r.err, /Dry run: nothing changed\.\n$/);
  assert.equal(existsSync(b.cursor), false);
});

test("the plan's first line, which setting up by hand copies, has full paths even inside the home folder", async () => {
  const b = box();
  const self = { execPath: join(b.home, "nodejs", "node.exe"), entry: join(b.home, "AppData", "Roaming", "npm", "node_modules", "repomagpie", "dist", "cli", "main.js") };
  const r = await magpie(b, ["setup", "--dry-run"], { ...b.over, self });
  const first = r.err.split("\n")[0];
  assert.equal(first, `Each agent will start: ${[self.execPath, NO_CODEGEN, self.entry, "mcp"].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ")}`);
  assert.match(r.err, /^ {2}Cursor {8}add: edit ~[\\/]\.cursor[\\/]mcp\.json$/m, "the other lines still shorten the home folder");
});

test("--yes applies: the entry starts node with code generation off; a summary; a second run changes nothing", async () => {
  const b = box();
  const r = await magpie(b, ["setup", "--yes"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(b.entry(), { command: b.self.execPath, args: [NO_CODEGEN, b.self.entry, "mcp"] });
  assert.match(r.err, /^Done: Cursor, added\.$/m);
  assert.match(r.err, /\nRestart your agents to load the change\. Run repomagpie doctor to check\.\n$/);
  const again = await magpie(b, ["setup", "--yes"], b.over);
  assert.equal(again.code, 0);
  assert.match(again.err, /^ {2}Cursor {8}already set up$/m);
  // Nothing changed, so there is nothing to restart for.
  assert.match(again.err, /\nNothing to change\.\n$/);
  assert.doesNotMatch(again.err, /Restart/);
  const json = await magpie(b, ["setup", "--yes", "--json"], b.over);
  assert.equal(json.code, 0);
  assert.equal(json.err, "");
  assert.ok(JSON.parse(json.out).agents.every((a: { result?: string }) => a.result === undefined));
});

test("--json needs --yes or --dry-run, and prints the plan with each result", async () => {
  const b = box();
  assert.equal((await magpie(b, ["setup", "--json"], b.over)).code, 2);
  const r = await magpie(b, ["setup", "--yes", "--json"], b.over);
  assert.equal(r.err, "");
  const doc = JSON.parse(r.out);
  assert.deepEqual(Object.keys(doc), ["dry_run", "allow_write", "remove", "project", "launch", "launch_error", "agents", "skill", "hook", "reminder", "hooks"]);
  assert.equal(doc.skill.result, "done");
  assert.equal(doc.hook, null, "no Claude Code here");
  assert.equal(doc.reminder, null);
  assert.deepEqual(doc.hooks.map((h: { id: string; action: string; result: string }) => [h.id, h.action, h.result]), [["cursor", "add", "done"]]);
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

test("setup --help names every agent --agents takes", async () => {
  const r = await magpie(box(), ["setup", "--help"]);
  const listed = r.out.replace(/\s+/g, " ").match(/comma-separated: ([a-z-]+(?:, [a-z-]+)*)/)?.[1].split(", "); // the help wraps
  assert.deepEqual(listed?.sort(), AGENTS.map((a) => a.id).sort(), r.out);
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
  const r = await magpie(b, ["setup", "--yes", "--agents", "cursor,gemini"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(b.entry().args, [...launch.args, "--allow-write"]);
  assert.deepEqual(JSON.parse(readFileSync(gemini, "utf8")).mcpServers.repomagpie.args, launch.args);
  // The MCP entries are kept as they are; the one backup is of settings.json, for Gemini CLI's new hook.
  assert.equal(backups(join(b.home, ".cursor")), 0);
  assert.equal(backups(join(b.home, ".gemini")), 1);
  assert.match(r.err, /^ {2}Gemini CLI {4}already set up\n {16}hook: add: edit ~[\\/]\.gemini[\\/]settings\.json$/m);
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
    // A: choose all, Gemini CLI too, found by its settings.json only.
    const t = terminal("a\r", "\r", "\r");
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
  const added = await magpie(b, ["setup", "--yes"], b.over);
  // After a run that wrote a backup: how many there are now, beside that file.
  assert.match(added.err, /^~[\\/]\.cursor[\\/]mcp\.json now has 1 backup from setup; repomagpie doctor lists them\.$/m);
  const r = await magpie(b, ["setup", "--remove", "--yes"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /^~[\\/]\.cursor[\\/]mcp\.json now has 2 backups from setup; repomagpie doctor lists them\.$/m);
  // Cursor's hook file is backed up before its entry goes; the skill's removal writes no backup.
  assert.match(r.err, /^~[\\/]\.cursor[\\/]hooks\.json now has 1 backup from setup; repomagpie doctor lists them\.$/m);
  assert.equal(r.err.match(/ now has /g)?.length, 2, "the skill's removal writes no backup");
  assert.doesNotMatch((await magpie(b, ["setup", "--remove", "--yes"], b.over)).err, / now has /, "no backup written, no count");
  assert.equal(readFileSync(b.cursor, "utf8"), '{\n  "mcpServers": {\n    "other": { "command": "x" }\n  }\n}\n');
  assert.match(r.err, /^Done: Cursor, removed \(backup: ~[\\/]\.cursor[\\/]mcp\.json\.repomagpie-backup-\d{8}-\d{6}Z(-\d+)?\)\.$/m);
  // The stamp is UTC, and its Z says so.
  const [, y, mo, d, h, mi, s] = /backup-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)Z/.exec(r.err) ?? [];
  assert.ok(Math.abs(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - Date.now()) < 60_000, r.err);
});

test("--remove for one agent says the shared skill stays while another agent still uses it", async () => {
  const b = box();
  await magpie(b, ["setup", "--yes"], b.over);
  // Gemini CLI, set up by an earlier setup: found by its settings.json, which holds RepoMagpie's entry.
  const gemini = join(b.home, ".gemini", "settings.json");
  mkdirSync(join(b.home, ".gemini"));
  writeFileSync(gemini, JSON.stringify({ mcpServers: { repomagpie: b.entry() } }));
  const r = await magpie(b, ["setup", "--remove", "--yes", "--agents", "cursor"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /^ {2}Skill {9}leave: ~[\\/]\.agents[\\/]skills[\\/]repomagpie: Gemini CLI still reads it; setup removes it with the last agent that does\.$/m);
  assert.ok(existsSync(join(b.home, ".agents", "skills", "repomagpie", "SKILL.md")));
  assert.match(r.err, /^Done: Cursor, removed/m);
});

test("--project: the skill and the Claude Code hook go into the project; the MCP entries stay in the user's settings", async () => {
  const b = box();
  mkdirSync(join(b.home, ".claude"));
  const r = await magpie(b, ["--project", b.project, "setup", "--yes", "--agents", "cursor,claude-code"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /In the project .* \(the MCP entries and the other agents' hooks above stay in your own settings\):/);
  assert.ok(existsSync(join(b.home, ".cursor", "hooks.json")), "Cursor's hook names this machine's paths: the user's settings");
  assert.ok(existsSync(join(b.project, ".agents", "skills", "repomagpie", "SKILL.md")));
  assert.ok(existsSync(join(b.project, ".claude", "skills", "repomagpie", "SKILL.md")));
  assert.equal(JSON.parse(readFileSync(join(b.project, ".claude", "settings.json"), "utf8")).hooks.PreToolUse[0].hooks[0].command, "repomagpie hook claude-code");
  assert.ok(!existsSync(join(b.home, ".agents")) && !existsSync(join(b.home, ".claude", "settings.json")));
  assert.deepEqual(b.entry().args.slice(0, 1), [NO_CODEGEN], "Cursor's MCP entry is in ~/.cursor, as without --project");
  assert.equal((await magpie(b, ["--project", join(b.root, "nope"), "setup", "--yes"], b.over)).code, 2);
});

test("--capture-reminder adds the Stop reminder beside the hook, in the user's settings; a second run keeps it; --remove takes both", async () => {
  const b = box();
  mkdirSync(join(b.home, ".claude"));
  const settings = join(b.home, ".claude", "settings.json");
  const plain = await magpie(b, ["setup", "--dry-run", "--agents", "claude-code"], b.over);
  assert.doesNotMatch(plain.err, /Reminder/, "off by default, and not mentioned");
  const r = await magpie(b, ["setup", "--yes", "--agents", "claude-code", "--capture-reminder"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /^ {2}Reminder {6}add the Stop reminder: ~[\\/]\.claude[\\/]settings\.json$/m);
  assert.match(r.err, /^Done: the Claude Code Stop reminder, added\.$/m);
  const hooks = JSON.parse(readFileSync(settings, "utf8")).hooks;
  assert.deepEqual(hooks.Stop, [{ hooks: [{ type: "command", command: b.self.execPath, args: [NO_CODEGEN, b.self.entry, "hook", "claude-code-stop"] }] }]);
  assert.equal(hooks.PreToolUse[0].hooks[0].args.at(-1), "claude-code", "the hook, added in the same run, is still there");
  const again = await magpie(b, ["setup", "--yes", "--agents", "claude-code", "--capture-reminder"], b.over);
  assert.match(again.err, /^ {2}Reminder {6}already set up: /m);
  assert.doesNotMatch((await magpie(b, ["setup", "--yes", "--agents", "claude-code"], b.over)).err, /Reminder/, "kept without the flag, unmentioned");
  assert.ok(JSON.parse(readFileSync(settings, "utf8")).hooks.Stop.length);
  const removed = await magpie(b, ["setup", "--remove", "--yes", "--agents", "claude-code"], b.over);
  assert.match(removed.err, /^Done: the Claude Code Stop reminder, removed \(backup: .*-2\)\.$/m);
  const after = JSON.parse(readFileSync(settings, "utf8")).hooks;
  assert.deepEqual([after.Stop, after.PreToolUse], [[], []]);
});

test("--capture-reminder: not with --remove, --project, --delete-backups, or --agents without claude-code", async () => {
  const b = box();
  for (const [args, message] of [
    [["--remove"], /Use one of them/],
    [["--project", b.project], /each person chooses it/],
    [["--delete-backups"], /--delete-backups goes alone/],
    [["--agents", "cursor"], /add claude-code to --agents/],
  ] as const) {
    const r = await magpie(b, args[0] === "--project" ? ["--project", b.project, "setup", "--yes", "--capture-reminder"] : ["setup", "--yes", "--capture-reminder", ...args], b.over);
    assert.equal(r.code, 2, args.join(" "));
    assert.match(r.err, message);
  }
});

test("the hooks: each on its agent's lines in the plan, then in the summary; Codex CLI's says how to trust it", async () => {
  const b = box();
  mkdirSync(join(b.home, ".codex"));
  const r = await magpie(b, ["setup", "--yes", "--agents", "cursor,codex"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /^ {16}hook: add: edit ~[\\/]\.codex[\\/]hooks\.json\n {18}it will start node directly, then hook codex, only when both files are there$/m);
  assert.match(r.err, /^Done: the Cursor hook, added\.$/m);
  assert.match(r.err, /^Done: the Codex CLI hook, added\.$/m);
  assert.match(r.err, /^Codex CLI runs the hook only once you trust it: open \/hooks in Codex and trust RepoMagpie's hook\.$/m);
  const again = await magpie(b, ["setup", "--yes", "--agents", "cursor,codex"], b.over);
  assert.match(again.err, /^ {16}hook: already set up: ~[\\/]\.codex[\\/]hooks\.json$/m);
  assert.doesNotMatch(again.err, /trust/, "nothing new to trust");
});

test("a journal chosen with MAGPIE_HOME goes into the entry, since the agent won't have it", async () => {
  const b = box({ MAGPIE_HOME: join("x", "journal") });
  mkdirSync(join(b.project, "x"), { recursive: true });
  await magpie(b, ["setup", "--yes"], b.over);
  assert.deepEqual(b.entry().args.slice(-2), ["--home", join(b.project, "x", "journal")]);
});

// --- The macOS test (2026-10-24, decision 0038) ---

test("an agent found by its folder only is listed unchosen, with how each was found; --yes leaves it, --agents and --remove take it", async () => {
  const b = box();
  mkdirSync(join(b.home, ".codex"));
  const t = terminal("\u0003");
  await magpie(b, ["setup"], { ...b.over, interactive: true, terminal: t });
  assert.match(t.drawn(), /^> \[ \] Codex CLI \(found ~[\\/]\.codex only\)\n {2}\[x\] Cursor \(the cursor command\)$/m);

  const yes = await magpie(b, ["setup", "--yes"], b.over);
  assert.equal(yes.code, 0, yes.err);
  assert.match(yes.err, /^ {2}Codex CLI {5}not chosen: found ~[\\/]\.codex only \(--agents codex sets it up\)$/m);
  assert.equal(existsSync(join(b.home, ".codex", "hooks.json")), false, "no hook for an agent found by its folder only");
  const json = JSON.parse((await magpie(b, ["setup", "--dry-run", "--json"], b.over)).out);
  const by = (id: string) => json.agents.find((a: { id: string }) => a.id === id);
  assert.deepEqual([by("codex").action, by("codex").found, by("codex").installed], ["skip", { by: "folder", path: join(b.home, ".codex") }, true]);
  assert.deepEqual(by("cursor").found.by, "command");

  assert.equal((await magpie(b, ["setup", "--yes", "--agents", "codex"], b.over)).code, 0);
  assert.ok(existsSync(join(b.home, ".codex", "hooks.json")), "--agents chooses exactly");
  // --remove chooses every agent found: setup may have written to one found by its folder only.
  const removed = await magpie(b, ["setup", "--remove", "--yes"], b.over);
  assert.match(removed.err, /^Done: the Codex CLI hook, removed/m);
});

test("--yes says once that new entries start without the note tool; not with a flag, an answer, or an entry kept", async () => {
  const b = box();
  const line = "Note tool: off (repomagpie setup --allow-write turns it on).";
  const dry = await magpie(b, ["setup", "--dry-run"], b.over);
  assert.equal(dry.err.split("\n").filter((l) => l === line).length, 1, dry.err);
  const yes = await magpie(b, ["setup", "--yes"], b.over);
  assert.equal(yes.err.split("\n").filter((l) => l === line).length, 2, "in the plan and the summary");
  assert.doesNotMatch((await magpie(b, ["setup", "--yes"], b.over)).err, /Note tool: off/, "the entry is kept as it is");

  const flag = box();
  assert.doesNotMatch((await magpie(flag, ["setup", "--yes", "--no-allow-write"], flag.over)).err, /Note tool: off/);
  const asked = box();
  assert.doesNotMatch((await magpie(asked, ["setup"], { ...asked.over, interactive: true, terminal: terminal("\r", "n", "\r") })).err, /Note tool: off/);

  // Only some entries are new: those are named.
  const mixed = box();
  writeFileSync(mixed.cursor, JSON.stringify({ mcpServers: { repomagpie: { command: mixed.self.execPath, args: [NO_CODEGEN, mixed.self.entry, "mcp", "--allow-write"] } } }));
  mkdirSync(join(mixed.home, ".gemini"));
  writeFileSync(join(mixed.home, ".gemini", "settings.json"), "{}");
  const r = await magpie(mixed, ["setup", "--yes", "--agents", "cursor,gemini"], mixed.over);
  assert.match(r.err, /^Note tool: off in Gemini CLI \(repomagpie setup --allow-write turns it on\)\.$/m);
});

test("--remove where nothing of RepoMagpie's is there says so: nothing to remove, never already set up", async () => {
  const b = box();
  mkdirSync(join(b.home, ".claude"));
  const r = await magpie(b, ["setup", "--remove", "--dry-run", "--agents", "cursor,claude-code"], b.over);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.err, /already/);
  assert.match(r.err, /^ {2}Cursor {8}nothing to remove\n {16}hook: nothing to remove: ~[\\/]\.cursor[\\/]hooks\.json$/m);
  assert.match(r.err, /^ {2}Claude Code {3}nothing to remove$/m);
  assert.match(r.err, /^ {2}Skill {9}nothing to remove: ~[\\/]\.agents[\\/]skills[\\/]repomagpie$/m);
  assert.match(r.err, /^ {2}Hook {10}nothing to remove: ~[\\/]\.claude[\\/]settings\.json$/m);
});

test("--delete-backups: lists them, asks with no as the default, deletes only after yes; --yes without a terminal; --keep-latest; --json", async () => {
  const b = box();
  // Two runs that write backups: Cursor's mcp.json gets one each time, hooks.json the first time.
  writeFileSync(b.cursor, "{}");
  writeFileSync(join(b.home, ".cursor", "hooks.json"), "{}");
  const first = await magpie(b, ["setup", "--yes"], b.over);
  assert.match(first.err, /^repomagpie setup --delete-backups deletes them; with --keep-latest it keeps the newest of each file\.$/m);
  await magpie(b, ["setup", "--yes", "--allow-write"], b.over);
  const folder = join(b.home, ".cursor");
  assert.equal(backups(folder), 3, "mcp.json twice, hooks.json once");
  writeFileSync(join(folder, "mcp.json.bak"), "{}"); // not one of setup's

  const no = terminal("\r");
  const kept = await magpie(b, ["setup", "--delete-backups"], { ...b.over, interactive: true, terminal: no });
  assert.match(no.drawn(), /Delete these 3 backups\? \(y\/N\) no/);
  assert.match(kept.err, /^Backups from setup to delete:\n {2}~[\\/]\.cursor[\\/]mcp\.json\.repomagpie-backup-\d{8}-\d{6}Z(-\d+)? {2}\d{4}-\d\d-\d\d \d\d:\d\d UTC$/m);
  assert.match(kept.err, /Cancelled\. Nothing changed\./);
  assert.equal(backups(folder), 3);

  assert.equal((await magpie(b, ["setup", "--delete-backups"], b.over)).code, 2, "no terminal: --yes or --dry-run");
  assert.equal((await magpie(b, ["setup", "--delete-backups", "--remove", "--yes"], b.over)).code, 2);
  assert.equal((await magpie(b, ["setup", "--keep-latest", "--yes"], b.over)).code, 2);
  const dry = JSON.parse((await magpie(b, ["setup", "--delete-backups", "--keep-latest", "--dry-run", "--json"], b.over)).out);
  assert.deepEqual([dry.dry_run, dry.keep_latest, dry.delete.length, dry.keep.length], [true, true, 1, 2]);
  assert.equal(backups(folder), 3);

  const latest = await magpie(b, ["setup", "--delete-backups", "--keep-latest", "--yes"], b.over);
  assert.equal(latest.code, 0, latest.err);
  assert.match(latest.err, /^Kept, the newest of each file:$/m);
  assert.match(latest.err, /^Deleted 1 of 1 backup\.$/m);
  assert.equal(backups(folder), 2, "the newest of mcp.json and of hooks.json");

  const yes = terminal("y");
  const all = await magpie(b, ["setup", "--delete-backups"], { ...b.over, interactive: true, terminal: yes });
  assert.equal(all.code, 0, all.err);
  assert.match(all.err, /^Deleted: ~[\\/]\.cursor[\\/]hooks\.json\.repomagpie-backup-/m);
  assert.equal(backups(folder), 0);
  assert.ok(existsSync(join(folder, "mcp.json.bak")) && existsSync(b.cursor), "only setup's backups go");
  assert.match((await magpie(b, ["setup", "--delete-backups", "--yes"], b.over)).err, /^No backups from setup\.$/m);
});

test("--delete-backups never follows a link named like a backup", { skip: process.platform === "win32" && "a junction needs no rights, but this checks a file link" }, async () => {
  const b = box();
  const target = join(b.root, "elsewhere.json");
  writeFileSync(target, "{}");
  symlinkSync(target, `${b.cursor}.repomagpie-backup-20261024-101010Z`);
  const r = JSON.parse((await magpie(b, ["setup", "--delete-backups", "--yes", "--json"], b.over)).out);
  assert.deepEqual(r.delete, []);
  assert.ok(existsSync(target) && existsSync(`${b.cursor}.repomagpie-backup-20261024-101010Z`));
});
