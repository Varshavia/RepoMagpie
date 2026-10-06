import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Place } from "./journals.ts";
import { keywordsOf, runSuggest, tagPoints } from "./suggest.ts";
import { renderNote, type NewNote } from "./write.ts";

// magpie suggest (spec §2, §5): candidates from both journals by keyword and tags, Verdict first;
// the project's own dependencies are never suggested; those with an avoid note are listed apart.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-03", kind: "library", tags: [], ...n });

const PERSONAL = {
  "journal/notes/npm--commander.md": note({ id: "pkg:npm/commander", verdict: "fine for small CLIs", tags: ["cli"] }),
  "journal/notes/npm--tsx.md": note({ id: "pkg:npm/tsx", whatItDoes: "Runs TypeScript files directly." }),
  "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful; use puppeteer", avoidWhen: ["you need streamed output"] }),
  "journal/notes/npm--left-pad.md": note({ id: "pkg:npm/left-pad", verdict: "never again" }),
  "journal/notes/github--microsoft--playwright-cli.md": note({ id: "pkg:github/microsoft/playwright-cli", name: "microsoft/playwright-cli", verdict: "lets my agent drive a CLI", packages: ["pkg:npm/%40playwright/cli"] }),
  "journal/notes/github--mattpocock--skills.md": note({ id: "pkg:github/mattpocock/skills", name: "mattpocock/skills", kind: "skill-pack", verdict: "good habits for agents", skills: ["tdd"] })
    .replace("- `tdd` —", "- `tdd` — write the tests first, with an agent"),
};
const PROJECT = {
  "project/.magpie/notes/npm--vitest.md": note({ id: "pkg:npm/vitest", verdict: "default test runner for new projects", tags: ["testing"] }),
  "project/.magpie/notes/npm--commander.md": note({ id: "pkg:npm/commander", verdict: "our CLI parser" }),
  "project/package.json": JSON.stringify({ description: "A TypeScript CLI with tests", keywords: ["cli"], dependencies: { pdfkit: "*", "@playwright/cli": "*" }, devDependencies: { vitest: "*" } }),
};

function place(files: Record<string, string | null>): Place & { root: string } {
  const root = scratchBase("suggest");
  for (const [path, content] of Object.entries({ "home/": null, "project/.git/": null, ...files })) {
    const full = join(root, path);
    if (content === null) mkdirSync(full, { recursive: true });
    else {
      mkdirSync(parse(full).dir, { recursive: true });
      writeFileSync(full, content);
    }
  }
  return { root, home: join(root, "home"), env: { MAGPIE_HOME: join(root, "journal") }, cwd: join(root, "project") };
}

const names = (run: ReturnType<typeof runSuggest>) => run.document.candidates.map((c) => `${c.journal} ${c.name}`);

test("from the manifests: keywords from dependency names, keywords and description; the document's shape", () => {
  const p = place({ ...PERSONAL, ...PROJECT });
  const run = runSuggest({ limit: 20 }, p);
  assert.equal(run.outcome, "ok");
  assert.deepEqual(Object.keys(run.document), ["source", "keywords", "candidates", "in_use_avoid"]);
  assert.equal(run.document.source, "manifests");
  assert.deepEqual(run.document.keywords, ["pdfkit", "playwright", "cli", "vitest", "typescript", "tests"]);
  const commander = run.document.candidates.find((c) => c.journal === "personal" && c.name === "commander");
  assert.deepEqual({ ...commander, score: typeof commander?.score }, {
    id: "pkg:npm/commander",
    journal: "personal",
    name: "commander",
    verdict: "fine for small CLIs",
    status: "reviewed",
    tags: ["cli"],
    score: "number",
    path: join(p.root, "journal", "notes", "npm--commander.md"),
  });
});

test("Verdict first: reviewed candidates before inbox ones; the same note in both journals, project first", () => {
  const p = place({ ...PERSONAL, ...PROJECT });
  const list = names(runSuggest({ limit: 20 }, p));
  const tsx = list.indexOf("personal tsx");
  assert.ok(tsx > 0, list.join(", "));
  assert.equal(tsx, list.length - 1, "the only inbox note comes last");
  const project = list.indexOf("project commander");
  assert.equal(list[project + 1], "personal commander");
});

test("the project's dependencies are never suggested, also through a note's packages", () => {
  const p = place({ ...PERSONAL, ...PROJECT });
  const list = names(runSuggest({ limit: 20 }, p));
  for (const used of ["vitest", "pdfkit", "microsoft/playwright-cli"]) assert.ok(!list.some((n) => n.endsWith(` ${used}`)), `${used} in ${list.join(", ")}`);
  assert.ok(!list.includes("personal left-pad"), "a note no keyword matches is no candidate");
});

