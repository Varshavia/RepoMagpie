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

test("text inside nested or unterminated comments isn't indexed", () => {
  const journal = source("personal", [
    { file: "npm--pdfkit.md", id: "pkg:npm/pdfkit", verdict: "fine", myNotes: "Used it once. <!-<!---->- zebracorn -->\nAgain. <!-- quokkafish" },
  ]);
  assert.deepEqual(searchJournals([journal], "zebracorn", { limit: 10 }), []);
  assert.deepEqual(searchJournals([journal], "quokkafish", { limit: 10 }), []);
  assert.equal(searchJournals([journal], "again", { limit: 10 }).length, 1);
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
    domains: [],
    domains_suggested: [],
    why: { domains: [], tags: [], words: ["tdd"] },
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

test("--tag boosts by default; with match filter only notes with one of the tags stay; --tag and --kind reach skill lines by their note", () => {
  const personal = PERSONAL();
  const plain = searchJournals([personal], "pdf", { limit: 10 });
  const boosted = searchJournals([personal], "pdf", { limit: 10, tags: ["pdf"] });
  assert.deepEqual(boosted.map((r) => r.name), ["pdfkit", "mattpocock/skills", "pdf-lib"]);
  assert.ok((boosted.find((r) => r.name === "pdfkit")?.score ?? 0) > (plain.find((r) => r.name === "pdfkit")?.score ?? 0));
  assert.deepEqual(boosted.find((r) => r.name === "pdfkit")?.why.tags, ["pdf"]);
  assert.deepEqual(searchJournals([personal], "pdf", { limit: 10, tags: ["pdf"], match: "filter" }).map((r) => r.name), ["pdfkit", "pdf-lib"]);
  // Filter keeps a note with any of the tags, also one found by its tag alone (commander, "cli").
  assert.deepEqual(searchJournals([personal], "pdf", { limit: 10, tags: ["pdf", "cli"], match: "filter" }).map((r) => r.name).sort(), ["commander", "pdf-lib", "pdfkit"]);
  assert.deepEqual(searchJournals([personal], "pdf", { limit: 10, tags: ["workflow"], match: "filter" }).map((r) => [r.name, r.skill]), [["mattpocock/skills", "pdf-report"], ["mattpocock/skills", null]]);
  assert.deepEqual(searchJournals([personal], "pdf", { limit: 10, kind: "skill-pack" }).map((r) => r.skill), ["pdf-report"]);
});

// Three notes the words find equally; only their domains differ (decision 0041).
const DOMAINED = () => source("personal", [
  { file: "npm--a.md", id: "pkg:npm/a", tags: ["orm"], verdict: "an orm", domains: ["database"] },
  { file: "npm--b.md", id: "pkg:npm/b", tags: ["orm"], verdict: "an orm", domainsSuggested: ["database"] },
  { file: "npm--c.md", id: "pkg:npm/c", tags: ["orm"], verdict: "an orm" },
  { file: "npm--d.md", id: "pkg:npm/d", tags: ["drizzle"], verdict: "unrelated", domains: ["database", "security"] },
]);

test("--domain: a confirmed domain adds 0.30, a suggested one half that; why names it; filter keeps only notes with one", () => {
  const journal = DOMAINED();
  const results = searchJournals([journal], "orm", { limit: 10, domains: ["database"] });
  const score = (name: string) => results.find((r) => r.name === name)?.score ?? NaN;
  // d has no matching word, so the domain alone ranks it below c.
  assert.deepEqual(results.map((r) => r.name), ["a", "b", "c", "d"]);
  assert.equal(Math.round((score("a") - score("c")) * 100), 30);
  assert.equal(Math.round((score("b") - score("c")) * 100), 15);
  assert.equal(score("d"), 0.3);
  assert.deepEqual(results.map((r) => r.why.domains), [["database"], ["database"], [], ["database"]]);
  assert.deepEqual(results.find((r) => r.name === "d")?.why, { domains: ["database"], tags: [], words: [] }); // found by its domain alone
  assert.deepEqual(results.find((r) => r.name === "b")?.domains_suggested, ["database"]);
  assert.deepEqual(searchJournals([journal], "orm", { limit: 10, domains: ["database"], match: "filter" }).map((r) => r.name), ["a", "b", "d"]);
  // Two domains asked: the share of them the note has.
  const two = searchJournals([journal], "orm", { limit: 10, domains: ["database", "security"] });
  assert.ok((two.find((r) => r.name === "d")?.score ?? 0) > (two.find((r) => r.name === "a")?.score ?? 0) - 0.85);
  assert.deepEqual(two.find((r) => r.name === "d")?.why.domains, ["database", "security"]);
});

test("tags through aliases: --tag, the note's own tags and the query words; a near spelling counts half", () => {
  const journal = { ...source("personal", [
    { file: "npm--pg.md", id: "pkg:npm/pg", tags: ["postgres"], verdict: "a client" },
    { file: "npm--drizzle-orm.md", id: "pkg:npm/drizzle-orm", tags: ["drizzle"], verdict: "typed queries" },
    { file: "npm--other.md", id: "pkg:npm/other", tags: ["cli"], verdict: "fine with postgresql" },
  ]), aliases: new Map([["postgres", "postgresql"], ["psql", "postgresql"]]) };
  assert.deepEqual(searchJournals([journal], "client", { limit: 10, tags: ["psql"] }).find((r) => r.name === "pg")?.why.tags, ["postgresql"]);
  assert.deepEqual(searchJournals([journal], "zzzz", { limit: 10, tags: ["PostgreSQL"], match: "filter" }).map((r) => r.name), ["pg"]);
  // "psql" in the query also searches "postgresql": the note that says it is found.
  const expanded = searchJournals([journal], "psql", { limit: 10 });
  assert.equal(expanded[0]?.name, "other");
  assert.ok(expanded[0]?.why.words.includes("postgresql"));
  assert.deepEqual(searchJournals([{ ...journal, aliases: new Map() }], "psql", { limit: 10 }), []);
  const near = searchJournals([journal], "zzzz", { limit: 10, tags: ["drizle"] });
  assert.deepEqual(near.map((r) => [r.name, r.why.tags, r.score]), [["drizzle-orm", ["drizzle"], 0.13]]);
  assert.deepEqual(searchJournals([journal], "zzzz", { limit: 10, tags: ["cly"] }), []); // under 5 letters: exact only
});

test("structured search without words lists notes, never skill lines on their own", () => {
  const journal = PERSONAL();
  assert.deepEqual(searchJournals([journal], "zzzz", { limit: 10, tags: ["workflow"] }).map((r) => [r.name, r.type]), [["mattpocock/skills", "note"]]);
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
