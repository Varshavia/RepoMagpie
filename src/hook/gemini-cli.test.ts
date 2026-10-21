import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { geminiOutput } from "./gemini-cli.ts";
import { RETRY_WINDOW, retryFile } from "./retry.ts";

// The Gemini CLI adapter (decision 0036): an exact avoid note asks (`decision: "ask"`, the note in
// systemMessage); any other match shows the user a line. Inputs are built from Gemini CLI's source
// (fixtures/gemini-cli-inputs.json); no capture exists.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const withAlternatives = (text: string, entries: string[]) =>
  text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);
const BUILT: Record<string, unknown>[] = JSON.parse(readFileSync(new URL("./fixtures/gemini-cli-inputs.json", import.meta.url), "utf8")).inputs;
const T0 = Date.UTC(2026, 9, 16, 10, 0, 0);

const PDFKIT = withAlternatives(note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful", avoidWhen: ["you need streams"] }), ["[[puppeteer]]"]);
const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering" });

function world(files: Record<string, string>) {
  const root = scratchBase("hook-gemini");
  for (const [path, text] of Object.entries({ "home/": "", "project/.git/": "", ...files })) {
    mkdirSync(join(root, path, path.endsWith("/") ? "" : ".."), { recursive: true });
    if (!path.endsWith("/")) writeFileSync(join(root, path), text);
  }
  const journal = join(root, "journal");
  mkdirSync(journal, { recursive: true });
  const project = join(root, "project");
  const input = (command: string, fields: Record<string, unknown> = {}, toolInput: Record<string, unknown> = {}) =>
    JSON.stringify({ ...BUILT[0], cwd: project, tool_input: { command, description: "Install", ...toolInput }, ...fields });
  const run = (raw: string, options: { at?: number; informOnly?: boolean; onAvoid?: "ask" | "deny" } = {}) => {
    const out = geminiOutput(raw, { env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: root, informOnly: options.informOnly ?? false }, options.at ?? T0, options.onAvoid);
    return out === null ? null : JSON.parse(out);
  };
  return { root, journal, project, input, run, path: (file: string) => join(journal, "notes", file) };
}

test("a personal avoid note asks: decision ask, and the note in systemMessage for Gemini CLI's prompt", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  assert.deepEqual(w.run(w.input("npm install pdfkit")), {
    decision: "ask",
    systemMessage: "RepoMagpie: you noted to avoid pdfkit (personal journal)\nVerdict: \"avoid: async streams painful\"\nAvoid when: \"you need streams\"\n" +
      `Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")\n${w.path("npm--pdfkit.md")}`,
  });
  assert.equal(existsSync(retryFile(w.journal)), false); // asking needs no retry record
});

test("a project avoid note asks too, and says the project's journal says so; every ask asks again", () => {
  const w = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  for (const at of [T0, T0 + 1]) {
    const out = w.run(w.input("pnpm add pdfkit"), { at });
    assert.equal(out.decision, "ask");
    assert.ok(out.systemMessage.startsWith("RepoMagpie: this project's journal says to avoid pdfkit (written by the repository's contributors)\n"), out.systemMessage);
  }
});

test("any other match shows the user a line and decides nothing", () => {
  const w = world({ "journal/notes/npm--puppeteer.md": PUPPETEER });
  assert.deepEqual(w.run(w.input("npm i puppeteer")), { systemMessage: "RepoMagpie: puppeteer (personal journal): \"default for PDF rendering\"" });
});

test("--inform-only never asks: the avoid note is a line for the user", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  assert.deepEqual(w.run(w.input("npm install pdfkit"), { informOnly: true }), {
    systemMessage: "RepoMagpie: pdfkit (personal journal): \"avoid: async streams painful\". Avoid when: \"you need streams\". Alternatives: \"puppeteer\"",
  });
});

