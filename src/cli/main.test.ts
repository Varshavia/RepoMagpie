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
});

test("runs from source under type stripping: magpie --version", () => {
  const main = fileURLToPath(new URL("./main.ts", import.meta.url));
  const r = spawnSync(process.execPath, [main, "--version"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), version);
});
