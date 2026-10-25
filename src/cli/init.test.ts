import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { renderNote, type NewNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// repomagpie init --auto (spec §2) in sandboxes: npm and Python manifests, both journals.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-03", kind: "library", tags: [], ...n });

const FILES = {
  "journal/notes/npm--moment.md": note({ id: "pkg:npm/moment", verdict: "avoid: too big for what it does; use date-fns" }),
  "journal/notes/npm--zod.md": note({ id: "pkg:npm/zod", verdict: "my default for validating input at the edges of a service" }),
  "project/.magpie/notes/pypi--requests.md": note({ id: "pkg:pypi/requests" }),
  // An avoid note in the project journal wins over the personal one's plain note.
  "journal/notes/npm--lodash.md": note({ id: "pkg:npm/lodash", verdict: "fine" }),
  "project/.magpie/notes/npm--lodash.md": note({ id: "pkg:npm/lodash", verdict: "fine", avoidWhen: ["a bundle size budget"] }),
  "project/package.json": JSON.stringify({ dependencies: { moment: "*", zod: "*", lodash: "*", "left-pad": "*" } }),
  "project/pyproject.toml": '[project]\nname = "app"\ndependencies = ["requests>=2", "Flask==3.0"]\n',
};

test("the three groups: avoid notes first, then notes with the Verdict's first words, then the names without a note", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["init", "--auto"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, [
    "This project uses 6 packages (package.json, pyproject.toml). You have notes on 4; 2 say avoid.",
    "",
    "Avoid",
    "  moment    npm   personal  Verdict: avoid: too big for what it does; use …",
    "  lodash    npm   project   Verdict: fine",
    "",
    "Noted",
    "  zod       npm   personal  Verdict: my default for validating input at the edges …",
    "  requests  pypi  project   [inbox] no verdict yet",
    "",
    "No note",
    "  left-pad, Flask", // as the manifest writes it
    "",
  ].join("\n"));
  // No terminal: it lists and writes nothing.
  assert.match(r.err, /^No terminal to ask in: nothing was written\./m);
  assert.equal(existsSync(box.note("npm--left-pad.md")), false);
});

test("--json: the groups as data, and never a prompt, even in a terminal", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["init", "--auto", "--json"], { interactive: true, ask: () => Promise.reject(new Error("--json never asks")) });
  assert.equal(r.code, 0, r.err);
  const doc = JSON.parse(r.out);
  assert.deepEqual(Object.keys(doc), ["folder", "manifests", "dependencies", "avoid", "noted", "none"]);
  assert.equal(doc.dependencies, 6);
  assert.deepEqual(doc.avoid.map((d: { name: string; journal: string }) => [d.name, d.journal]), [["moment", "personal"], ["lodash", "project"]]);
  assert.deepEqual(Object.keys(doc.noted[0]), ["name", "type", "id", "journal", "confidence", "verdict", "status", "path"]);
  assert.deepEqual(doc.noted.map((d: { id: string; status: string }) => [d.id, d.status]), [["pkg:npm/zod", "reviewed"], ["pkg:pypi/requests", "inbox"]]);
  assert.deepEqual(doc.none, [{ type: "npm", name: "left-pad" }, { type: "pypi", name: "Flask" }]);
});

test("in a terminal: one Verdict asked for each package without a note; Enter skips, the Use when answer is optional, q stops", async () => {
  const box = sandbox({ ...FILES, "project/package.json": JSON.stringify({ dependencies: { "left-pad": "*", chalk: "*", ora: "*" } }), "project/pyproject.toml": "" });
  const asked: string[] = [];
  const answers = ["", "colours in a terminal, nothing more", "CLI output", "q"];
  const r = await magpie(box, ["init", "--auto"], { interactive: true, ask: async (q) => (asked.push(q), answers.shift() ?? "") });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(asked, ["left-pad (npm): ", "chalk (npm): ", "  Use when, in a few words (Enter skips): ", "ora (npm): "]);
  assert.match(r.err, /one by one: your Verdict, in your own words\. Enter skips one; q stops\./);
  assert.match(r.err, /^ {2}✔ Saved to your personal journal: chalk$/m);
  assert.match(r.err, /^Saved 1 note\.$/m);
  const chalk = readFileSync(box.note("npm--chalk.md"), "utf8");
  assert.match(chalk, /colours in a terminal, nothing more/);
  assert.match(chalk, /^- CLI output$/m);
  assert.equal(existsSync(box.note("npm--left-pad.md")), false, "skipped");
  assert.equal(existsSync(box.note("npm--ora.md")), false, "stopped before it");
});

test("in a terminal, all skipped: nothing written; --to project writes there", async () => {
  const box = sandbox({ "project/package.json": JSON.stringify({ dependencies: { chalk: "*" } }) });
  const none = await magpie(box, ["init", "--auto"], { interactive: true, ask: async () => "" });
  assert.match(none.err, /^Nothing was written\.$/m);
  const r = await magpie(box, ["init", "--auto", "--to", "project"], { interactive: true, ask: async (q) => (q.startsWith("chalk") ? "fine for colours" : "") });
  assert.match(r.err, /Saved to the project journal: chalk/);
  assert.ok(existsSync(`${box.project}/.magpie/notes/npm--chalk.md`));
});

test("every dependency noted: the groups and no question", async () => {
  const box = sandbox({ ...FILES, "project/package.json": JSON.stringify({ dependencies: { zod: "*" } }), "project/pyproject.toml": "" });
  const r = await magpie(box, ["init", "--auto"], { interactive: true, ask: () => Promise.reject(new Error("nothing to ask")) });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /You have notes on 1\.\n\nNoted\n {2}zod/);
  assert.equal(r.err, "");
});

test("no manifests: exit 2 with what to do, as text and as JSON", async () => {
  const box = sandbox();
  const r = await magpie(box, ["init", "--auto"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /^repomagpie init: No package\.json, pyproject\.toml or Cargo\.toml in .*project\. Run repomagpie init --auto in a project folder\.\n$/);
  const json = await magpie(box, ["init", "--auto", "--json"]);
  assert.equal(json.code, 2);
  assert.match(JSON.parse(json.out).error, /^No package\.json/);
});

test("names from a stranger's manifest are cleaned before they are shown", async () => {
  const rtl = String.fromCharCode(0x202e);
  const box = sandbox({ "project/package.json": JSON.stringify({ dependencies: { [`evil${rtl}pkg`]: "*" } }) });
  const r = await magpie(box, ["init", "--auto", "--json"]);
  assert.ok(!r.out.includes(rtl));
  assert.match(r.out, /evil<U\+202E>pkg/);
});
