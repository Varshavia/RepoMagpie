import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Platform, Where } from "./agents.ts";
import { claudePlugin, disableCommand, piecesText, setupPieces } from "./claude-plugin.ts";
import { scratchBase } from "./fixtures/scratch.ts";

// RepoMagpie's Claude Code plugin as setup and doctor read it (decision 0063), on a scratch home and
// project: enabledPlugins in each settings file, merged as Claude Code merges them, and the cache.

function box() {
  const root = scratchBase("plugin");
  const home = join(root, "home");
  const project = join(root, "project");
  mkdirSync(home);
  mkdirSync(project);
  const where: Where = { home, env: {}, platform: process.platform as Platform };
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const settings = { user: join(home, ".claude", "settings.json"), project: join(project, ".claude", "settings.json"), local: join(project, ".claude", "settings.local.json") };
  const enable = (file: string, plugins: Record<string, unknown>) => write(file, JSON.stringify({ model: "opus", enabledPlugins: plugins }));
  const install = (market: string, version: string) => mkdirSync(join(home, ".claude", "plugins", "cache", market, "repomagpie", version), { recursive: true });
  return { root, home, project, where, write, settings, enable, install };
}

test("off when no settings file names it, and when nothing is installed", () => {
  const b = box();
  assert.deepEqual(claudePlugin(b.where, b.project), { settings: [], enabled: null, installed: [], active: false });
});

test("on in the user's settings and installed: Claude Code runs it", () => {
  const b = box();
  b.enable(b.settings.user, { "repomagpie@repomagpie": true, "other@repomagpie": true });
  b.install("repomagpie", "0.3.0");
  const plugin = claudePlugin(b.where);
  assert.deepEqual(plugin.enabled, { file: b.settings.user, scope: "user", id: "repomagpie@repomagpie", enabled: true });
  assert.deepEqual(plugin.installed, [{ id: "repomagpie@repomagpie", version: "0.3.0", path: join(b.home, ".claude", "plugins", "cache", "repomagpie", "repomagpie", "0.3.0") }]);
  assert.equal(plugin.active, true);
});

test("on but not installed (a project's committed entry on a new machine): not active", () => {
  const b = box();
  b.enable(b.settings.project, { "repomagpie@team": true });
  b.install("elsewhere", "0.3.0"); // another marketplace's copy doesn't count
  const plugin = claudePlugin(b.where, b.project);
  assert.equal(plugin.enabled?.id, "repomagpie@team");
  assert.equal(plugin.active, false);
});

test("the most specific file that names it wins: local over project over user", () => {
  const b = box();
  b.install("m", "0.3.0");
  b.enable(b.settings.user, { "repomagpie@m": true });
  b.enable(b.settings.local, { "repomagpie@m": false });
  let plugin = claudePlugin(b.where, b.project);
  assert.equal(plugin.enabled, null, "the local file turns it off for this project");
  assert.deepEqual(plugin.settings.map((s) => [s.scope, s.enabled]), [["user", true], ["local", false]]);
  assert.equal(claudePlugin(b.where).active, true, "setup reads the user's settings only");

  b.enable(b.settings.user, { "repomagpie@m": false });
  b.enable(b.settings.project, { "repomagpie@m": true });
  b.enable(b.settings.local, {});
  plugin = claudePlugin(b.where, b.project);
  assert.equal(plugin.enabled?.scope, "project");
  assert.equal(plugin.active, true);
  assert.equal(claudePlugin(b.where).enabled, null);
});

test("only repomagpie@<marketplace> with a true or false counts", () => {
  const b = box();
  b.enable(b.settings.user, { repomagpie: true, "repomagpie-extra@m": true, "repomagpie@m": "yes", "repomagpie@": true, "Repomagpie@m": true });
  assert.deepEqual(claudePlugin(b.where).settings, []);
});

