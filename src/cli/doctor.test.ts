import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  assert.deepEqual(Object.keys(report), ["version", "node", "platform", "commands", "skills", "hook", "agents", "backups", "journals", "problems"]);
  assert.equal(report.hook[0].entries[0].form, "old");

  const human = await magpie(b, ["doctor"], { env: b.env });
  assert.equal(human.code, 0);
  for (const heading of ["Commands on PATH (the first one runs)", "Skill", "Claude Code hook", "MCP server in each agent", "Backups from setup", "Journals", "To do"]) {
    assert.ok(human.out.split(/\r?\n/).includes(heading), heading);
  }
  assert.match(human.out, /^ {2}~[\\/]\.claude[\\/]settings\.json: magpie hook claude-code {2}\(the old name\)$/m);
  assert.match(human.out, /^ {2}Claude Code {3}installed; no repomagpie entry in ~[\\/]\.claude\.json$/m);
  assert.match(human.out, /^ {2}VS Code \(GitHub Copilot\) {2}not installed$/m);
  assert.match(human.out, /^ {2}- The Claude Code hook in ~[\\/]\.claude[\\/]settings\.json runs magpie hook claude-code, the old name\./m);
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

test("everything wired: no To do section", async () => {
  // A report without problems renders its closing line; core's tests cover how each problem arises.
  const { render } = await import("./doctor.ts");
  const out = render({ version: "0.2.0", node: { path: "/n", version: "24" }, platform: "linux", commands: [], skills: [], hook: [], agents: [], backups: [], journals: [], problems: [] }, "/home/me");
  assert.ok(out.endsWith("Everything is wired.\n"));
  assert.ok(!out.includes("To do"));
  assert.match(out, /^Backups from setup\n {2}none$/m);
});

test("backups from setup: each with its date, one word on tokens and deleting; still everything wired", async () => {
  const { render } = await import("./doctor.ts");
  const backups = [
    { path: "/home/me/.claude.json.repomagpie-backup-20261015-010147Z", date: "2026-10-15T01:01:47Z" },
    { path: "/home/me/.cursor/mcp.json.repomagpie-backup-20261015-020000Z", date: "2026-10-15T02:00:00Z" },
  ];
  const out = render({ version: "0.2.0", node: { path: "/n", version: "24" }, platform: "linux", commands: [], skills: [], hook: [], agents: [], backups, journals: [], problems: [] }, "/home/me");
  assert.ok(out.includes([
    "Backups from setup",
    "  ~/.claude.json.repomagpie-backup-20261015-010147Z  2026-10-15 01:01 UTC",
    "  ~/.cursor/mcp.json.repomagpie-backup-20261015-020000Z  2026-10-15 02:00 UTC",
    "  Each is a whole copy of the file: those of ~/.claude.json can hold sign-in tokens and MCP servers' secrets. Delete the backups you no longer need.",
    "",
  ].join("\n")), out);
  assert.ok(out.endsWith("Everything is wired.\n"));
});
