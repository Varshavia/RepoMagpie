import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { NO_CODEGEN } from "../src/core/launch.ts";
import { PRE_TOOL_USE } from "../src/core/setup-hook.ts";
import { PLUGIN_MANIFEST } from "./release-check.ts";

// The Claude Code plugin's manifest (decision 0063): the npm package is the plugin, so the manifest
// starts the package's own built CLI, as setup's entries do (decision 0035), with node from PATH and
// the plugin's folder in place of absolute paths. npm run check:build runs both commands from the
// packed package.

const read = (file: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8"));
const plugin = read(PLUGIN_MANIFEST);
const pkg = read("package.json") as { name: string; version: string; description: string; license: string; bin: Record<string, string>; files: string[] };
const ENTRY = "${CLAUDE_PLUGIN_ROOT}/dist/cli/main.js";

test("the manifest: the package's name, version, description and licence", () => {
  assert.equal(plugin.name, pkg.name);
  // Claude Code's rule: kebab-case, and no claude-, anthropic- or cc-plugin- prefix (code.claude.com/docs/en/plugins-reference).
  assert.match(plugin.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.doesNotMatch(plugin.name, /^(claude|anthropic|anthropics|cc-plugin)(-|$)/);
  // A stale version keeps every install on the old one; the release check refuses it too.
  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.description, pkg.description);
  assert.equal(plugin.license, pkg.license);
});

test("the MCP server: node from PATH, code generation off, the package's entry file, read-only", () => {
  assert.equal(pkg.bin.repomagpie, "dist/cli/main.js");
  assert.deepEqual(plugin.mcpServers, { repomagpie: { command: "node", args: [NO_CODEGEN, ENTRY, "mcp"] } });
});

test("the hook: setup's exec form on Bash, PowerShell and Monitor, and no Stop reminder", () => {
  assert.deepEqual(plugin.hooks, {
    PreToolUse: [{ matcher: PRE_TOOL_USE.matcher, hooks: [{ type: "command", command: "node", args: [NO_CODEGEN, ENTRY, "hook", PRE_TOOL_USE.sub] }] }],
  });
});

test("the package ships the manifest and the skill, and nothing a plugin would load besides", () => {
  assert.ok(pkg.files.includes(PLUGIN_MANIFEST));
  assert.ok(pkg.files.includes("skills"));
  assert.ok(existsSync(fileURLToPath(new URL("../skills/repomagpie/SKILL.md", import.meta.url))));
  // The marketplace lists the plugin from npm; it isn't part of the package. Nor are the folders
  // Claude Code would read as a plugin's commands, agents, hooks or MCP servers.
  for (const other of [".claude-plugin", ".claude-plugin/marketplace.json", "commands", "agents", "hooks", "bin", ".mcp.json"]) assert.ok(!pkg.files.includes(other), other);
});