test("a file with comments is read; one that isn't JSON, or whose enabledPlugins isn't an object, names nothing", () => {
  const b = box();
  b.install("m", "0.3.0");
  b.write(b.settings.user, '{\n  // mine\n  "enabledPlugins": { "repomagpie@m": true, },\n}\n');
  assert.equal(claudePlugin(b.where).active, true);
  for (const text of ["{ not json", '{"enabledPlugins": ["repomagpie@m"]}', '{"enabledPlugins": null}', ""]) {
    b.write(b.settings.user, text);
    assert.deepEqual(claudePlugin(b.where).settings, [], text);
  }
});

test("run in the home folder, the user's settings are read once", () => {
  const b = box();
  b.install("m", "0.3.0");
  b.enable(b.settings.user, { "repomagpie@m": true });
  assert.deepEqual(claudePlugin(b.where, b.home).settings.map((s) => s.scope), ["user"]);
});

test("an origin without a marketplace (inline, skills-dir, synced) has no cache folder: on is active", () => {
  const b = box();
  for (const origin of ["inline", "skills-dir", "synced"]) {
    b.enable(b.settings.user, { [`repomagpie@${origin}`]: true });
    assert.equal(claudePlugin(b.where).active, true, origin);
  }
});

test("every installed version is listed, a file in the cache isn't", () => {
  const b = box();
  b.install("m", "0.3.0");
  b.install("m", "0.3.1");
  b.write(join(b.home, ".claude", "plugins", "cache", "m", "repomagpie", "notes.txt"), "x");
  assert.deepEqual(claudePlugin(b.where).installed.map((i) => i.version), ["0.3.0", "0.3.1"]);
});

test("setupPieces: what an earlier setup wrote for Claude Code, and whether the Stop reminder is there", () => {
  const b = box();
  assert.deepEqual(setupPieces(b.where), { pieces: [], reminder: false });
  const hook = (sub: string) => ({ hooks: [{ type: "command", command: `repomagpie hook ${sub}` }] });
  b.write(join(b.home, ".claude.json"), JSON.stringify({ mcpServers: { repomagpie: { command: "node", args: ["x.js", "mcp"] } } }));
  b.write(b.settings.user, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", ...hook("claude-code") }], Stop: [hook("claude-code-stop")] } }));
  b.write(join(b.home, ".claude", "skills", "repomagpie", "SKILL.md"), "---\nname: repomagpie\n---\n");
  const { pieces, reminder } = setupPieces(b.where);
  assert.deepEqual(pieces, [
    { what: "the MCP server", path: join(b.home, ".claude.json") },
    { what: "the hook", path: b.settings.user },
    { what: "the skill", path: join(b.home, ".claude", "skills", "repomagpie") },
  ]);
  assert.equal(reminder, true);
  const short = (path: string) => (path.startsWith(b.home) ? `~${path.slice(b.home.length)}` : path);
  assert.equal(piecesText(pieces, short), `the MCP server in ${join("~", ".claude.json")}, the hook in ${join("~", ".claude", "settings.json")} and the skill in ${join("~", ".claude", "skills", "repomagpie")}`);
  assert.equal(piecesText(pieces.slice(0, 1), short), `the MCP server in ${join("~", ".claude.json")}`);
  // The reminder alone is no double: the plugin doesn't bring it.
  b.write(b.settings.user, JSON.stringify({ hooks: { Stop: [hook("claude-code-stop")] } }));
  assert.deepEqual(setupPieces(b.where).pieces.map((p) => p.what), ["the MCP server", "the skill"]);
});

test("disableCommand: the user's plugin by name; a project's for this user alone", () => {
  const setting = (scope: "user" | "project" | "local") => ({ file: "f", scope, id: "repomagpie@m", enabled: true });
  assert.equal(disableCommand(setting("user")), "claude plugin disable repomagpie@m");
  assert.equal(disableCommand(setting("project")), "claude plugin disable repomagpie@m --scope local");
  assert.equal(disableCommand(setting("local")), "claude plugin disable repomagpie@m --scope local");
});
