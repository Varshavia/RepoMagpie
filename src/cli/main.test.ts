import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote } from "../core/write.ts";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const version: string = pkg.version;

test("the published package has no runtime dependencies: the build bundles the libraries (decision 0025)", () => {
  assert.equal(pkg.dependencies, undefined);
  for (const name of ["commander", "minisearch", "packageurl-js", "yaml"]) assert.ok(pkg.devDependencies[name], `${name} in devDependencies`);
});

test("the hook's fast path (no other flags) answers like the full CLI, from stdin", () => {
  const root = scratchBase("main");
  mkdirSync(join(root, "journal", "notes"), { recursive: true });
  writeFileSync(join(root, "journal", "notes", "npm--pdfkit.md"), renderNote({ id: "pkg:npm/pdfkit", name: "pdfkit", explored: "2026-10-04", kind: "library", tags: [], verdict: "avoid: slow" }));
  const main = fileURLToPath(new URL("./main.ts", import.meta.url));
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm i pdfkit" }, cwd: root });
  const env = { ...process.env, MAGPIE_HOME: join(root, "journal") };
  for (const [flags, decision] of [[[], "ask"], [["--inform-only"], undefined]] as [string[], string | undefined][]) {
    const r = spawnSync(process.execPath, [main, "hook", "claude-code", ...flags], { input, env, cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, decision);
  }
  const silent = spawnSync(process.execPath, [main, "hook", "claude-code"], { input: "not json", env, cwd: root, encoding: "utf8" });
  assert.deepEqual([silent.status, silent.stdout], [0, ""]);
  // hook gemini-cli takes it too: the avoid note asks.
  const gemini = spawnSync(process.execPath, [main, "hook", "gemini-cli"], { input: JSON.stringify({ tool_name: "run_shell_command", tool_input: { command: "npm i pdfkit" }, cwd: root }), env, cwd: root, encoding: "utf8" });
  assert.equal(gemini.status, 0, gemini.stderr);
  assert.equal(JSON.parse(gemini.stdout).decision, "ask");
  const antigravity = spawnSync(process.execPath, [main, "hook", "antigravity"], { input: JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "npm i pdfkit", Cwd: root } } }), env, cwd: root, encoding: "utf8" });
  assert.equal(antigravity.status, 0, antigravity.stderr);
  assert.equal(JSON.parse(antigravity.stdout).decision, "force_ask");
  const copilot = spawnSync(process.execPath, [main, "hook", "copilot"], { input: JSON.stringify({ cwd: root, toolName: "powershell", toolArgs: { command: "npm i pdfkit" } }), env, cwd: root, encoding: "utf8" });
  assert.equal(copilot.status, 0, copilot.stderr);
  assert.equal(JSON.parse(copilot.stdout).permissionDecision, "deny");
  const cursor = spawnSync(process.execPath, [main, "hook", "cursor"], { input: JSON.stringify({ hook_event_name: "beforeShellExecution", command: "npm i pdfkit", cwd: root }), env, cwd: root, encoding: "utf8" });
  assert.equal(cursor.status, 0, cursor.stderr);
  assert.equal(JSON.parse(cursor.stdout).permission, "deny");
  // hook codex takes the same path: the first try is denied, the second informs.
  for (const decision of ["deny", undefined]) {
    const r = spawnSync(process.execPath, [main, "hook", "codex"], { input, env, cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, decision);
  }
});

test("runs from source under type stripping: magpie --version", () => {
  const main = fileURLToPath(new URL("./main.ts", import.meta.url));
  const r = spawnSync(process.execPath, [main, "--version"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), version);
});
