import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { copilotOutput } from "./copilot.ts";
import { RETRY_WINDOW, retryFile } from "./retry.ts";

// The Copilot CLI adapter (decision 0036): Copilot CLI 1.0.98 runs a call unasked when a hook
// answers ask, so an exact avoid note denies the first try and the same install then goes through
// for 10 minutes, with nothing printed. Inputs are the pre-check's captures
// (fixtures/copilot-inputs.json).

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const withAlternatives = (text: string, entries: string[]) =>
  text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);
const CAPTURED: Record<string, unknown>[] = JSON.parse(readFileSync(new URL("./fixtures/copilot-inputs.json", import.meta.url), "utf8")).inputs;
const T0 = Date.UTC(2026, 9, 16, 10, 0, 0);

const PDFKIT = withAlternatives(note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful", avoidWhen: ["you need streams"] }), ["[[puppeteer]]"]);
const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering" });

function world(files: Record<string, string>) {
  const root = scratchBase("hook-copilot");
  for (const [path, text] of Object.entries({ "home/": "", "project/.git/": "", ...files })) {
    mkdirSync(join(root, path, path.endsWith("/") ? "" : ".."), { recursive: true });
    if (!path.endsWith("/")) writeFileSync(join(root, path), text);
  }
  const journal = join(root, "journal");
  mkdirSync(journal, { recursive: true });
  const project = join(root, "project");
  const input = (command: unknown, fields: Record<string, unknown> = {}) =>
    JSON.stringify({ ...CAPTURED[2], cwd: project, toolArgs: { command, description: "Install", initial_wait: 120 }, ...fields });
  const run = (raw: string, options: { at?: number; informOnly?: boolean } = {}) => {
    const out = copilotOutput(raw, { env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: root, informOnly: options.informOnly ?? false }, options.at ?? T0);
    return out === null ? null : JSON.parse(out);
  };
  return { root, journal, project, input, run, path: (file: string) => join(journal, "notes", file) };
}

test("the captured inputs: only the first install is denied; skill, ask_user (which names the package) and the retry get nothing", () => {
  const w = world({ "journal/notes/npm--left-pad.md": note({ id: "pkg:npm/left-pad", verdict: "avoid: a pre-check test note, not a real one" }) });
  const answers = CAPTURED.map((input, i) => w.run(JSON.stringify({ ...input, cwd: w.project }), { at: T0 + i }));
  assert.deepEqual(answers.map((a) => a?.permissionDecision ?? null), [null, null, "deny", null, null, null]);
});

test("a personal avoid note: deny, the reason with the note and then the advice", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  assert.deepEqual(w.run(w.input("npm install pdfkit")), {
    permissionDecision: "deny",
    permissionDecisionReason: "RepoMagpie: you noted to avoid pdfkit (personal journal)\nVerdict: \"avoid: async streams painful\"\nAvoid when: \"you need streams\"\n" +
      `Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")\n${w.path("npm--pdfkit.md")}\n\n` +
      "RepoMagpie: this install was stopped once. Show the user this note and ask whether to install anyway or use an alternative; don't install it again without the user's OK. " +
      "If the user says to go ahead, install the same package again within 10 minutes: RepoMagpie lets it through until then.",
  });
  assert.equal(existsSync(retryFile(w.journal)), true);
});

test("the retry: the same install in any form gets nothing until 10 minutes after the deny, then is denied again", () => {
  const w = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  const decision = (command: string, at: number, fields = {}) => w.run(w.input(command, fields), { at })?.permissionDecision ?? null;
  assert.equal(decision("npm install pdfkit", T0), "deny");
  assert.equal(decision("npm.cmd install pdfkit", T0 + 1_000), null);
  assert.equal(decision("& npm install pdfkit", T0 + 60_000), null);
  assert.equal(decision("npm install pdfkit", T0 + 1, { toolName: "bash" }), null); // the same agent and folder
  assert.equal(decision("npm install pdfkit", T0 + 1, { cwd: w.root }), null); // another folder, where no note matches
  assert.equal(decision("npm install pdfkit", T0 + RETRY_WINDOW), "deny");
});

test("any other match, --inform-only and an unwritable record print nothing: Copilot CLI has no field for it", () => {
  const w = world({ "journal/notes/npm--puppeteer.md": PUPPETEER, "journal/notes/npm--pdfkit.md": PDFKIT });
  assert.equal(w.run(w.input("npm i puppeteer")), null);
  assert.equal(w.run(w.input("npm i pdfkit"), { informOnly: true }), null);
  assert.equal(existsSync(retryFile(w.journal)), false);
  const blocked = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/.cache": "a file" });
  assert.equal(blocked.run(blocked.input("npm install pdfkit")), null);
});

test("the shell tools only, Copilot CLI's input only: VS Code's payload in the same folder gets no answer", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  for (const toolName of ["skill", "ask_user", "edit", "view", "Bash", "PowerShell", "mcp"]) assert.equal(w.run(w.input("npm install pdfkit", { toolName })), null, toolName);
  const vscode = JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s", timestamp: "2026-10-16T10:00:00.000Z", cwd: w.project, tool_name: "run_in_terminal", tool_input: { command: "npm install pdfkit" }, tool_use_id: "t" });
  assert.equal(w.run(vscode), null);
  assert.equal(w.run(w.input("npm install pdfkit", { hook_event_name: "PreToolUse" })), null);
  for (const raw of ["", "not json", "null", "[]", JSON.stringify({ toolName: "powershell", toolArgs: 42 })]) assert.equal(w.run(raw), null, raw);
  assert.equal(w.run(w.input(42)), null);
});

test("toolArgs as JSON in a string, a byte-order mark and a missing cwd", () => {
  const w = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  const stringArgs = JSON.stringify({ ...CAPTURED[2], cwd: w.project, toolArgs: JSON.stringify({ command: "npm install pdfkit" }) });
  assert.equal(w.run(stringArgs).permissionDecision, "deny");
  const other = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  assert.equal(other.run(`${String.fromCharCode(0xfeff)}${other.input("npm install pdfkit")}`).permissionDecision, "deny");
  assert.equal(other.run(other.input("npm install pdfkit", { cwd: undefined })), null); // the process folder has no project journal
  assert.equal(other.run(JSON.stringify({ ...CAPTURED[2], cwd: other.project, toolArgs: "{not json" })), null);
});

test("never approves: only deny, never allow, ask or modifiedArgs", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  for (const [i, command] of ["npm install pdfkit", "npm install pdfkit", "npm i puppeteer", "npm i pdfkit puppeteer"].entries()) {
    for (const informOnly of [false, true]) {
      const out = w.run(w.input(command), { at: T0 + i, informOnly });
      assert.ok(out === null || Object.keys(out).join() === "permissionDecision,permissionDecisionReason" && out.permissionDecision === "deny", JSON.stringify(out));
    }
  }
});
