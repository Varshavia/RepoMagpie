import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { hookOutput } from "./claude-code.ts";
import { cursorOutput } from "./cursor.ts";
import { RETRY_WINDOW, retryFile } from "./retry.ts";

// The Cursor adapter (decision 0036): Cursor's ask isn't reliable, so an exact avoid note denies
// the first try (the note for the agent, a line for the user) and the same install then goes
// through for 10 minutes, with nothing printed. Inputs are the pre-check's captures
// (fixtures/cursor-inputs.json), each sent with the byte-order mark Cursor put in front.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const withAlternatives = (text: string, entries: string[]) =>
  text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);
const CAPTURED: Record<string, unknown>[] = JSON.parse(readFileSync(new URL("./fixtures/cursor-inputs.json", import.meta.url), "utf8")).inputs;
const BOM = String.fromCharCode(0xfeff);
const T0 = Date.UTC(2026, 9, 16, 10, 0, 0);

const PDFKIT = withAlternatives(note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful", avoidWhen: ["you need streams"] }), ["[[puppeteer]]"]);
const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering" });

function world(files: Record<string, string>) {
  const root = scratchBase("hook-cursor");
  for (const [path, text] of Object.entries({ "home/": "", "project/.git/": "", ...files })) {
    mkdirSync(join(root, path, path.endsWith("/") ? "" : ".."), { recursive: true });
    if (!path.endsWith("/")) writeFileSync(join(root, path), text);
  }
  const journal = join(root, "journal");
  mkdirSync(journal, { recursive: true });
  const project = join(root, "project");
  // Cursor's form of a workspace root: /C:/… on Windows.
  const workspaceRoot = process.platform === "win32" ? `/${project.replace(/\\/g, "/")}` : project;
  const ctx = (informOnly = false) => ({ env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: root, informOnly });
  const input = (command: unknown, fields: Record<string, unknown> = {}) =>
    `${BOM}${JSON.stringify({ ...CAPTURED[1], cwd: project, workspace_roots: [workspaceRoot], command, ...fields })}`;
  const run = (raw: string, options: { at?: number; informOnly?: boolean } = {}) => {
    const out = cursorOutput(raw, ctx(options.informOnly), options.at ?? T0);
    return out === null ? null : JSON.parse(out);
  };
  return { root, journal, project, workspaceRoot, ctx, input, run, path: (file: string) => join(journal, "notes", file) };
}

test("the captured inputs: only the first install is denied; the recall commands and the retry get nothing", () => {
  const w = world({ "journal/notes/npm--left-pad.md": note({ id: "pkg:npm/left-pad", verdict: "avoid: a pre-check test note, not a real one" }) });
  const answers = CAPTURED.map((input, i) => w.run(`${BOM}${JSON.stringify({ ...input, cwd: input.cwd === "" ? "" : w.project, workspace_roots: [w.workspaceRoot] })}`, { at: T0 + i }));
  assert.deepEqual(answers.map((a) => a?.permission ?? null), [null, "deny", null, null]);
});

test("a personal avoid note: deny, the note and the advice for the agent, a line for the user, nothing else", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  assert.deepEqual(w.run(w.input("npm install pdfkit")), {
    permission: "deny",
    user_message: "RepoMagpie: stopped installing pdfkit: you noted to avoid pdfkit. Your agent should ask you; the same install goes through for the next 10 minutes.",
    agent_message: "RepoMagpie: you noted to avoid pdfkit (personal journal)\nVerdict: \"avoid: async streams painful\"\nAvoid when: \"you need streams\"\n" +
      `Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")\n${w.path("npm--pdfkit.md")}\n\n` +
      "RepoMagpie: this install was stopped once. Show the user this note and ask whether to install anyway or use an alternative; don't install it again without the user's OK. " +
      "If the user says to go ahead, install the same package again within 10 minutes: RepoMagpie lets it through until then.",
  });
});

test("the retry: the same install in any form gets nothing until 10 minutes after the deny, then is denied again", () => {
  const w = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  const decision = (command: string, at: number, fields = {}) => w.run(w.input(command, fields), { at })?.permission ?? null;
  assert.equal(decision("npm install pdfkit", T0), "deny");
  assert.equal(decision("npm.cmd install pdfkit", T0 + 1_000), null);
  assert.equal(decision("pnpm add pdfkit --save-dev", T0 + 2_000), null);
  assert.equal(decision("npm install pdfkit", T0 + RETRY_WINDOW), "deny");
});

test("any other match, --inform-only and an unwritable record print nothing: never {}, which may count as allow", () => {
  const w = world({ "journal/notes/npm--puppeteer.md": PUPPETEER, "journal/notes/npm--pdfkit.md": PDFKIT });
  assert.equal(w.run(w.input("npm i puppeteer")), null);
  assert.equal(w.run(w.input("npm i pdfkit"), { informOnly: true }), null);
  assert.equal(existsSync(retryFile(w.journal)), false);
  const blocked = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/.cache": "a file" });
  assert.equal(blocked.run(blocked.input("npm install pdfkit")), null);
});

test("the folder: cwd, else the first workspace root (/C:/… on Windows), else the process's", () => {
  const w = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  assert.equal(w.run(w.input("npm i pdfkit", { cwd: "" })).permission, "deny"); // from the workspace root
  const v = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  assert.equal(v.run(v.input("npm i pdfkit", { cwd: undefined, workspace_roots: [] })), null); // the process folder: no project journal
  assert.equal(v.run(v.input("npm i pdfkit", { cwd: "", workspace_roots: "not a list" })), null);
});

test("beforeShellExecution only; bad input prints nothing", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  for (const hook_event_name of ["preToolUse", "afterShellExecution", "beforeMCPExecution", "PreToolUse"]) assert.equal(w.run(w.input("npm install pdfkit", { hook_event_name })), null, hook_event_name);
  for (const command of [42, null, ["npm", "install", "pdfkit"]]) assert.equal(w.run(w.input(command)), null, JSON.stringify(command));
  for (const raw of ["", BOM, "not json", "null", "[]"]) assert.equal(w.run(raw), null, JSON.stringify(raw));
});

test("one answer per agent: Cursor's input gets the Cursor adapter's answer and nothing from the Claude Code hook", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const raw = w.input("npm install pdfkit");
  assert.equal(hookOutput(raw, w.ctx()), null);
  assert.equal(w.run(raw).permission, "deny");
});

test("never approves, and always the schema: nothing, or exactly permission deny with user_message and agent_message", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  for (const [i, command] of ["npm install pdfkit", "npm install pdfkit", "npm i puppeteer", "npm i pdfkit puppeteer", "npm test"].entries()) {
    for (const informOnly of [false, true]) {
      const out = w.run(w.input(command), { at: T0 + i, informOnly });
      assert.ok(out === null || (Object.keys(out).join() === "permission,user_message,agent_message" && out.permission === "deny" && typeof out.user_message === "string" && typeof out.agent_message === "string"), JSON.stringify(out));
    }
  }
});
