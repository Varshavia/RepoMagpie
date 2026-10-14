import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NO_CODEGEN, launchCommand } from "./launch.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Platform } from "./agents.ts";

// How agents start repomagpie mcp (decision 0035, "How agents launch RepoMagpie").

const platform = process.platform as Platform;

function folders() {
  const root = scratchBase("launch");
  const nodeDir = join(root, "nodejs");
  const pkg = join(root, "npm", "node_modules", "repomagpie");
  mkdirSync(nodeDir, { recursive: true });
  mkdirSync(join(pkg, "dist", "cli"), { recursive: true });
  const node = join(nodeDir, platform === "win32" ? "node.exe" : "node");
  writeFileSync(node, "");
  const entry = join(pkg, "dist", "cli", "main.js");
  writeFileSync(entry, "");
  return { root, node, entry, tmp: join(root, "tmp") };
}

test("absolute node, the flag that turns off code generation, the entry file, then mcp", () => {
  const f = folders();
  const launch = launchCommand({ execPath: f.node, entry: f.entry, env: { PATH: "" }, platform, tmp: f.tmp, allowWrite: false });
  assert.deepEqual(launch, { command: f.node, args: [NO_CODEGEN, f.entry, "mcp"] });
  assert.equal(NO_CODEGEN, "--disallow-code-generation-from-strings");
  const write = launchCommand({ execPath: f.node, entry: f.entry, env: { PATH: "" }, platform, tmp: f.tmp, allowWrite: true, home: join(f.root, "journal") });
  assert.deepEqual(write, { command: f.node, args: [NO_CODEGEN, f.entry, "mcp", "--allow-write", "--home", join(f.root, "journal")] });
});

test("the node PATH names is written when it is the same file, so the entry survives upgrades", { skip: platform === "win32" && "symlinks need rights on Windows" }, () => {
  const f = folders();
  const bin = join(f.root, "bin");
  mkdirSync(bin);
  symlinkSync(f.node, join(bin, "node"));
  const launch = launchCommand({ execPath: f.node, entry: f.entry, env: { PATH: bin }, platform, tmp: f.tmp, allowWrite: false });
  assert.equal("command" in launch && launch.command, join(bin, "node"));
});

test("refused: an entry in npx's cache, in the temp folder, or a version manager's per-shell folder", () => {
  const f = folders();
  for (const entry of [
    join(f.root, "npm-cache", "_npx", "a1b2c3", "node_modules", "repomagpie", "dist", "cli", "main.js"),
    join(f.tmp, "x", "main.js"),
  ]) {
    const launch = launchCommand({ execPath: f.node, entry, env: { PATH: "" }, platform, tmp: f.tmp, allowWrite: false });
    assert.ok("error" in launch, entry);
    assert.match((launch as { error: string }).error, /npm install -g repomagpie/);
  }
  const shell = launchCommand({ execPath: join(f.root, "fnm_multishells", "123_456", "node"), entry: f.entry, env: { PATH: "" }, platform, tmp: f.tmp, allowWrite: false });
  assert.ok("error" in shell);
});
