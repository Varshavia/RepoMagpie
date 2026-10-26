import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { escapeRegExp } from "../core/text.ts";
import { renderNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// repomagpie delete (spec §2, decision 0037): the note moves to the journal's .trash/ after the
// person's OK; --yes without a terminal; --json never asks.

const PDFKIT = renderNote({ id: "pkg:npm/pdfkit", name: "pdfkit", explored: "2026-10-23", kind: "library", tags: [], verdict: "avoid: async streams painful" });
const PUPPETEER = renderNote({ id: "pkg:npm/puppeteer", name: "puppeteer", explored: "2026-10-23", kind: "library", tags: [], verdict: "default", related: "- [[pdfkit]]" });

const box = (files: Record<string, string | null> = {}) =>
  sandbox({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER, ...files });
const trash = (journal: string) => (existsSync(join(journal, ".trash")) ? readdirSync(join(journal, ".trash")) : []);
const STAMPED = /npm--pdfkit\.\d{8}-\d{6}Z\.md/;

test("--yes moves the note to the trash: the trash path on stdout, the links on stderr", async () => {
  const b = box();
  const r = await magpie(b, ["delete", "pdfkit", "--yes"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`^${escapeRegExp(join(b.journal, ".trash"))}[\\\\/]npm--pdfkit\\.\\d{8}-\\d{6}Z\\.md\\n$`));
  assert.match(r.err, /^✔ Moved to the trash: pdfkit$/m);
  assert.match(r.err, /^Linked from: puppeteer \(in Related\)\. Those links show as unresolved now\.$/m);
  assert.ok(!existsSync(b.note("npm--pdfkit.md")));
  assert.match(trash(b.journal).join(), STAMPED);
});

test("in a terminal it shows the note, its links and where it goes, then asks; only y moves it", async () => {
  for (const answer of ["", "n", "no", "maybe"]) {
    const b = box();
    const asked: string[] = [];
    const r = await magpie(b, ["delete", "pdfkit"], { interactive: true, ask: async (q) => (asked.push(q), answer) });
    assert.equal(r.code, 0);
    assert.deepEqual(asked, ["Move it to the trash? [y/N] "]);
    assert.match(r.err, /^pdfkit · personal journal\n {2}Verdict {2}avoid: async streams painful\n {2}.*npm--pdfkit\.md$/m);
    assert.match(r.err, /^Linked from: puppeteer \(in Related\)\. Those links will show as unresolved; the notes stay as they are\.$/m);
    // The folder only: the stamp is the time of the move, after the answer.
    assert.match(r.err, /^It goes to .*\.trash[\\/] \(as npm--pdfkit\.<time>\.md\)\. Nothing empties the trash; delete the file there to remove it for good\.$/m);
    assert.doesNotMatch(r.err, STAMPED);
    assert.match(r.err, /Cancelled\. Nothing moved\./);
    assert.equal(r.out, "");
    assert.ok(existsSync(b.note("npm--pdfkit.md")), JSON.stringify(answer));
    assert.deepEqual(trash(b.journal), []);
  }
  const b = box();
  const r = await magpie(b, ["delete", "pdfkit"], { interactive: true, ask: async () => "y" });
  assert.equal(r.code, 0);
  assert.ok(!existsSync(b.note("npm--pdfkit.md")));
});

test("without a terminal and without --yes: exit 2, nothing moved; --json too, with the document", async () => {
  const b = box();
  const r = await magpie(b, ["delete", "pdfkit"]);
  assert.equal(r.code, 2);
  assert.equal(r.err, "repomagpie delete: Moving a note to the trash needs your OK: run this in a terminal, or add --yes.\n");
  const json = await magpie(b, ["delete", "pdfkit", "--json"], { interactive: true, ask: () => Promise.reject(new Error("--json never asks")) });
  assert.equal(json.code, 2);
  const document = JSON.parse(json.out);
  assert.equal(document.deleted, false);
  assert.equal(document.id, "pkg:npm/pdfkit");
  assert.equal(document.trash, join(b.journal, ".trash"), "nothing moved: the folder, no stamped name");
  assert.match(document.error, /needs your OK/);
  assert.ok(existsSync(b.note("npm--pdfkit.md")));
});

test("--json --yes prints the Delete document", async () => {
  const b = box();
  const r = await magpie(b, ["delete", "pkg:npm/pdfkit", "--yes", "--json"]);
  assert.equal(r.code, 0);
  assert.equal(r.err, "");
  const document = JSON.parse(r.out);
  assert.deepEqual(Object.keys(document), ["id", "name", "journal", "file", "path", "version", "trash", "deleted", "backlinks", "warnings"]);
  assert.equal(document.deleted, true);
  assert.deepEqual(document.backlinks, [{ id: "pkg:npm/puppeteer", name: "puppeteer", from: "Related" }]);
  assert.match(document.trash, STAMPED);
});

test("no note: a message on stderr and exit 0, as recall's empty case; name-only matches are named, never deleted", async () => {
  const b = box({ "journal/notes/github--foliojs--pdfkit-tools.md": renderNote({ id: "pkg:github/foliojs/pdfkit-tools", name: "foliojs/pdfkit-tools", explored: "2026-10-23", kind: "library", tags: [] }) });
  const r = await magpie(b, ["delete", "nothing", "--yes"]);
  assert.deepEqual([r.code, r.out, r.err], [0, "", "No note on nothing.\n"]);
  const json = await magpie(b, ["delete", "nothing", "--json"]);
  assert.equal(json.code, 0);
  assert.equal(JSON.parse(json.out).deleted, false);
  const nameOnly = await magpie(b, ["delete", "pdfkit-tools", "--yes"]);
  assert.equal(nameOnly.code, 0);
  assert.equal(nameOnly.err, "No note on pdfkit-tools.\nThese match it by name only; to delete one, name it by its PURL:\n  pkg:github/foliojs/pdfkit-tools (personal journal)\n");
  assert.ok(existsSync(b.note("github--foliojs--pdfkit-tools.md")));
  const byUrl = await magpie(b, ["delete", "https://github.com/foliojs/pdfkit-tools", "--yes"]);
  assert.equal(byUrl.code, 0, byUrl.err);
  assert.ok(!existsSync(b.note("github--foliojs--pdfkit-tools.md")));
});

test("a note in both journals: --journal chooses; without it a terminal asks which, otherwise exit 2", async () => {
  const b = box({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT });
  const projectJournal = join(b.project, ".magpie");
  const r = await magpie(b, ["delete", "pdfkit", "--yes"]);
  assert.equal(r.code, 2);
  assert.equal(r.err, "repomagpie delete: pdfkit matches 2 notes. Add --journal personal or --journal project.\n");

  const asked: string[] = [];
  const answers = ["2", "y"];
  const chosen = await magpie(b, ["delete", "pdfkit"], { interactive: true, ask: async (q) => (asked.push(q), answers.shift() ?? "") });
  assert.equal(chosen.code, 0, chosen.err);
  assert.match(chosen.err, /^pdfkit matches 2 notes:\n {2}1 {2}pdfkit · pkg:npm\/pdfkit · project journal\n {2}2 {2}pdfkit · pkg:npm\/pdfkit · personal journal$/m);
  assert.deepEqual(asked, ["Which one? (1-2, Enter to cancel) ", "Move it to the trash? [y/N] "]);
  assert.ok(!existsSync(b.note("npm--pdfkit.md")), "the personal one");
  assert.ok(existsSync(join(projectJournal, "notes", "npm--pdfkit.md")));

  const project = await magpie(b, ["delete", "pdfkit", "--journal", "project", "--yes"]);
  assert.equal(project.code, 0, project.err);
  assert.match(trash(projectJournal).join(), STAMPED);
});

test("--help lists delete", async () => {
  const r = await magpie(sandbox(), ["--help"]);
  assert.match(r.out, /^\s+delete \[options\] <name>\s+move a note to its journal's trash$/m);
  const help = await magpie(sandbox(), ["delete", "--help"]);
  assert.match(help.out, /^Usage: repomagpie delete \[options\] <name>$/m);
  assert.match(help.out, /--journal <journal>/);
  assert.match(help.out, /--yes/);
});
