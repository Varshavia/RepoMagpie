import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "./agent-cli.ts";
import type { Where } from "./agents.ts";
import { claudeCodeVersion, EXEC_FORM_MIN_VERSION, parseVersion, supportsExecForm } from "./claude-version.ts";
import { scratchBase } from "./fixtures/scratch.ts";

// Reading Claude Code's version, and what it says about the hook's form (decision 0061).

function bin() {
  const root = scratchBase("claude-version");
  const folder = join(root, "bin with space");
  mkdirSync(folder);
  return { root, folder };
}

test("parseVersion: what claude --version prints, and what isn't a version", () => {
  assert.equal(parseVersion("2.1.139 (Claude Code)\n"), "2.1.139");
  assert.equal(parseVersion("2.1.139 (Claude Code)\r\n"), "2.1.139");
  assert.equal(parseVersion("v2.1.139\n"), "2.1.139");
  assert.equal(parseVersion("2.1.139-beta.1 (Claude Code)"), "2.1.139");
  assert.equal(parseVersion("A notice on the first line\n2.1.139 (Claude Code)\n"), "2.1.139", "a line before it");
  for (const text of ["", "Claude Code", "version 2.1.139", "2.1", "2.1.139.4"]) assert.equal(parseVersion(text), null, text);
});

test("supportsExecForm: the minimum and everything around it, as numbers, not text", () => {
  assert.equal(EXEC_FORM_MIN_VERSION, "2.1.139");
  for (const version of ["2.1.139", "2.1.140", "2.1.1000", "2.2.0", "3.0.0", "10.0.0"]) assert.equal(supportsExecForm(version), true, version);
  for (const version of ["2.1.138", "2.1.99", "2.0.999", "1.99.999", "0.2.139"]) assert.equal(supportsExecForm(version), false, version);
});

test("on Windows npm's claude.cmd is found through PATHEXT and run by its absolute path, from the home folder, with a short timeout", () => {
  const { root, folder } = bin();
  writeFileSync(join(folder, "claude.cmd"), "");
  const where: Where = { home: root, env: { PATH: folder, PATHEXT: ".COM;.EXE;.BAT;.CMD" }, platform: "win32" };
  const calls: unknown[][] = [];
  const run: typeof runCli = (file, args, options) => {
    calls.push([file, args, options.platform, options.cwd, options.timeoutMs]);
    return { status: 0, stdout: "2.1.200 (Claude Code)\r\n", stderr: "" };
  };
  assert.equal(claudeCodeVersion(where, run), "2.1.200");
  assert.deepEqual(calls, [[join(folder, "claude.cmd"), ["--version"], "win32", root, 10_000]]);
});

test("a real claude.cmd shim in a folder with a space runs through cmd.exe", { skip: process.platform !== "win32" }, () => {
  const { root, folder } = bin();
  writeFileSync(join(folder, "claude.cmd"), "@echo off\r\necho 2.1.200 (Claude Code)\r\n");
  const where: Where = { home: root, env: { PATH: folder, PATHEXT: ".COM;.EXE;.BAT;.CMD", ComSpec: process.env.ComSpec, SystemRoot: process.env.SystemRoot }, platform: "win32" };
  assert.equal(claudeCodeVersion(where), "2.1.200");
});

test("unreadable: no claude command, a failing one, one that printed no version", () => {
  const { root, folder } = bin();
  const where: Where = { home: root, env: { PATH: folder, PATHEXT: ".CMD" }, platform: "win32" };
  let ran = 0;
  const running = (result: ReturnType<typeof runCli>): typeof runCli => () => { ran++; return result; };
  assert.equal(claudeCodeVersion(where, running({ status: 0, stdout: "2.1.200", stderr: "" })), null);
  assert.equal(ran, 0, "nothing to run");
  writeFileSync(join(folder, "claude.cmd"), "");
  assert.equal(claudeCodeVersion(where, running({ status: 1, stdout: "2.1.200", stderr: "failed" })), null, "a failed run");
  assert.equal(claudeCodeVersion(where, running({ status: -1, stdout: "", stderr: "timed out" })), null, "stopped by the timeout");
  assert.equal(claudeCodeVersion(where, running({ status: 0, stdout: "Claude Code\n", stderr: "" })), null, "no version");
});
