import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./program.ts";

const COMMANDS = ["note", "import", "search", "suggest", "adopt", "recall", "init"];
const version: string = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

async function magpie(...argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, { out: (s) => { out += s; }, err: (s) => { err += s; } });
  return { code, out, err };
}

test("--version prints the package version", async () => {
  const r = await magpie("--version");
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), version);
});

test("--help lists every v0.1 command as not implemented yet", async () => {
  const r = await magpie("--help");
  assert.equal(r.code, 0);
  for (const command of COMMANDS) {
    assert.match(r.out, new RegExp(`^\\s+${command}\\b.*not implemented yet`, "m"), command);
  }
});

test("a v0.1 command says it is not implemented yet and exits 1", async () => {
  const r = await magpie("note", "pdfkit", "avoid: async streams painful");
  assert.equal(r.code, 1);
  assert.equal(r.out, "");
  assert.match(r.err, /magpie note: not implemented yet/);
});

test("an unknown command is a usage error (exit 2)", async () => {
  const r = await magpie("bogus");
  assert.equal(r.code, 2);
  assert.equal(r.out, "");
});
