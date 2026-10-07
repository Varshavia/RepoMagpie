import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderNote, type NewNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// magpie adopt (spec §2, §8) in sandboxes.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-03", kind: "library", tags: [], ...n });

const FILES = {
  "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: "fine for invoices" }),
  "journal/notes/github--microsoft--playwright-cli.md": note({ id: "pkg:github/microsoft/playwright-cli", name: "microsoft/playwright-cli" }),
  "project/package.json": "{}",
  "project/yarn.lock": "",
};
const COMMITTED = "The project journal is committed with the code; anyone who can read this repository can read this note.\n";

test("copies the note, prints its path and the install command on stdout; messages on stderr", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["adopt", "pdfkit"]);
  assert.equal(r.code, 0, r.err);
  const copy = join(box.project, ".magpie", "notes", "npm--pdfkit.md");
  assert.equal(r.out, `${copy}\nInstall with: yarn add pdfkit\n`);
  assert.equal(r.err, `Created the project journal: ${join(box.project, ".magpie")}\n✔ Copied to the project journal: pdfkit\n${COMMITTED}`);
  assert.match(readFileSync(copy, "utf8"), /\nadopted: 2026-10-04\n---\n/);
});

test("a Verdict that says to avoid: the note is copied, no install command; --json has install null", async () => {
  const files = { ...FILES, "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful; use puppeteer" }) };
  const box = sandbox(files);
  const r = await magpie(box, ["adopt", "pdfkit"]);
  assert.equal(r.code, 0, r.err);
  const copy = join(box.project, ".magpie", "notes", "npm--pdfkit.md");
  assert.equal(r.out, `${copy}\nYour note says to avoid pdfkit; no install command.\n`);
  assert.ok(existsSync(copy));

  const json = await magpie(sandbox(files), ["adopt", "pdfkit", "--json"]);
  assert.equal(json.code, 0);
  assert.deepEqual([JSON.parse(json.out).install, JSON.parse(json.out).install_choices], [null, []]);
});

test("a GitHub repository: no install command, the repository's URL instead", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["adopt", "pkg:github/microsoft/playwright-cli"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /\nNo install command for a GitHub repository: https:\/\/github\.com\/microsoft\/playwright-cli\n$/);
});

test("a repository with several packages: one command per package, and a line that says to choose", async () => {
  const box = sandbox({ ...FILES, "journal/notes/github--acme--tool.md": note({ id: "pkg:github/acme/tool", name: "acme/tool", packages: ["pkg:npm/acme-tool", "pkg:pypi/acme-tool"] }) });
  const r = await magpie(box, ["adopt", "pkg:github/acme/tool"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /\nThis repository publishes 2 packages; install the one you need:\n {2}yarn add acme-tool\n {2}pip install acme-tool\n$/);
});

test("--json prints exactly the spec's document, and nothing on stderr", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["adopt", "pdfkit", "--json"]);
  assert.equal(r.code, 0);
  assert.equal(r.err, "");
  assert.deepEqual(JSON.parse(r.out), {
    id: "pkg:npm/pdfkit",
    from: box.note("npm--pdfkit.md"),
    to: join(box.project, ".magpie", "notes", "npm--pdfkit.md"),
    install: "yarn add pdfkit",
    install_choices: [],
  });
});

test("already in the project: exit 1 with its path, the note unchanged; --json adds the error", async () => {
  const box = sandbox(FILES);
  await magpie(box, ["adopt", "pdfkit"]);
  const copy = join(box.project, ".magpie", "notes", "npm--pdfkit.md");
  const before = readFileSync(copy, "utf8");
  const r = await magpie(box, ["adopt", "pdfkit"], { today: () => "2026-12-01" });
  assert.equal(r.code, 1);
  assert.equal(r.out, "");
  assert.equal(r.err, `magpie adopt: Already in this project: ${copy}\n`);
  assert.equal(readFileSync(copy, "utf8"), before);
  const json = await magpie(box, ["adopt", "pdfkit", "--json"]);
  assert.equal(json.code, 1);
  assert.equal(JSON.parse(json.out).error, `Already in this project: ${copy}`);
});

test("no note: exit 1; an unsupported input: exit 2; nothing written", async () => {
  const box = sandbox(FILES);
  const missing = await magpie(box, ["adopt", "chalk"]);
  assert.equal(missing.code, 1);
  assert.equal(missing.err, "magpie adopt: Your personal journal has no note for pkg:npm/chalk. Write one first with magpie note pkg:npm/chalk.\n");
  const bad = await magpie(box, ["adopt", "https://example.com/x", "--json"]);
  assert.equal(bad.code, 2);
  assert.deepEqual(Object.keys(JSON.parse(bad.out)), ["id", "from", "to", "install", "install_choices", "error"]);
  assert.equal(existsSync(join(box.project, ".magpie")), false);
});

test("--type settles a bare name outside any manifest", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": FILES["journal/notes/npm--pdfkit.md"] });
  assert.equal((await magpie(box, ["adopt", "pdfkit"])).code, 2);
  const r = await magpie(box, ["adopt", "pdfkit", "--type", "npm"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Install with: npm install pdfkit\n$/);
});
