import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

test("a damaged recall cache doesn't silence the hook: an entry of the wrong shape is rebuilt, and the avoid note still asks", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--zod.md": renderNote({ id: "pkg:npm/zod", name: "zod", explored: "2026-10-04", kind: "library", tags: [], verdict: "fine" }) });
  await magpie(box, ["hook", "claude-code"], { stdin: async () => input("npm i pdfkit", box.project) }); // builds the cache
  const cacheFile = join(box.journal, ".cache", "recall-index.json");
  const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as { data: Record<string, unknown>[] };
  writeFileSync(cacheFile, JSON.stringify({ ...cache, data: cache.data.map((e) => (e.file === "npm--zod.md" ? { ...e, keys: undefined } : e)) }));
  const r = await magpie(box, ["hook", "claude-code"], { stdin: async () => input("npm i pdfkit", box.project) });
  assert.deepEqual([r.code, r.err], [0, ""]);
  assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, "ask");
  assert.equal(existsSync(join(box.journal, ".cache", "hook-errors.log")), false);
});

test("--inform-only never asks", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const r = await magpie(box, ["hook", "claude-code", "--inform-only"], { stdin: async () => input("npm i pdfkit", box.project) });
  assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, undefined);
  assert.match(JSON.parse(r.out).systemMessage, /^RepoMagpie: pdfkit/);
});

test("nothing to say, or bad input: nothing on stdout or stderr, exit 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  for (const stdin of ["", "not json", input("npm i left-pad", box.project)]) {
    const r = await magpie(box, ["hook", "claude-code"], { stdin: async () => stdin });
    assert.deepEqual([r.code, r.out, r.err], [0, "", ""], stdin);
  }
});

test("fails open: an error prints nothing, exits 0, and goes to the personal journal's .cache/hook-errors.log", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const r = await magpie(box, ["hook", "claude-code"], { stdin: async () => { throw new Error("stdin broke"); } });
  assert.deepEqual([r.code, r.out, r.err], [0, "", ""]);
  const log = readFileSync(join(box.journal, ".cache", "hook-errors.log"), "utf8");
  assert.match(log, /^\d{4}-\d\d-\d\dT[\d:.]+Z Error: stdin broke/);
});

test("a folder named like a note is not a note: the hook answers for the real ones", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--broken.md/": null });
  const r = await magpie(box, ["hook", "claude-code"], { stdin: async () => input("npm i pdfkit", box.project) });
  assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, "ask");
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
  assert.match(r.out, /"command": "repomagpie hook claude-code"/);
  assert.match(r.out, /--inform-only/);
  assert.match(r.out, /never edits/);
});

// --- repomagpie hook codex (decision 0036) ---------------------------------------------------

test("hook codex: the first try of an avoided install is denied and recorded, the next one informs; exit 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const first = await magpie(box, ["hook", "codex"], { stdin: async () => input("npm install pdfkit", box.project) });
  assert.deepEqual([first.code, first.err], [0, ""]);
  assert.equal(JSON.parse(first.out).hookSpecificOutput.permissionDecision, "deny");
  assert.match(JSON.parse(first.out).systemMessage, /^RepoMagpie: stopped installing pdfkit: you noted to avoid pdfkit\./);
  assert.equal(existsSync(join(box.journal, ".cache", "hook-retry.json")), true);
  const retry = await magpie(box, ["hook", "codex"], { stdin: async () => input("npm.cmd install pdfkit", box.project) });
  assert.equal(JSON.parse(retry.out).hookSpecificOutput.permissionDecision, undefined);
  assert.match(JSON.parse(retry.out).hookSpecificOutput.additionalContext, /has a note on pdfkit/);
});

test("hook codex --inform-only never denies; nothing to say prints nothing; an error fails open", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const r = await magpie(box, ["hook", "codex", "--inform-only"], { stdin: async () => input("npm i pdfkit", box.project) });
  assert.equal(JSON.parse(r.out).hookSpecificOutput.permissionDecision, undefined);
  for (const stdin of ["", "not json", input("npm i left-pad", box.project)]) {
    const silent = await magpie(box, ["hook", "codex"], { stdin: async () => stdin });
    assert.deepEqual([silent.code, silent.out, silent.err], [0, "", ""], stdin);
  }
  const broken = await magpie(box, ["hook", "codex"], { stdin: async () => { throw new Error("stdin broke"); } });
  assert.deepEqual([broken.code, broken.out, broken.err], [0, "", ""]);
  assert.match(readFileSync(join(box.journal, ".cache", "hook-errors.log"), "utf8"), /Error: stdin broke/);
});

test("hook codex --help prints the hooks.json snippet, the Windows form, the trust step and what a deny does", async () => {
  const r = await magpie(sandbox(), ["hook", "codex", "--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /~\/\.codex\/hooks\.json/);
  assert.match(r.out, /"matcher": "Bash"/);
  assert.match(r.out, /"command": "repomagpie hook codex", "timeout": 10/);
  assert.match(r.out, /repomagpie\.cmd hook codex/);
  assert.match(r.out, /\/hooks/);
  assert.match(r.out, /within 10 minutes goes through/);
});