test("the switch to deny (one constant): the first try is denied and recorded, the same install is let through for 10 minutes", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const denied = w.run(w.input("npm install pdfkit"), { onAvoid: "deny" });
  assert.equal(denied.decision, "deny");
  assert.ok(denied.reason.startsWith("RepoMagpie: you noted to avoid pdfkit (personal journal)\n"), denied.reason);
  assert.ok(denied.reason.endsWith("install the same package again within 10 minutes: RepoMagpie lets it through until then."), denied.reason);
  assert.equal(denied.systemMessage, "RepoMagpie: stopped installing pdfkit: you noted to avoid pdfkit. Your agent should ask you; the same install goes through for the next 10 minutes.");
  assert.equal(existsSync(retryFile(w.journal)), true);
  const retried = w.run(w.input("& npm.cmd install pdfkit"), { at: T0 + 60_000, onAvoid: "deny" });
  assert.deepEqual(retried, { systemMessage: "RepoMagpie: let this install of pdfkit through: it is the retry within 10 minutes of the stop, taken as your go-ahead." });
  assert.equal(w.run(w.input("npm install pdfkit"), { at: T0 + RETRY_WINDOW, onAvoid: "deny" }).decision, "deny");
  // A record that can't be written: inform, never deny.
  const blocked = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/.cache": "a file" });
  assert.deepEqual(Object.keys(blocked.run(blocked.input("npm install pdfkit"), { onAvoid: "deny" })), ["systemMessage"]);
});

test("the inputs built from the source: the installs get an answer, read_file doesn't", () => {
  const w = world({ "journal/notes/npm--left-pad.md": note({ id: "pkg:npm/left-pad", verdict: "avoid: a test note" }) });
  const answers = BUILT.map((input) => w.run(JSON.stringify({ ...input, cwd: w.project })));
  assert.deepEqual(answers.map((a) => a?.decision ?? null), ["ask", "ask", null]);
});

test("the folder: dir_path resolved against the input's cwd; an absolute dir_path as is; no cwd, the process's", () => {
  const w = world({ "project/.magpie/notes/npm--puppeteer.md": PUPPETEER, "project/app/": "" });
  assert.match(w.run(w.input("npm i puppeteer", {}, { dir_path: "app" })).systemMessage, /\(project journal\)/);
  assert.equal(w.run(w.input("npm i puppeteer", { cwd: w.root }, { dir_path: "elsewhere" })), null); // <root>/elsewhere: no project journal
  assert.match(w.run(w.input("npm i puppeteer", { cwd: w.root }, { dir_path: "project" })).systemMessage, /\(project journal\)/);
  assert.match(w.run(w.input("npm i puppeteer", { cwd: w.root }, { dir_path: join(w.project, "app") })).systemMessage, /\(project journal\)/);
  assert.equal(w.run(w.input("npm i puppeteer", { cwd: undefined }, { dir_path: "project" })), null); // the process folder is <root>
  assert.equal(w.run(w.input("npm i puppeteer", { cwd: "" })), null);
});

test("the shell tool only: other tools, other events and bad input get no answer", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  for (const fields of [{ tool_name: "write_file" }, { tool_name: "mcp_repomagpie_recall" }, { tool_name: "Bash" }, { tool_name: undefined }, { hook_event_name: "AfterTool" }, { hook_event_name: "BeforeToolSelection" }, { tool_input: "npm install pdfkit" }, { tool_input: { command: ["npm", "install", "pdfkit"] } }]) {
    assert.equal(w.run(w.input("npm install pdfkit", fields)), null, JSON.stringify(fields));
  }
  for (const raw of ["", "not json", "null", "[]", "7"]) assert.equal(w.run(raw), null, raw);
});

test("a byte-order mark and PowerShell syntax (Gemini CLI runs commands in PowerShell on Windows)", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  assert.deepEqual(w.run(`${String.fromCharCode(0xfeff)}${w.input("npm install pdfkit")}`), w.run(w.input("npm install pdfkit")));
  assert.equal(w.run(w.input("Set-Location app; & npm.cmd install pdfkit --no-fund")).decision, "ask");
});

test("never approves: no allow, no rewritten tool_input, no other decision than ask or deny, in any mode", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  const outputs = ["npm install pdfkit", "npm i puppeteer", "npm i pdfkit puppeteer"].flatMap((command, i) => [
    w.run(w.input(command), { at: T0 + i }),
    w.run(w.input(command), { at: T0 + i, informOnly: true }),
    w.run(w.input(command), { at: T0 + i, onAvoid: "deny" }),
  ]);
  for (const out of outputs) {
    assert.ok([undefined, "ask", "deny"].includes(out.decision), JSON.stringify(out));
    assert.equal(out.hookSpecificOutput, undefined);
    assert.equal(out.continue, undefined);
  }
});
