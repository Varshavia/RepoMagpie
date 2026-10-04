import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { isAvoid, loadRecallEntries, recall, RECALL_CACHE, type RecallSource } from "./recall.ts";
import { renderNote, type NewNote } from "./write.ts";

// Recall (spec §2 recall, §5 matching) over journals in scratch folders.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });

function journal(notes: Record<string, string>): string {
  const path = scratchBase("recall");
  mkdirSync(join(path, "notes"));
  for (const [file, text] of Object.entries(notes)) writeFileSync(join(path, "notes", file), text);
  return path;
}

const sources = (...journals: [RecallSource["scope"], string][]): RecallSource[] =>
  journals.map(([scope, path]) => ({ scope, path, entries: loadRecallEntries(path).entries }));

const ids = (matches: { journal: string; id: string; confidence: string }[]) => matches.map((m) => `${m.journal} ${m.id} ${m.confidence}`);

const PDFKIT = note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful; use puppeteer", avoidWhen: ["you need streamed output for large PDFs"] });

test("exact: a note whose id has the same type and name; the version and extras are dropped", () => {
  const s = sources(["personal", journal({ "npm--pdfkit.md": PDFKIT })]);
  for (const query of ["pdfkit", "pdfkit@1.2.0", "pkg:npm/pdfkit@1.0.0", "PDFKit"]) {
    assert.deepEqual(ids(recall(s, query, ["npm"])), ["personal pkg:npm/pdfkit exact"], query);
  }
  const requests = sources(["personal", journal({ "pypi--requests.md": note({ id: "pkg:pypi/requests" }) })]);
  assert.deepEqual(ids(recall(requests, "requests[socks]>=2", ["pypi"])), ["personal pkg:pypi/requests exact"]);
  assert.deepEqual(ids(recall(requests, "Requests", ["pypi"])), ["personal pkg:pypi/requests exact"]);
});

test("exact: a repository note that lists the package in packages (schema rule 6)", () => {
  const s = sources(["personal", journal({ "github--microsoft--playwright-cli.md": note({ id: "pkg:github/microsoft/playwright-cli", packages: ["pkg:npm/%40playwright/cli"] }) })]);
  assert.deepEqual(ids(recall(s, "@playwright/cli", ["npm"])), ["personal pkg:github/microsoft/playwright-cli exact"]);
  assert.deepEqual(recall(s, "cli", ["npm"]), [], "a scope is part of the name");
});

test("name-only: the same name under another type, or a GitHub repository with that name", () => {
  const s = sources(["personal", journal({
    "pypi--pdfkit.md": note({ id: "pkg:pypi/pdfkit" }),
    "github--foliojs--pdfkit.md": note({ id: "pkg:github/foliojs/pdfkit" }),
  })]);
  assert.deepEqual(ids(recall(s, "pdfkit", ["npm"])), ["personal pkg:github/foliojs/pdfkit name-only", "personal pkg:pypi/pdfkit name-only"]);
});

test("name-only compares names case-insensitively, with _ . - the same; a scope still counts", () => {
  const s = sources(["personal", journal({
    "pypi--my-pkg.md": note({ id: "pkg:pypi/my-pkg" }),
    "npm--node.md": note({ id: "pkg:npm/node" }),
  })]);
  assert.deepEqual(ids(recall(s, "My_Pkg", ["npm"])), ["personal pkg:pypi/my-pkg name-only"]);
  assert.deepEqual(recall(s, "@types/node", ["npm"]), []);
});

