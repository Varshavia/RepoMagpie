import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NO_CODEGEN, launchCommand, noteTool } from "./launch.ts";
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
  // Executable, as a real node is: PATH lookup on macOS and Linux skips files that aren't, like a shell.
  chmodSync(node, 0o755);
  const entry = join(pkg, "dist", "cli", "main.js");
  writeFileSync(entry, "");
  return { root, node, entry, tmp: join(root, "tmp") };
}

test("absolute node, the flag that turns off code generation, the entry file, then mcp", () => {
  const f = folders();
  const launch = launchCommand({ execPath: f.node, entry: f.entry, env: { PATH: "" }, platform, tmp: f.tmp });
  assert.deepEqual(launch, { command: f.node, args: [NO_CODEGEN, f.entry, "mcp"] });
  assert.equal(NO_CODEGEN, "--disallow-code-generation-from-strings");
  const journal = launchCommand({ execPath: f.node, entry: f.entry, env: { PATH: "" }, platform, tmp: f.tmp, home: join(f.root, "journal") });
  assert.deepEqual(journal, { command: f.node, args: [NO_CODEGEN, f.entry, "mcp", "--home", join(f.root, "journal")] });
});

test("the note tool: --allow-write right after mcp when on, never twice, gone when off", () => {
  const launch = { command: "node", args: [NO_CODEGEN, "main.js", "mcp", "--home", "journal"] };
  const on = noteTool(launch, true);
  assert.deepEqual(on, { command: "node", args: [NO_CODEGEN, "main.js", "mcp", "--allow-write", "--home", "journal"] });
  assert.deepEqual(noteTool(on, true), on);
  assert.deepEqual(noteTool(on, false), launch);
  assert.deepEqual(launch.args, [NO_CODEGEN, "main.js", "mcp", "--home", "journal"], "the launch given isn't changed");
});

test("the node PATH names is written when it is the same file, so the entry survives upgrades", { skip: platform === "win32" && "symlinks need rights on Windows" }, () => {
  const f = folders();
  const bin = join(f.root, "bin");
  mkdirSync(bin);
  symlinkSync(f.node, join(bin, "node"));
  const launch = launchCommand({ execPath: f.node, entry: f.entry, env: { PATH: bin }, platform, tmp: f.tmp });
  assert.equal("command" in launch && launch.command, join(bin, "node"));
});

test("refused: an entry in npx's cache, in the temp folder, or a version manager's per-shell folder", () => {
  const f = folders();
  for (const entry of [
    join(f.root, "npm-cache", "_npx", "a1b2c3", "node_modules", "repomagpie", "dist", "cli", "main.js"),
    join(f.tmp, "x", "main.js"),
  ]) {
    const launch = launchCommand({ execPath: f.node, entry, env: { PATH: "" }, platform, tmp: f.tmp });
    assert.ok("error" in launch, entry);
    assert.match((launch as { error: string }).error, /npm install -g repomagpie/);
  }
  const shell = launchCommand({ execPath: join(f.root, "fnm_multishells", "123_456", "node"), entry: f.entry, env: { PATH: "" }, platform, tmp: f.tmp });
  assert.ok("error" in shell);
});
