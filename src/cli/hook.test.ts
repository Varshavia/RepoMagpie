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
  for (const argv of [["hook", "claude-code", "--inform-onyl"], ["hook", "windsurf"], ["hook"]]) {
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

test("hook codex: the first try of an avoided install is denied and recorded, the next one is let through; exit 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const first = await magpie(box, ["hook", "codex"], { stdin: async () => input("npm install pdfkit", box.project) });
  assert.deepEqual([first.code, first.err], [0, ""]);
  assert.equal(JSON.parse(first.out).hookSpecificOutput.permissionDecision, "deny");
  assert.match(JSON.parse(first.out).systemMessage, /^RepoMagpie: stopped installing pdfkit: you noted to avoid pdfkit\./);
  assert.equal(existsSync(join(box.journal, ".cache", "hook-retry.json")), true);
  const retry = await magpie(box, ["hook", "codex"], { stdin: async () => input("npm.cmd install pdfkit", box.project) });
  assert.equal(JSON.parse(retry.out).hookSpecificOutput.permissionDecision, undefined);
  assert.match(JSON.parse(retry.out).systemMessage, /^RepoMagpie: let this install of pdfkit through: /);
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

// --- repomagpie hook gemini-cli (decision 0036) ----------------------------------------------

const geminiInput = (command: string, cwd: string) => JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command }, cwd });

test("hook gemini-cli: an avoid note asks, --inform-only informs, nothing to say prints nothing; exit 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const asked = await magpie(box, ["hook", "gemini-cli"], { stdin: async () => geminiInput("npm install pdfkit", box.project) });
  assert.deepEqual([asked.code, asked.err], [0, ""]);
  assert.equal(JSON.parse(asked.out).decision, "ask");
  assert.match(JSON.parse(asked.out).systemMessage, /^RepoMagpie: you noted to avoid pdfkit \(personal journal\)\n/);
  const informed = await magpie(box, ["hook", "gemini-cli", "--inform-only"], { stdin: async () => geminiInput("npm install pdfkit", box.project) });
  assert.deepEqual(Object.keys(JSON.parse(informed.out)), ["systemMessage"]);
  for (const stdin of ["", "not json", geminiInput("npm i left-pad", box.project), input("npm i pdfkit", box.project)]) {
    const silent = await magpie(box, ["hook", "gemini-cli"], { stdin: async () => stdin });
    assert.deepEqual([silent.code, silent.out, silent.err], [0, "", ""], stdin);
  }
});

