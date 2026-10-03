import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const version: string = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

test("runs from source under type stripping: magpie --version", () => {
  const main = fileURLToPath(new URL("./main.ts", import.meta.url));
  const r = spawnSync(process.execPath, [main, "--version"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), version);
});
