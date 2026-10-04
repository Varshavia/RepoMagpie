import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { searchJournals, type JournalSource } from "./search.ts";
import { loadIndex } from "./search-index.ts";
import { renderNote, type NewNote } from "./write.ts";

// Journals in scratch folders, written in the canonical format.
function source(scope: JournalSource["scope"], notes: (Partial<NewNote> & { id: string; file: string })[], extra: Record<string, string> = {}): JournalSource {
  const path = scratchBase("search");
  mkdirSync(join(path, "notes"));
  for (const { file, ...note } of notes) {
    writeFileSync(join(path, "notes", file), renderNote({ name: note.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...note }));
  }
  for (const [file, text] of Object.entries(extra)) writeFileSync(join(path, "notes", file), text);
  return { scope, path, index: loadIndex(path).index };
}

const PERSONAL = () => source("personal", [
  { file: "npm--pdfkit.md", id: "pkg:npm/pdfkit", tags: ["pdf"], verdict: "avoid: async streams painful; use puppeteer" },
  { file: "npm--pdf-lib.md", id: "pkg:npm/pdf-lib", name: "pdf-lib", tags: ["pdf"], whatItDoes: "Edits PDF files.", drafts: ["What it does"] },
  { file: "npm--commander.md", id: "pkg:npm/commander", kind: "library", tags: ["cli"], verdict: "fine for small CLIs" },
], {
  "github--mattpocock--skills.md": renderNote({ id: "pkg:github/mattpocock/skills", name: "mattpocock/skills", explored: "2026-10-04", kind: "skill-pack", tags: ["workflow"], skills: ["tdd", "pdf-report"] })
    .replace("- `tdd` —", "- `tdd` — red-green-refactor with an agent")
    .replace("- `pdf-report` —", "- `pdf-report` — turns a PDF into a short report"),
});

test("results carry the spec's fields; notes and completed skill lines are found", () => {
  const personal = PERSONAL();
  const results = searchJournals([personal], "tdd", { limit: 10 });
  assert.equal(results.length, 1);
  const [skill] = results;
  assert.deepEqual({ ...skill, score: typeof skill.score }, {
    id: "pkg:github/mattpocock/skills",
    journal: "personal",
    type: "skill",
    skill: "tdd",
    name: "mattpocock/skills",
    verdict: "red-green-refactor with an agent",
    status: "inbox",
    score: "number",
    path: join(personal.path, "notes", "github--mattpocock--skills.md"),
  });
});

test("reviewed results (and completed skill lines) come before inbox ones, whatever the relevance", () => {
  const results = searchJournals([PERSONAL()], "pdf", { limit: 10 });
  // pdf-lib's name matches "pdf" best, but it is inbox, so it comes last.
  assert.deepEqual(results.slice(0, 2).map((r) => `${r.name}:${r.type}`).sort(), ["mattpocock/skills:skill", "pdfkit:note"]);
  assert.deepEqual(results.slice(2).map((r) => [r.name, r.status]), [["pdf-lib", "inbox"]]);
});

test("an inbox note's verdict is null; scores are rounded", () => {
  const results = searchJournals([PERSONAL()], "pdf-lib", { limit: 10 });
  const pdfLib = results.find((r) => r.name === "pdf-lib");
  assert.equal(pdfLib?.verdict, null);
  assert.equal(pdfLib?.score, Math.round((pdfLib?.score ?? 0) * 100) / 100);
});

test("prefix and fuzzy matching", () => {
  const personal = PERSONAL();
  assert.equal(searchJournals([personal], "comman", { limit: 10 })[0]?.name, "commander");
  assert.equal(searchJournals([personal], "puppeter", { limit: 10 })[0]?.name, "pdfkit");
});

test("--tag needs every tag; --tag and --kind filter skill lines by their note", () => {
  const personal = PERSONAL();
  assert.deepEqual(searchJournals([personal], "pdf", { limit: 10, tags: ["pdf"] }).map((r) => r.name), ["pdfkit", "pdf-lib"]);
  assert.deepEqual(searchJournals([personal], "pdf", { limit: 10, tags: ["pdf", "cli"] }), []);
  assert.deepEqual(searchJournals([personal], "pdf", { limit: 10, tags: ["workflow"] }).map((r) => [r.name, r.skill]), [["mattpocock/skills", "pdf-report"]]);
  assert.deepEqual(searchJournals([personal], "pdf", { limit: 10, kind: "skill-pack" }).map((r) => r.skill), ["pdf-report"]);
});

test("--limit caps the results after ranking", () => {
  assert.deepEqual(searchJournals([PERSONAL()], "pdf", { limit: 1, tags: ["pdf"] }).map((r) => r.name), ["pdfkit"]);
  assert.equal(searchJournals([PERSONAL()], "pdf", { limit: 2 }).length, 2);
});

test("both journals are searched; each result says which journal it came from", () => {
  const personal = PERSONAL();
  const project = source("project", [{ file: "npm--puppeteer.md", id: "pkg:npm/puppeteer", verdict: "default for PDF rendering in new projects" }]);
  const results = searchJournals([personal, project], "pdf", { limit: 10 });
  assert.deepEqual(results.filter((r) => r.status === "reviewed" && r.type === "note").map((r) => [r.name, r.journal]).sort(), [["pdfkit", "personal"], ["puppeteer", "project"]]);
});

test("the same PURL in both journals: both shown, the project's directly before the personal one", () => {
  const personal = PERSONAL();
  const project = source("project", [
    { file: "npm--pdfkit.md", id: "pkg:npm/pdfkit", verdict: "team decision: pdfkit only for invoices" },
    { file: "npm--other.md", id: "pkg:npm/other", verdict: "unrelated pdf tool, very pdf pdf pdf" },
  ]);
  const results = searchJournals([personal, project], "pdfkit", { limit: 10 });
  const pdfkit = results.map((r, i) => [i, r.id, r.journal]).filter(([, id]) => id === "pkg:npm/pdfkit");
  assert.deepEqual(pdfkit.map(([, , journal]) => journal), ["project", "personal"]);
  assert.equal((pdfkit[1][0] as number) - (pdfkit[0][0] as number), 1);
});

test("an empty journal list or no match gives no results", () => {
  assert.deepEqual(searchJournals([], "pdf", { limit: 10 }), []);
  assert.deepEqual(searchJournals([PERSONAL()], "zzzzzzzz", { limit: 10 }), []);
});
