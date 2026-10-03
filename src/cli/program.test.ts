import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./program.ts";

const NOT_YET = ["import", "search", "suggest", "adopt", "recall", "init"];
const version: string = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

// These tests never reach a journal or the network: every call below fails fast if they do.
async function magpie(...argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, {
    out: (s) => { out += s; },
    err: (s) => { err += s; },
    env: {},
    cwd: "/nonexistent",
    home: "/nonexistent",
    fetch: () => Promise.reject(new Error("no network in tests")),
    today: () => "2026-10-04",
    interactive: false,
    ask: () => Promise.reject(new Error("no prompt in tests")),
  });
  return { code, out, err };
}

test("--version prints the package version", async () => {
  const r = await magpie("--version");
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), version);
});

test("--help lists note, and every v0.1 command not built yet as not implemented yet", async () => {
  const r = await magpie("--help");
  assert.equal(r.code, 0);
  assert.match(r.out, /^\s+note \[options\] <name-or-url> \[text\]\s+capture a verdict in one line$/m);
  for (const command of NOT_YET) {
    assert.match(r.out, new RegExp(`^\\s+${command}\\b.*not implemented yet`, "m"), command);
  }
});

test("a v0.1 command not built yet says so and exits 1", async () => {
  const r = await magpie("search", "pdf");
  assert.equal(r.code, 1);
  assert.equal(r.out, "");
  assert.match(r.err, /magpie search: not implemented yet/);
});

test("a choice outside --to's list is a usage error (exit 2)", async () => {
  const r = await magpie("note", "pdfkit", "--to", "team");
  assert.equal(r.code, 2);
});

test("an unknown command is a usage error (exit 2)", async () => {
  const r = await magpie("bogus");
  assert.equal(r.code, 2);
  assert.equal(r.out, "");
});
