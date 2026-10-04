import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// magpie hook claude-code (spec §6): stdin in, one JSON document or nothing out, always exit 0.

const PDFKIT = renderNote({ id: "pkg:npm/pdfkit", name: "pdfkit", explored: "2026-10-04", kind: "library", tags: [], verdict: "avoid: async streams painful" });
const input = (command: string, cwd: string) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd });

test("reads the tool call on stdin and prints the hook's JSON; exit 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const r = await magpie(box, ["hook", "claude-code"], { stdin: async () => input("npm i pdfkit", box.project) });
  assert.equal(r.code, 0);
  assert.equal(r.err, "");
  assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, "ask");
});

test("--inform-only never asks", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const r = await magpie(box, ["hook", "claude-code", "--inform-only"], { stdin: async () => input("npm i pdfkit", box.project) });
  assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, undefined);
  assert.match(JSON.parse(r.out).systemMessage, /^magpie: pdfkit/);
});

test("nothing to say, or bad input: nothing on stdout or stderr, exit 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  for (const stdin of ["", "not json", input("npm i left-pad", box.project)]) {
    const r = await magpie(box, ["hook", "claude-code"], { stdin: async () => stdin });
    assert.deepEqual([r.code, r.out, r.err], [0, "", ""], stdin);
  }
});

test("fails open: an error prints nothing, exits 0, and goes to the personal journal's .cache/hook-errors.log", async () => {
  // A folder named like a note can't be read as one.
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--broken.md/": null });
  const r = await magpie(box, ["hook", "claude-code"], { stdin: async () => input("npm i pdfkit", box.project) });
  assert.deepEqual([r.code, r.out, r.err], [0, "", ""]);
  const log = readFileSync(join(box.journal, ".cache", "hook-errors.log"), "utf8");
  assert.match(log, /^\d{4}-\d\d-\d\dT[\d:.]+Z /);
});

test("an error with no personal journal logs nowhere and creates nothing", async () => {
  const box = sandbox();
  const r = await magpie(box, ["hook", "claude-code"], { stdin: async () => { throw new Error("stdin broke"); } });
  assert.deepEqual([r.code, r.out, r.err], [0, "", ""]);
  assert.equal(existsSync(box.journal), false);
});

test("a usage error under hook never exits 2 (exit 2 would block the tool call): a typo in the settings exits 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  for (const argv of [["hook", "claude-code", "--inform-onyl"], ["hook", "cursor"], ["hook"]]) {
    const r = await magpie(box, argv, { stdin: async () => input("npm i pdfkit", box.project) });
    assert.equal(r.code, 0, argv.join(" "));
    assert.equal(r.out, "");
  }
});

test("--help prints the settings snippet and the --inform-only advice", async () => {
  const box = sandbox();
  const r = await magpie(box, ["hook", "claude-code", "--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /"matcher": "Bash\|PowerShell"/);
  assert.match(r.out, /"command": "magpie hook claude-code"/);
  assert.match(r.out, /--inform-only/);
  assert.match(r.out, /never edits/);
});
