import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { codexOutput } from "./codex.ts";
import { RETRY_WINDOW, retryFile } from "./retry.ts";

// The Codex CLI adapter (decision 0036): Codex can't ask, so an exact avoid note denies the first
// try and the same install then goes through for 10 minutes; every other match informs. Inputs
// are the pre-check's captures (fixtures/codex-inputs.json).

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const withAlternatives = (text: string, entries: string[]) =>
  text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);
const CAPTURED: Record<string, unknown>[] = JSON.parse(readFileSync(new URL("./fixtures/codex-inputs.json", import.meta.url), "utf8")).inputs;
const T0 = Date.UTC(2026, 9, 16, 10, 0, 0);

const LEFT_PAD = note({ id: "pkg:npm/left-pad", verdict: "avoid: a pre-check test note, not a real one" });
const PDFKIT = withAlternatives(note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful", avoidWhen: ["you need streams"] }), ["[[puppeteer]]"]);
const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering" });

function world(files: Record<string, string>) {
  const root = scratchBase("hook-codex");
  for (const [path, text] of Object.entries({ "home/": "", "project/.git/": "", ...files })) {
    mkdirSync(join(root, path, path.endsWith("/") ? "" : ".."), { recursive: true });
    if (!path.endsWith("/")) writeFileSync(join(root, path), text);
  }
  const journal = join(root, "journal");
  mkdirSync(journal, { recursive: true });
  const project = join(root, "project");
  const ctx = (informOnly = false) => ({ env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: root, informOnly });
  // A captured input, or one like it with another command, in this world's project.
  const input = (command: string, fields: Record<string, unknown> = {}) => JSON.stringify({ ...CAPTURED[3], cwd: project, tool_input: { command }, ...fields });
  const run = (raw: string, options: { at?: number; informOnly?: boolean } = {}) => {
    const out = codexOutput(raw, ctx(options.informOnly), options.at ?? T0);
    return out === null ? null : JSON.parse(out);
  };
  return { root, journal, project, input, run, path: (file: string) => join(journal, "notes", file) };
}

test("the captured inputs: only the installs get an answer; the first is denied, the npm.cmd retry informs", () => {
  const w = world({ "journal/notes/npm--left-pad.md": LEFT_PAD });
  const answers = CAPTURED.map((input, i) => w.run(JSON.stringify({ ...input, cwd: w.project }), { at: T0 + i }));
  assert.deepEqual(answers.map((a) => a?.hookSpecificOutput.permissionDecision ?? (a ? "inform" : null)), [null, null, null, "deny", "inform", null]);
  assert.equal(answers[3].systemMessage, "RepoMagpie: stopped installing left-pad: you noted to avoid left-pad. Your agent should ask you; the same install goes through for the next 10 minutes.");
  assert.match(answers[4].hookSpecificOutput.additionalContext, /^RepoMagpie: your personal journal has a note on left-pad \(/);
});

test("a personal avoid note: the deny reason has the note, then the advice; the user gets one line", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  assert.deepEqual(w.run(w.input("npm install pdfkit")), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "RepoMagpie: you noted to avoid pdfkit (personal journal)\nVerdict: \"avoid: async streams painful\"\nAvoid when: \"you need streams\"\n" +
        `Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")\n${w.path("npm--pdfkit.md")}\n\n` +
        "RepoMagpie: this install was stopped once. Show the user this note and ask whether to install anyway or use an alternative; don't install it again without the user's OK. " +
        "If the user says to go ahead, install the same package again within 10 minutes: RepoMagpie lets it through until then.",
    },
    systemMessage: "RepoMagpie: stopped installing pdfkit: you noted to avoid pdfkit. Your agent should ask you; the same install goes through for the next 10 minutes.",
  });
});

test("a project avoid note says the project's journal says so; several stopped packages are named together", () => {
  const w = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--jspdf.md": note({ id: "pkg:npm/jspdf", verdict: "avoid: tiny API" }), "journal/notes/npm--puppeteer.md": PUPPETEER });
  const out = w.run(w.input("npm i puppeteer pdfkit jspdf"));
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(out.systemMessage, "RepoMagpie: stopped installing pdfkit, jspdf: this project's journal says to avoid pdfkit; you noted to avoid jspdf. Your agent should ask you; the same install goes through for the next 10 minutes.");
  const reason: string = out.hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.startsWith("RepoMagpie: this project's journal says to avoid pdfkit (written by the repository's contributors)\n"), reason);
  assert.match(reason, /\n\nRepoMagpie: you noted to avoid jspdf \(personal journal\)\n/);
  assert.match(reason, /\n\nRepoMagpie: note on puppeteer \(personal journal\)\n/);
  assert.ok(reason.endsWith("Show the user these notes and ask whether to install anyway or use an alternative; don't install them again without the user's OK. If the user says to go ahead, install the same packages again within 10 minutes: RepoMagpie lets them through until then."), reason);
});

test("any other match informs: context for the model, a line for the user, no decision", () => {
  const w = world({ "journal/notes/npm--puppeteer.md": PUPPETEER });
  assert.deepEqual(w.run(w.input("pnpm add puppeteer")), {
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: `RepoMagpie: your personal journal has a note on puppeteer (${w.path("npm--puppeteer.md")}). Its Verdict, quoted: "default for PDF rendering".` },
    systemMessage: "RepoMagpie: puppeteer (personal journal): \"default for PDF rendering\"",
  });
  assert.equal(existsSync(retryFile(w.journal)), false); // nothing denied, nothing recorded
});

