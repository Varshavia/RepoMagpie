import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { antigravityOutput } from "./antigravity.ts";
import { retryFile } from "./retry.ts";

// The Antigravity CLI adapter (decision 0036): an exact avoid note answers force_ask with the note
// as the reason; anything else prints nothing, since Antigravity shows an allow's reason to nobody.
// Inputs are the pre-check's captures (fixtures/antigravity-inputs.json).

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const withAlternatives = (text: string, entries: string[]) =>
  text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);
const CAPTURED: { toolCall: { args: Record<string, unknown> } }[] = JSON.parse(readFileSync(new URL("./fixtures/antigravity-inputs.json", import.meta.url), "utf8")).inputs;

const PDFKIT = withAlternatives(note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful", avoidWhen: ["you need streams"] }), ["[[puppeteer]]"]);
const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering" });

function world(files: Record<string, string>) {
  const root = scratchBase("hook-antigravity");
  for (const [path, text] of Object.entries({ "home/": "", "project/.git/": "", ...files })) {
    mkdirSync(join(root, path, path.endsWith("/") ? "" : ".."), { recursive: true });
    if (!path.endsWith("/")) writeFileSync(join(root, path), text);
  }
  const journal = join(root, "journal");
  mkdirSync(journal, { recursive: true });
  const project = join(root, "project");
  // A captured input with another command, in this world's project.
  const input = (command: unknown, args: Record<string, unknown> = {}, fields: Record<string, unknown> = {}) => {
    const call = CAPTURED[1];
    return JSON.stringify({ ...call, workspacePaths: [project.replace(/\\/g, "/")], toolCall: { ...call.toolCall, args: { ...call.toolCall.args, CommandLine: command, Cwd: project, ...args } }, ...fields });
  };
  const run = (raw: string, informOnly = false) => {
    const out = antigravityOutput(raw, { env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: root, informOnly });
    return out === null ? null : JSON.parse(out);
  };
  return { root, journal, project, input, run, path: (file: string) => join(journal, "notes", file) };
}

test("a personal avoid note: force_ask, with the note as the reason Antigravity shows in its prompt", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  assert.deepEqual(w.run(w.input("npm install pdfkit")), {
    decision: "force_ask",
    reason: "RepoMagpie: you noted to avoid pdfkit (personal journal)\nVerdict: \"avoid: async streams painful\"\nAvoid when: \"you need streams\"\n" +
      `Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")\n${w.path("npm--pdfkit.md")}`,
  });
  assert.equal(existsSync(retryFile(w.journal)), false);
});

test("a project avoid note asks too; several packages put the avoid notes first", () => {
  const w = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  const out = w.run(w.input("npm i puppeteer && npm i pdfkit"));
  assert.equal(out.decision, "force_ask");
  assert.ok(out.reason.startsWith("RepoMagpie: this project's journal says to avoid pdfkit (written by the repository's contributors)\n"), out.reason);
  assert.match(out.reason, /\n\nRepoMagpie: note on puppeteer \(personal journal\)\n/);
});

test("any other match, a name-only avoid match and --inform-only print nothing: nobody would see it", () => {
  const w = world({ "journal/notes/npm--puppeteer.md": PUPPETEER, "journal/notes/pypi--pdfkit.md": note({ id: "pkg:pypi/pdfkit", verdict: "avoid: wrong" }), "journal/notes/npm--jspdf.md": note({ id: "pkg:npm/jspdf", verdict: "avoid: tiny API" }) });
  assert.equal(w.run(w.input("npm i puppeteer")), null);
  assert.equal(w.run(w.input("npm i pdfkit")), null);
  assert.equal(w.run(w.input("npm i jspdf"), true), null);
  assert.equal(w.run(w.input("npm i jspdf")).decision, "force_ask");
});

test("the captured inputs: only the install asks", () => {
  const w = world({ "journal/notes/npm--left-pad.md": note({ id: "pkg:npm/left-pad", verdict: "avoid: a pre-check test note, not a real one" }) });
  const answers = CAPTURED.map((input) => w.run(JSON.stringify({ ...input, toolCall: { ...input.toolCall, args: { ...input.toolCall.args, Cwd: w.project } } })));
  assert.deepEqual(answers.map((a) => a?.decision ?? null), [null, "force_ask", null]);
});

test("the folder: Cwd, else the first workspace folder, else the process's (Antigravity starts the hook in ~/.gemini/config)", () => {
  const w = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  assert.equal(w.run(w.input("npm i pdfkit")).decision, "force_ask");
  assert.equal(w.run(w.input("npm i pdfkit", { Cwd: undefined })).decision, "force_ask"); // workspacePaths, with forward slashes
  assert.equal(w.run(w.input("npm i pdfkit", { Cwd: "" })).decision, "force_ask");
  assert.equal(w.run(w.input("npm i pdfkit", { Cwd: undefined }, { workspacePaths: [] })), null); // the process folder: no project journal
  assert.equal(w.run(w.input("npm i pdfkit", { Cwd: w.root })), null);
});

test("run_command only; bad input prints nothing", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const other = (name: string) => JSON.stringify({ ...CAPTURED[1], toolCall: { name, args: { CommandLine: "npm install pdfkit", Cwd: w.project } } });
  for (const name of ["view_file", "write_to_file", "mcp_repomagpie_recall", "Bash"]) assert.equal(w.run(other(name)), null, name);
  for (const command of [42, null, ["npm", "install", "pdfkit"]]) assert.equal(w.run(w.input(command)), null, JSON.stringify(command));
  for (const raw of ["", "not json", "null", "[]", JSON.stringify({ toolCall: "run_command" }), JSON.stringify({ toolCall: { name: "run_command", args: "npm install pdfkit" } })]) assert.equal(w.run(raw), null, raw);
});

test("a byte-order mark and PowerShell syntax (the agent writes PowerShell on Windows)", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  assert.deepEqual(w.run(`${String.fromCharCode(0xfeff)}${w.input("npm install pdfkit")}`), w.run(w.input("npm install pdfkit")));
  assert.equal(w.run(w.input("Set-Location app; & npm.cmd install pdfkit")).decision, "force_ask");
});

test("never approves: no allow, auto_approve, ask or deny, ever", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  for (const command of ["npm install pdfkit", "npm i puppeteer", "npm i pdfkit puppeteer", "npm test"]) {
    for (const informOnly of [false, true]) {
      const out = w.run(w.input(command), informOnly);
      assert.ok(out === null || (out.decision === "force_ask" && Object.keys(out).join() === "decision,reason"), JSON.stringify(out));
    }
  }
});
