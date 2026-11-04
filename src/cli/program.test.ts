import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./program.ts";

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

test("--help lists note, import, search, recall, suggest, init, adopt and hook", async () => {
  const r = await magpie("--help");
  assert.equal(r.code, 0);
  assert.match(r.out, /^\s+note \[options\] <name-or-url> \[text\]\s+capture a verdict in one line$/m);
  assert.match(r.out, /^\s+import \[options\] <file>\s+add many notes from a file$/m);
  assert.match(r.out, /^\s+search \[options\] <query>\s+keyword search across both journals$/m);
  assert.match(r.out, /^\s+recall \[options\] <package\.\.\.>\s+show your notes before an install$/m);
  assert.match(r.out, /^\s+suggest \[options\] \[description\]\s+show the notes that fit this project$/m);
  assert.match(r.out, /^\s+adopt \[options\] <name-or-purl>\s+copy a note into the project journal$/m);
  assert.match(r.out, /^\s+init \[options\]\s+your notes on this project's packages$/m);
  assert.match(r.out, /^\s+hook\s+adapters that agent hooks run/m);
  assert.doesNotMatch(r.out, /not implemented yet/);
});

// Decision 0031: the command is repomagpie; help names the alias once.
test("--help names the command repomagpie and says once that magpie is a short alias", async () => {
  const r = await magpie("--help");
  assert.match(r.out, /^Usage: repomagpie \[options\] \[command\]$/m);
  assert.equal(r.out.match(/short alias/g)?.length, 1);
  assert.match(r.out, /^magpie works as a short alias when no other magpie command is on your PATH\.$/m);
  assert.match((await magpie("note", "--help")).out, /^Usage: repomagpie note /m);
});

test("init without --auto does what init --auto does; --auto is still accepted", async () => {
  const plain = await magpie("init", "--json");
  const auto = await magpie("init", "--auto", "--json");
  assert.equal(plain.code, auto.code);
  assert.equal(plain.out, auto.out);
  assert.doesNotMatch(plain.err, /say what to do/);
  assert.match((await magpie("init", "--help")).out, /--auto +the same as init alone/);
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
