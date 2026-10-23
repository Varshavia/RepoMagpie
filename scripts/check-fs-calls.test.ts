import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { filesToScan, fsCalls } from "./check-fs-calls.ts";

// The check for fs calls that some Node releases get wrong on Windows paths with letters outside
// ASCII (fix/non-ascii-remove). This file holds the calls it looks for, so the check skips it.

const root = fileURLToPath(new URL("..", import.meta.url));
const calls = (text: string) => fsCalls(text).map((hit) => hit.call);

test("each call is found, with its line and column, however fs is reached", () => {
  assert.deepEqual(fsCalls(`const a = 1;\n  rmSync(path, { recursive: true });\n`), [{ line: 2, column: 3, call: "fs.rmSync" }]);
  assert.deepEqual(calls(`fs.rmSync(p);`), ["fs.rmSync"]);
  assert.deepEqual(calls(`cpSync(from, to, { recursive: true });`), ["fs.cpSync"]);
  assert.deepEqual(calls(`await fs.promises.rm(p, { recursive: true });`), ["fs.rm"]);
  assert.deepEqual(calls(`fs.rm(p, () => {});`), ["fs.rm"]);
  assert.deepEqual(calls(`await fs.cp(from, to);`), ["fs.cp"]);
  assert.deepEqual(calls(`rmdirSync(join(root, "x"), {\n  recursive: true,\n});`), ["rmdirSync with recursive"]);
  assert.deepEqual(calls(`fs.rmdir(p, { recursive: true }, done);`), ["rmdirSync with recursive"]);
});

test("an import of rm, cp, rmSync or cpSync is found, so an alias doesn't hide a call", () => {
  assert.deepEqual(calls(`import { rm as remove } from "node:fs/promises";\nawait remove(p);`), ["an import of rm, cp, rmSync or cpSync"]);
  assert.deepEqual(calls(`import fs, {\n  readFileSync,\n  cpSync,\n} from "fs";`), ["an import of rm, cp, rmSync or cpSync"]);
  assert.deepEqual(calls(`import { readFileSync, rmdirSync, unlinkSync } from "node:fs";`), []);
});

test("comments, rmdirSync without recursive and the replacements pass", () => {
  assert.deepEqual(calls(`// fs.rmSync(path) removed nothing\n/* cpSync(from, to) */\nconst url = "https://x"; // rmSync(p)\n`), []);
  assert.deepEqual(calls(`rmdirSync(path);\nmkdirSync(dir, { recursive: true });`), []);
  assert.deepEqual(calls(`removeFolder(path);\ncopyFolder(from, to);\nconst farmSync = 1; farm(rmSyncLike);`), []);
});

test("the scan covers the code under src/ and scripts/, not this test, docs or ui/", () => {
  const files = filesToScan(root).map((file) => file.slice(root.length).replace(/\\/g, "/"));
  for (const file of ["src/core/copy-folder.ts", "src/core/fixtures/scratch.ts", "scripts/build-cli.ts", "scripts/check-fs-calls.ts"]) assert.ok(files.includes(file), file);
  assert.ok(!files.includes("scripts/check-fs-calls.test.ts"));
  assert.ok(files.every((file) => /^(src|scripts)\/.+\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(file)));
});