test("an exact match in either journal hides name-only matches in both; project first", () => {
  const project = journal({ "npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: "fine here" }) });
  const personal = journal({ "pypi--pdfkit.md": note({ id: "pkg:pypi/pdfkit" }), "npm--pdfkit.md": PDFKIT });
  assert.deepEqual(ids(recall(sources(["personal", personal], ["project", project]), "pdfkit", ["npm"])), [
    "project pkg:npm/pdfkit exact",
    "personal pkg:npm/pdfkit exact",
  ]);
  const onlyNameOnly = journal({ "pypi--pdfkit.md": note({ id: "pkg:pypi/pdfkit" }) });
  assert.deepEqual(ids(recall(sources(["project", onlyNameOnly]), "pdfkit", ["npm"])), ["project pkg:pypi/pdfkit name-only"]);
});

test("several candidate types (an unsettled bare name): a match under any of them is exact", () => {
  const s = sources(["personal", journal({ "pypi--pdfkit.md": note({ id: "pkg:pypi/pdfkit" }), "cargo--pdfkit.md": note({ id: "pkg:cargo/pdfkit" }) })]);
  assert.deepEqual(ids(recall(s, "pdfkit", ["npm", "pypi", "cargo"])), ["personal pkg:cargo/pdfkit exact", "personal pkg:pypi/pdfkit exact"]);
});

test("a match carries the Verdict, Avoid when and Use when as items, drafts, status and path", () => {
  const path = journal({
    "npm--pdfkit.md": PDFKIT,
    "npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib", useWhen: ["quick one-page PDFs", "forms"], drafts: ["Use when"] }),
  });
  const [pdfkit] = recall(sources(["personal", path]), "pdfkit", ["npm"]);
  assert.deepEqual(pdfkit, {
    query: "pdfkit",
    id: "pkg:npm/pdfkit",
    journal: "personal",
    confidence: "exact",
    name: "pdfkit",
    verdict: "avoid: async streams painful; use puppeteer",
    avoid_when: ["you need streamed output for large PDFs"],
    use_when: [],
    drafts: [],
    status: "reviewed",
    path: join(path, "notes", "npm--pdfkit.md"),
  });
  const [lib] = recall(sources(["personal", path]), "pdf-lib", ["npm"]);
  assert.equal(lib.verdict, null);
  assert.equal(lib.status, "inbox");
  assert.deepEqual(lib.use_when, ["quick one-page PDFs", "forms"]);
  assert.deepEqual(lib.drafts, ["use_when"]);
});

test("isAvoid: a Verdict that starts with the word avoid, or any Avoid when text", () => {
  const base = { verdict: null, avoid_when: [] as string[] };
  assert.equal(isAvoid({ ...base, verdict: "avoid: painful" }), true);
  assert.equal(isAvoid({ ...base, verdict: "Avoid — slow" }), true);
  assert.equal(isAvoid({ ...base, verdict: "avoidance of leaks is built in" }), false);
  assert.equal(isAvoid({ ...base, verdict: "fine; avoid the old API" }), false);
  assert.equal(isAvoid({ ...base, avoid_when: ["large files"] }), true);
  assert.equal(isAvoid(base), false);
});

test("a note without a readable id never matches; a missing journal gives nothing", () => {
  const s = sources(["personal", journal({ "npm--broken.md": "---\nid: [\n---\n\n## Verdict\navoid\n" })], ["project", join(scratchBase("recall"), "missing")]);
  assert.deepEqual(recall(s, "broken", ["npm"]), []);
});

test("the recall cache: written to .cache/, reused while the notes are unchanged, rebuilt after an edit or when unreadable", () => {
  const path = journal({ "npm--pdfkit.md": PDFKIT });
  assert.equal(loadRecallEntries(path).rebuilt, true);
  assert.ok(existsSync(join(path, ".cache", RECALL_CACHE)));
  assert.equal(loadRecallEntries(path).rebuilt, false);

  writeFileSync(join(path, "notes", "npm--pdfkit.md"), PDFKIT.replace("avoid: async streams painful; use puppeteer", "fine now"));
  const edited = loadRecallEntries(path);
  assert.equal(edited.rebuilt, true);
  assert.equal(recall([{ scope: "personal", path, entries: edited.entries }], "pdfkit", ["npm"])[0].verdict, "fine now");

  writeFileSync(join(path, ".cache", RECALL_CACHE), "{not json");
  assert.equal(loadRecallEntries(path).rebuilt, true);
  assert.ok(readFileSync(join(path, ".cache", RECALL_CACHE), "utf8").startsWith("{\""));
});

test("a journal without notes writes no cache", () => {
  const path = scratchBase("recall");
  assert.deepEqual(loadRecallEntries(path).entries, []);
  assert.equal(existsSync(join(path, ".cache")), false);
});