test("a dependency with an avoid note is listed in in_use_avoid, as recall shows it, whatever the keywords", () => {
  const p = place({ ...PERSONAL, ...PROJECT });
  const { in_use_avoid } = runSuggest({ description: "something unrelated", limit: 20 }, p).document;
  assert.deepEqual(in_use_avoid, [{
    query: "pdfkit",
    id: "pkg:npm/pdfkit",
    journal: "personal",
    confidence: "exact",
    verdict: "avoid: async streams painful; use puppeteer",
    avoid_when: ["you need streamed output"],
    use_when: [],
    drafts: [],
    status: "reviewed",
    path: join(p.root, "journal", "notes", "npm--pdfkit.md"),
  }]);
});

test("a name-only avoid note counts too, labelled by its confidence", () => {
  const p = place({
    "journal/notes/github--foliojs--pdfkit.md": note({ id: "pkg:github/foliojs/pdfkit", name: "foliojs/pdfkit", verdict: "avoid: no streams" }),
    "project/package.json": JSON.stringify({ dependencies: { pdfkit: "*" } }),
  });
  const { in_use_avoid } = runSuggest({ limit: 20 }, p).document;
  assert.deepEqual(in_use_avoid.map((m) => `${m.query} ${m.id} ${m.confidence}`), ["pdfkit pkg:github/foliojs/pdfkit name-only"]);
});

test("a description: its words are the keywords; the project's dependencies still count", () => {
  const p = place({ ...PERSONAL, ...PROJECT, "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib", tags: ["pdf"] }) });
  const run = runSuggest({ description: "Render PDF invoices, with a CLI", limit: 20 }, p);
  assert.equal(run.document.source, "description");
  assert.deepEqual(run.document.keywords, ["render", "pdf", "invoices", "cli"]);
  const list = names(run);
  assert.ok(list.includes("personal pdf-lib"), list.join(", "));
  assert.ok(!list.includes("personal pdfkit"));
  assert.equal(run.document.in_use_avoid.length, 1);
});

test("a description outside any project: no dependencies, no avoid group", () => {
  const p = place(PERSONAL);
  const run = runSuggest({ description: "pdf", limit: 20 }, { ...p, cwd: p.home });
  assert.ok(names(run).includes("personal pdfkit"));
  assert.deepEqual(run.document.in_use_avoid, []);
});

test("a completed skill line brings its note, with the note's own Verdict", () => {
  const p = place(PERSONAL);
  const run = runSuggest({ description: "tests first", limit: 20 }, p);
  const skills = run.document.candidates.find((c) => c.name === "mattpocock/skills");
  assert.equal(skills?.verdict, "good habits for agents");
});

test("README words count when there is no description", () => {
  const p = place({ ...PERSONAL, "project/README.md": "# Invoices\n\nRenders PDF invoices with pdfkit.\n" });
  const run = runSuggest({ limit: 20 }, p);
  assert.deepEqual(run.document.keywords, ["invoices", "renders", "pdf", "pdfkit"]);
  assert.ok(names(run).includes("personal pdfkit"), "pdfkit is not a dependency here");
});

test("--limit keeps the first candidates and reports the total; --journal reads one journal", () => {
  const p = place({ ...PERSONAL, ...PROJECT });
  const all = runSuggest({ limit: 20 }, p);
  const one = runSuggest({ limit: 1 }, p);
  assert.equal(one.document.candidates.length, 1);
  assert.equal(one.total, all.document.candidates.length);
  assert.ok(one.total > 1);
  const personal = runSuggest({ limit: 20, journal: "personal" }, p);
  assert.ok(personal.document.candidates.every((c) => c.journal === "personal"));
  assert.ok(personal.document.candidates.length > 0);
});

test("nothing to go on: no manifest, no README and no description, or a description of stop words only, is a usage error", () => {
  const p = place(PERSONAL);
  const empty = runSuggest({ limit: 20 }, p);
  assert.equal(empty.outcome, "usage");
  assert.match(empty.document.error ?? "", /Describe the project instead/);
  assert.deepEqual({ ...empty.document, error: undefined }, { source: "manifests", keywords: [], candidates: [], in_use_avoid: [], error: undefined });
  const stop = runSuggest({ description: "the and of a", limit: 20 }, p);
  assert.equal(stop.outcome, "usage");
  assert.equal(stop.document.source, "description");
});

test("keywords: lowercase words, each once, without stop words and numbers; package names split into words", () => {
  assert.deepEqual(keywordsOf(["A TypeScript CLI, with the tests", "@types/node", "react-dom 19", "CLI"]), ["typescript", "cli", "tests", "types", "node", "react", "dom"]);
  assert.deepEqual(keywordsOf(["Let an agent test all of it, and also just more"]), ["agent", "test"]);
});

test("one point per matching tag; a hyphenated tag matches when each of its words is a keyword", () => {
  assert.equal(tagPoints(["cli", "browser-automation", "pdf"], ["cli", "browser", "automation"]), 2);
  assert.equal(tagPoints(["browser-automation"], ["browser"]), 0);
});