test("the retry: the same install in any form informs until 10 minutes after the deny, then is denied again", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const decision = (command: string, at: number, fields = {}) => w.run(w.input(command, fields), { at }).hookSpecificOutput.permissionDecision ?? "inform";
  assert.equal(decision("npm install pdfkit", T0), "deny");
  assert.equal(decision("npm.cmd install pdfkit", T0 + 1_000), "inform"); // the sandboxed run failed on npm.ps1
  assert.equal(decision("npm.cmd install pdfkit", T0 + 60_000), "inform"); // Codex runs it again once approved
  assert.equal(decision("& npm install pdfkit --no-fund", T0 + 120_000), "inform");
  assert.equal(decision("npm install pdfkit", T0 + 1, { cwd: w.root }), "deny"); // another folder
  assert.equal(decision("npm install pdfkit", T0 + RETRY_WINDOW), "deny");
  const informed = w.run(w.input("npm install pdfkit"), { at: T0 + RETRY_WINDOW + 1 });
  assert.match(informed.hookSpecificOutput.additionalContext, /Offer them to the user instead of pdfkit/);
  assert.match(informed.systemMessage, /^RepoMagpie: pdfkit \(personal journal\): "avoid: async streams painful"/);
});

test("--inform-only never denies and records nothing", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  for (const at of [T0, T0 + 1]) {
    const out = w.run(w.input("npm install pdfkit"), { at, informOnly: true });
    assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
    assert.match(out.systemMessage, /^RepoMagpie: pdfkit/);
  }
  assert.equal(existsSync(retryFile(w.journal)), false);
});

test("a retry record that can't be written: it informs instead of denying", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  writeFileSync(join(w.journal, ".cache"), "a file, not a folder");
  const out = w.run(w.input("npm install pdfkit"));
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  assert.match(out.hookSpecificOutput.additionalContext, /has a note on pdfkit/);
});

test("shell commands only: apply_patch, MCP tools and other events get no answer; neither does bad input", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  for (const fields of [{ tool_name: "apply_patch" }, { tool_name: "mcp__repomagpie__recall" }, { tool_name: undefined }, { tool_name: "bash" }, { hook_event_name: "PostToolUse" }, { tool_input: "npm install pdfkit" }, { tool_input: { command: 42 } }]) {
    assert.equal(w.run(w.input("npm install pdfkit", fields)), null, JSON.stringify(fields));
  }
  for (const raw of ["", "not json", "null", "[]", "42"]) assert.equal(w.run(raw), null, raw);
  assert.equal(existsSync(retryFile(w.journal)), false);
});

test("a byte-order mark, a missing or empty cwd: the same answers, the folder then the process's", () => {
  const w = world({ "project/.magpie/notes/npm--puppeteer.md": PUPPETEER });
  const withCwd = w.run(w.input("npm i puppeteer"));
  assert.deepEqual(w.run(`${String.fromCharCode(0xfeff)}${w.input("npm i puppeteer")}`), withCwd);
  assert.equal(w.run(w.input("npm i puppeteer", { cwd: "" })), null); // the process folder (the root) has no project journal
  assert.equal(w.run(w.input("npm i puppeteer", { cwd: undefined })), null);
});

test("never approves: no answer has allow, ask or updatedInput, in any mode", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  const outputs = [
    ...["npm install pdfkit", "npm install pdfkit", "npm i puppeteer", "npm i pdfkit puppeteer"].map((c, i) => w.run(w.input(c), { at: T0 + i })),
    w.run(w.input("npm install pdfkit"), { informOnly: true }),
    w.run(w.input("npm install pdfkit"), { at: T0 + RETRY_WINDOW }),
  ];
  for (const out of outputs) {
    assert.ok(["deny", undefined].includes(out.hookSpecificOutput.permissionDecision), JSON.stringify(out));
    assert.equal(out.hookSpecificOutput.updatedInput, undefined);
    assert.deepEqual(Object.keys(out).sort(), ["hookSpecificOutput", "systemMessage"]);
  }
});

test("Codex's limit: 40 hostile, oversized notes keep every model-visible field under 5,000 characters, the advice whole", () => {
  const files: Record<string, string> = {};
  const names = Array.from({ length: 40 }, (_, i) => `pkg${i}${"x".repeat(150)}`);
  for (const [i, name] of names.entries()) {
    const alternatives = Array.from({ length: 30 }, (_, j) => `[[${"alt".repeat(100)}${i}-${j}]]`);
    files[`journal/notes/npm--${name}.md`] = withAlternatives(note({ id: `pkg:npm/${name}`, verdict: `avoid: ${"v".repeat(50_000)}`, avoidWhen: Array.from({ length: 30 }, () => "w".repeat(5000)) }), alternatives);
  }
  const w = world(files);
  const command = `npm install ${names.join(" ")}`;
  const denied = w.run(w.input(command));
  const reason: string = denied.hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.length < 5_000, String(reason.length));
  assert.ok(reason.endsWith("RepoMagpie lets them through until then."), reason.slice(-200));
  assert.match(reason, /RepoMagpie: \d+ more notes are not shown here/);
  assert.ok(denied.systemMessage.length < 2_000, String(denied.systemMessage.length));
  assert.match(denied.systemMessage, /, \+35 more: /);
  const informed = w.run(w.input(command), { at: T0 + 1 });
  for (const field of [informed.hookSpecificOutput.additionalContext, informed.systemMessage]) assert.ok(field.length < 5_000, String(field.length));
});