test("hook gemini-cli --help prints the settings.json snippet, the Windows form and --inform-only", async () => {
  const r = await magpie(sandbox(), ["hook", "gemini-cli", "--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /~\/\.gemini\/settings\.json/);
  assert.match(r.out, /"BeforeTool"/);
  assert.match(r.out, /"matcher": "run_shell_command"/);
  assert.match(r.out, /"command": "repomagpie hook gemini-cli", "timeout": 10000/);
  assert.match(r.out, /repomagpie\.cmd hook gemini-cli/);
  assert.match(r.out, /--inform-only/);
});

// --- repomagpie hook antigravity (decision 0036) ---------------------------------------------

const antigravityInput = (command: string, cwd: string) => JSON.stringify({ conversationId: "c", stepIdx: 6, toolCall: { name: "run_command", args: { CommandLine: command, Cwd: cwd } }, workspacePaths: [cwd] });

test("hook antigravity: an avoid note answers force_ask; --inform-only and anything else print nothing; exit 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const asked = await magpie(box, ["hook", "antigravity"], { stdin: async () => antigravityInput("npm install pdfkit", box.project) });
  assert.deepEqual([asked.code, asked.err], [0, ""]);
  assert.equal(JSON.parse(asked.out).decision, "force_ask");
  assert.match(JSON.parse(asked.out).reason, /^RepoMagpie: you noted to avoid pdfkit \(personal journal\)\n/);
  for (const [argv, stdin] of [[["hook", "antigravity", "--inform-only"], antigravityInput("npm install pdfkit", box.project)], [["hook", "antigravity"], ""], [["hook", "antigravity"], input("npm i pdfkit", box.project)]] as [string[], string][]) {
    const silent = await magpie(box, argv, { stdin: async () => stdin });
    assert.deepEqual([silent.code, silent.out, silent.err], [0, "", ""], stdin);
  }
});

test("hook antigravity --help prints the hooks.json snippet and what the hook does", async () => {
  const r = await magpie(sandbox(), ["hook", "antigravity", "--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /~\/\.gemini\/config\/hooks\.json/);
  assert.match(r.out, /"repomagpie": \{/);
  assert.match(r.out, /"matcher": "run_command"/);
  assert.match(r.out, /"command": "repomagpie hook antigravity", "timeout": 10/);
  assert.match(r.out, /always allow/);
});

// --- repomagpie hook copilot (decision 0036) -------------------------------------------------

const copilotInput = (command: string, cwd: string) => JSON.stringify({ sessionId: "s", timestamp: 1, cwd, toolName: "powershell", toolArgs: { command } });

test("hook copilot: the first try is denied, the retry and --inform-only print nothing; an error fails open with exit 0", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const denied = await magpie(box, ["hook", "copilot"], { stdin: async () => copilotInput("npm install pdfkit", box.project) });
  assert.deepEqual([denied.code, denied.err], [0, ""]);
  assert.equal(JSON.parse(denied.out).permissionDecision, "deny");
  for (const [argv, stdin] of [[["hook", "copilot"], copilotInput("npm.cmd install pdfkit", box.project)], [["hook", "copilot", "--inform-only"], copilotInput("npm i pdfkit", box.project)], [["hook", "copilot"], "not json"]] as [string[], string][]) {
    const silent = await magpie(box, argv, { stdin: async () => stdin });
    assert.deepEqual([silent.code, silent.out, silent.err], [0, "", ""], stdin);
  }
  const broken = await magpie(box, ["hook", "copilot"], { stdin: async () => { throw new Error("stdin broke"); } });
  assert.deepEqual([broken.code, broken.out, broken.err], [0, "", ""]); // any other exit would deny every tool call
});

test("hook copilot --help prints its own hook file, the Windows form and the deny-on-failure warning", async () => {
  const r = await magpie(sandbox(), ["hook", "copilot", "--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /~\/\.copilot\/hooks\/repomagpie\.json/);
  assert.match(r.out, /"version": 1/);
  assert.match(r.out, /"preToolUse"/);
  assert.match(r.out, /"bash": "repomagpie hook copilot"/);
  assert.match(r.out, /"powershell": "repomagpie\.cmd hook copilot", "timeoutSec": 10/);
  assert.match(r.out, /denies every tool call when a hook can't start/);
  assert.match(r.out, /VS Code/);
});

// --- repomagpie hook cursor (decision 0036) --------------------------------------------------

const cursorInput = (command: string, cwd: string) => `${String.fromCharCode(0xfeff)}${JSON.stringify({ conversation_id: "c", generation_id: "g", hook_event_name: "beforeShellExecution", cursor_version: "3.24.18", command, cwd, workspace_roots: [cwd] })}`;

test("hook cursor: the first try is denied, the retry and --inform-only print nothing; hook claude-code stays silent on the same input", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const denied = await magpie(box, ["hook", "cursor"], { stdin: async () => cursorInput("npm install pdfkit", box.project) });
  assert.deepEqual([denied.code, denied.err], [0, ""]);
  assert.deepEqual(Object.keys(JSON.parse(denied.out)), ["permission", "user_message", "agent_message"]);
  for (const [argv, stdin] of [[["hook", "cursor"], cursorInput("npm.cmd install pdfkit", box.project)], [["hook", "cursor", "--inform-only"], cursorInput("npm i pdfkit", box.project)], [["hook", "claude-code"], cursorInput("npm i pdfkit", box.project)]] as [string[], string][]) {
    const silent = await magpie(box, argv, { stdin: async () => stdin });
    assert.deepEqual([silent.code, silent.out, silent.err], [0, "", ""], argv.join(" "));
  }
});

test("hook cursor --help prints the hooks.json snippet, the Windows form and what a deny does", async () => {
  const r = await magpie(sandbox(), ["hook", "cursor", "--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /~\/\.cursor\/hooks\.json/);
  assert.match(r.out, /"beforeShellExecution"/);
  assert.match(r.out, /"command": "repomagpie hook cursor", "timeout": 10/);
  assert.match(r.out, /-ExecutionPolicy Bypass/);
  assert.match(r.out, /within\s+10 minutes goes through/);
});
