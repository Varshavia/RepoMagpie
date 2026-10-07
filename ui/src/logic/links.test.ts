import { test } from "node:test";
import assert from "node:assert/strict";
import { alternativeOptions, alternativesOf, alternativeTo, backlinkGroups, insertLink, linkCandidates, linkFor, linkQuery, linkText, noteHash, parseNoteHash, unresolvedTitle, withAlternative } from "./links.ts";

// Links in the note view (docs/ui.md §7): how a link shows, "Linked from", the [[ autocomplete, and
// the address a followed link leaves in the browser's history.

const PDFKIT = { target: "pdfkit", label: null, id: "pkg:npm/pdfkit", name: "pdfkit", from: "Verdict" };
const GHOST = { target: "Ghost", label: null, id: null, name: null, reason: "missing" as const, from: "Related" };
const TWO = { target: "playwright", label: "pw", id: null, name: null, reason: "ambiguous" as const, from: "Related" };

test("linkFor: the note's link with that target, ignoring case (resolving ignores it too)", () => {
  assert.equal(linkFor([PDFKIT, GHOST], "PDFKIT"), PDFKIT);
  assert.equal(linkFor([PDFKIT, GHOST], "ghost"), GHOST);
  assert.equal(linkFor([PDFKIT], "zod"), null);
});

test("linkText: the label, else the note's name, else the target", () => {
  assert.equal(linkText({ ...PDFKIT, label: "the PDF one" }), "the PDF one");
  assert.equal(linkText({ ...PDFKIT, target: "npm--pdfkit" }), "pdfkit");
  assert.equal(linkText(GHOST), "Ghost");
  assert.equal(linkText(TWO), "pw");
});

test("unresolvedTitle: why a link doesn't open a note", () => {
  assert.equal(unresolvedTitle(GHOST), "No note named “Ghost” in this journal");
  assert.equal(unresolvedTitle(TWO), "Several notes are named “playwright”");
});

test("backlinkGroups: one row per note, in core's order, with where each link is", () => {
  const puppeteer = { id: "pkg:npm/puppeteer", name: "puppeteer" };
  assert.deepEqual(
    backlinkGroups([
      { id: "pkg:npm/zod", name: null, from: "My notes" },
      { ...puppeteer, from: "alternatives" },
      { ...puppeteer, from: "Use when" },
    ]),
    [
      { id: "pkg:npm/zod", name: null, places: ["in My notes"] },
      { ...puppeteer, places: ["as an alternative", "in Use when"] },
    ],
  );
});

test("noteHash and parseNoteHash: the journal and the id, encoded; anything else is no note", () => {
  const hash = noteHash("personal", "pkg:npm/%40playwright/cli");
  assert.equal(hash, "#note/personal/pkg%3Anpm%2F%2540playwright%2Fcli");
  assert.deepEqual(parseNoteHash(hash), { journal: "personal", id: "pkg:npm/%40playwright/cli" });
  assert.deepEqual(parseNoteHash(noteHash("project", "pkg:npm/zod")), { journal: "project", id: "pkg:npm/zod" });
  for (const bad of ["", "#", "#note/elsewhere/pkg%3Anpm%2Fzod", "#note/personal/", "#note/personal/%E0%A4%A", "#other"]) assert.equal(parseNoteHash(bad), null, bad);
});

test("linkQuery: the [[ being typed before the caret and the text after it", () => {
  assert.deepEqual(linkQuery("use [[pdf", 9), { start: 4, query: "pdf" });
  assert.deepEqual(linkQuery("use [[", 6), { start: 4, query: "" });
  assert.deepEqual(linkQuery("[[a]] then [[b", 14), { start: 11, query: "b" });
  for (const [text, caret] of [["use [[pdf]]", 11], ["[[a|label", 9], ["[[a#h", 5], ["[[a\nb", 5], ["no link", 7], ["[[pdf", 1], ["[x", 2]] as const) {
    assert.equal(linkQuery(text, caret), null, text);
  }
});

