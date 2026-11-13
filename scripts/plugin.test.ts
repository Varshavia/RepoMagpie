import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ALLOW_WRITE_ENV, NO_CODEGEN } from "../src/core/launch.ts";
import { PRE_TOOL_USE } from "../src/core/setup-hook.ts";
import { PLUGIN_MANIFEST } from "./release-check.ts";

// The Claude Code plugin's manifest (decision 0063): the npm package is the plugin, so the manifest
// starts the package's own built CLI, as setup's entries do (decision 0035), with node from PATH and
// the plugin's folder in place of absolute paths. npm run check:build runs both commands from the
// packed package.

const text = (file: string) => readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
const read = (file: string) => JSON.parse(text(file));
const plugin = read(PLUGIN_MANIFEST);
const MARKETPLACE = ".claude-plugin/marketplace.json";
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

test("the MCP server: node from PATH, code generation off, the package's entry file, the note tool behind the user's switch", () => {
  assert.equal(pkg.bin.repomagpie, "dist/cli/main.js");
  // Never --allow-write in args: the switch is the only way in (decision 0064).
  assert.deepEqual(plugin.mcpServers, {
    repomagpie: { command: "node", args: [NO_CODEGEN, ENTRY, "mcp"], env: { [ALLOW_WRITE_ENV]: "${user_config.note_tool}" } },
  });
});

test("the switch: a boolean note_tool, off by default, with the keys Claude Code accepts", () => {
  assert.deepEqual(Object.keys(plugin.userConfig), ["note_tool"]);
  const option = plugin.userConfig.note_tool as Record<string, unknown>;
  // An unknown key fails Claude Code's validation; type, title and description are required (plugins-reference).
  const known = ["type", "title", "description", "default", "required", "sensitive", "multiple", "min", "max"];
  for (const key of Object.keys(option)) assert.ok(known.includes(key), key);
  assert.equal(option.type, "boolean");
  assert.equal(typeof option.title, "string");
  assert.equal(typeof option.description, "string");
  // Off (decision 0065): Claude Code showed no dialog for it and no prompt before a note call.
  assert.equal(option.default, false);
  // Every ${user_config.X} in the manifest is declared.
  for (const [, key] of JSON.stringify(plugin).matchAll(/\$\{user_config\.([^}]+)\}/g)) assert.ok(key in plugin.userConfig, key);
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
  for (const other of [".claude-plugin", MARKETPLACE, "commands", "agents", "hooks", "bin", ".mcp.json"]) assert.ok(!pkg.files.includes(other), other);
});

// Semver order for X.Y.Z and X.Y.Z-pre: a pre-release comes before its release.
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split(/-(.*)/s);
    return { nums: core.split(".").map(Number), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

test("versions compare as semver: a pre-release before its release, numbers as numbers", () => {
  assert.ok(compareVersions("0.3.0", "0.3.0") === 0);
  assert.ok(compareVersions("0.3.0", "0.4.0-beta.1") < 0);
  assert.ok(compareVersions("0.4.0", "0.4.0-beta.1") > 0);
  assert.ok(compareVersions("0.10.0", "0.9.1") > 0);
});

test("the marketplace: this repository lists the plugin from npm, at a released stable version no newer than the package", () => {
  const market = read(MARKETPLACE);
  assert.deepEqual(Object.keys(market).sort(), ["description", "name", "owner", "plugins"]);
  // The install command in the README and the docs: repomagpie@repomagpie.
  assert.equal(market.name, "repomagpie");
  assert.equal(typeof market.description, "string");
  assert.equal(typeof market.owner.name, "string");
  assert.equal(market.plugins.length, 1);
  const [entry] = market.plugins;
  // No version or description of its own: plugin.json's win, and claude plugin validate warns about a version in both.
  assert.deepEqual(Object.keys(entry).sort(), ["name", "source"]);
  assert.equal(entry.name, plugin.name);
  // npm's public registry (no registry field), the package by name, one version.
  assert.deepEqual(Object.keys(entry.source).sort(), ["package", "source", "version"]);
  assert.equal(entry.source.source, "npm");
  assert.equal(entry.source.package, pkg.name);
  const listed: string = entry.source.version;
  // Exact and stable: a range or a dist-tag would move users without a commit here, and a pre-release
  // is never listed, as in the MCP Registry (docs/release.md, steps 11 and 12).
  assert.match(listed, /^\d+\.\d+\.\d+$/);
  // Bumped after the npm release (step 12), so it may trail package.json's version, never lead it.
  assert.ok(compareVersions(listed, pkg.version) <= 0, `the marketplace lists ${listed}, newer than package.json's ${pkg.version}`);
  // A released version: the changelog has its section.
  assert.match(text("CHANGELOG.md"), new RegExp(`^## \\[${listed.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m"));
});