const notes = [
  { id: "pkg:npm/pdfkit", file: "npm--pdfkit.md", name: "pdfkit" },
  { id: "pkg:npm/pdf-lib", file: "npm--pdf-lib.md", name: "pdf-lib" },
  { id: "pkg:github/acme/make-pdf", file: "github--acme--make-pdf.md", name: "acme/make-pdf" },
  { id: "pkg:npm/zod", file: "npm--zod.md", name: "zod" },
  { id: null, file: "npm--broken.md", name: null },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `pkg:npm/z${i}`, file: `npm--z${i}.md`, name: `z${i}` })),
];

test("linkCandidates: notes whose name or file stem contains the text, starts-with first, then by name, at most 8", () => {
  assert.deepEqual(linkCandidates(notes, "PDF").map((n) => n.name), ["pdf-lib", "pdfkit", "acme/make-pdf"]);
  assert.deepEqual(linkCandidates(notes, "npm--z").map((n) => n.name), ["z0", "z1", "z2", "z3", "z4", "z5", "z6", "z7"]);
  assert.equal(linkCandidates(notes, "").length, 8);
  assert.deepEqual(linkCandidates(notes, "broken"), []); // a note that can't be read can't be linked by id
  assert.deepEqual(linkCandidates(notes, "zod", "pkg:npm/zod"), []); // not the note itself
});

// alternatives (decision 0027): the note's own list, and the reverse relation from backlinks.
test("alternativesOf and alternativeTo: links and backlinks from the alternatives field", () => {
  const alt = { target: "npm--puppeteer", label: null, id: "pkg:npm/puppeteer", name: "puppeteer", from: "alternatives" };
  assert.deepEqual(alternativesOf([PDFKIT, alt, GHOST]), [alt]);
  const back = { id: "pkg:npm/pdfkit", name: "pdfkit", from: "alternatives" };
  assert.deepEqual(alternativeTo([{ id: "pkg:npm/zod", name: "zod", from: "Related" }, back]), [back]);
});

test("withAlternative: added at the end, trimmed; a target already there (ignoring case) is not added twice", () => {
  assert.deepEqual(withAlternative(["npm--puppeteer"], "  zod "), ["npm--puppeteer", "zod"]);
  assert.deepEqual(withAlternative(["npm--puppeteer"], "NPM--Puppeteer"), ["npm--puppeteer"]);
  assert.deepEqual(withAlternative([], "   "), []);
});

test("alternativeOptions: notes to choose, not the note itself or ones already listed, then the text as typed", () => {
  const listed = ["npm--pdf-lib"];
  assert.deepEqual(alternativeOptions(notes, "pdf", listed, "pkg:npm/pdfkit"), [
    { kind: "note", note: notes[2], target: "github--acme--make-pdf" },
    { kind: "text", target: "pdf" },
  ]);
  // Text that names a note exactly: only the note, no second option.
  assert.deepEqual(alternativeOptions(notes, "ZOD", [], null), [{ kind: "note", note: notes[3], target: "npm--zod" }]);
  assert.deepEqual(alternativeOptions(notes, "  ", [], null).every((o) => o.kind === "note"), true);
  assert.deepEqual(alternativeOptions(notes, "no such thing", [], null), [{ kind: "text", target: "no such thing" }]);
});

test("insertLink: [[<file stem>|<name>]] in place of the typed [[text, the caret after it", () => {
  assert.deepEqual(insertLink("use [[pdf now", 4, 9, notes[0]), { text: "use [[npm--pdfkit|pdfkit]] now", caret: 26 });
  // A closing ]] already right after the caret is replaced, not doubled.
  assert.deepEqual(insertLink("[[pd]]", 0, 4, notes[0]), { text: "[[npm--pdfkit|pdfkit]]", caret: 22 });
  assert.deepEqual(insertLink("[[", 0, 2, { id: "pkg:npm/x", file: "npm--x.md", name: null }), { text: "[[npm--x]]", caret: 10 });
});
