import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { linkIndex } from "./links.ts";
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
    alternatives: [],
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

test("the recall cache: an entry of the wrong shape for an unchanged note makes it rebuilt from the notes", () => {
  const path = journal({ "npm--pdfkit.md": PDFKIT, "npm--zod.md": note({ id: "pkg:npm/zod", verdict: "fine" }) });
  const good = loadRecallEntries(path).entries;
  const cacheFile = join(path, ".cache", RECALL_CACHE);
  const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as { version: number; files: unknown; data: Record<string, unknown>[] };
  const zod = cache.data.find((e) => e.file === "npm--zod.md") as Record<string, unknown>;
  const { keys: _keys, ...noKeys } = zod;
  const wrongs: unknown[] = [
    noKeys, { ...zod, keys: "npm zod" }, { ...zod, keys: [["npm"]] }, { ...zod, keys: [[1, "zod"]] }, { ...zod, keys: [null] },
    { ...zod, verdict: null }, { ...zod, avoidWhen: "never" }, { ...zod, useWhen: [1] }, { ...zod, drafts: ["verdict"] },
    { ...zod, status: "done" }, { ...zod, file: 5 }, { ...zod, id: null }, { ...zod, name: null }, "nonsense", null, [],
    { ...zod, alternatives: undefined }, { ...zod, alternatives: "[[x]]" }, { ...zod, alternatives: ["[[x]]"] },
    { ...zod, alternatives: [{ target: 1, label: null }] }, { ...zod, alternatives: [{ target: "x" }] }, { ...zod, alternatives: [null] },
  ];
  for (const wrong of wrongs) {
    writeFileSync(cacheFile, JSON.stringify({ ...cache, data: cache.data.map((e) => (e === zod ? wrong : e)) }));
    const loaded = loadRecallEntries(path);
    assert.deepEqual([loaded.rebuilt, loaded.entries], [true, good], JSON.stringify(wrong));
    assert.deepEqual(ids(recall([{ scope: "personal", path, entries: loaded.entries }], "pdfkit", ["npm"])), ["personal pkg:npm/pdfkit exact"]);
    assert.equal(loadRecallEntries(path).rebuilt, false, `the cache was rewritten after ${JSON.stringify(wrong)}`);
  }
  writeFileSync(cacheFile, JSON.stringify({ ...cache, data: { "npm--zod.md": zod } })); // not a list
  assert.deepEqual(loadRecallEntries(path).entries, good);
});

test("a journal without notes writes no cache", () => {
  const path = scratchBase("recall");
  assert.deepEqual(loadRecallEntries(path).entries, []);
  assert.equal(existsSync(join(path, ".cache")), false);
});

// --- Alternatives (decision 0029): the alternatives field, from both sides, within one journal ---

// A note with `alternatives: [...]` in its frontmatter, each entry written as given.
const withAlternatives = (text: string, entries: string[]) => text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);

const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering in new projects" });
const alternatives = (s: RecallSource[], query: string) => recall(s, query, ["npm"])[0].alternatives;
const names = (s: RecallSource[], query: string) => alternatives(s, query).map((a) => a.name);
const unresolved = (name: string, journal = "personal", reason = "missing") => ({ name, id: null, journal, verdict: null, status: null, avoid: false, path: null, reason });

test("alternatives: forward (by file stem or name), reverse, and both sides once", () => {
  const forward = journal({ "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[npm--puppeteer]]"]), "npm--puppeteer.md": PUPPETEER });
  const path = join(forward, "notes", "npm--puppeteer.md");
  const puppeteer = { name: "puppeteer", id: "pkg:npm/puppeteer", journal: "personal", verdict: "default for PDF rendering in new projects", status: "reviewed", avoid: false, path };
  assert.deepEqual(alternatives(sources(["personal", forward]), "pdfkit"), [puppeteer]);
  assert.deepEqual(names(sources(["personal", forward]), "puppeteer"), ["pdfkit"], "the reverse side");

  const byName = journal({ "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[puppeteer]]"]), "npm--puppeteer.md": PUPPETEER });
  assert.equal(alternatives(sources(["personal", byName]), "pdfkit")[0].id, "pkg:npm/puppeteer");

  const both = journal({
    "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[npm--puppeteer]]"]),
    "npm--puppeteer.md": withAlternatives(PUPPETEER, ["[[pdfkit]]"]),
  });
  assert.deepEqual(names(sources(["personal", both]), "pdfkit"), ["puppeteer"]);
  assert.deepEqual(names(sources(["personal", both]), "puppeteer"), ["pdfkit"]);
});

test("alternatives: an unresolved or ambiguous target is shown by its name as written, with no note and its reason", () => {
  const s = sources(["personal", journal({
    "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[wkhtmltopdf|wk]]", "[[pdf]]"]),
    "npm--pdf.md": note({ id: "pkg:npm/pdf", name: "pdf" }),
    "pypi--pdf.md": note({ id: "pkg:pypi/pdf", name: "pdf" }),
  })]);
  assert.deepEqual(alternatives(s, "pdfkit"), [unresolved("pdf", "personal", "ambiguous"), unresolved("wkhtmltopdf")]);
});

test("alternatives: an avoid note and an inbox note are marked; order is reviewed, inbox, avoid, unresolved, then by name", () => {
  const s = sources(["personal", journal({
    "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[zzz-missing]]", "[[jspdf]]", "[[pdf-lib]]", "[[aaa-missing]]", "[[puppeteer]]", "[[html-pdf]]", "[[playwright]]"]),
    "npm--puppeteer.md": PUPPETEER,
    "npm--playwright.md": note({ id: "pkg:npm/playwright", verdict: "fine" }),
    "npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib" }),
    "npm--jspdf.md": note({ id: "pkg:npm/jspdf", verdict: "avoid: tiny API" }),
    "npm--html-pdf.md": note({ id: "pkg:npm/html-pdf", avoidWhen: ["you need it maintained"] }),
  })]);
  assert.deepEqual(alternatives(s, "pdfkit").map((a) => [a.name, a.status, a.avoid]), [
    ["playwright", "reviewed", false],
    ["puppeteer", "reviewed", false],
    ["pdf-lib", "inbox", false],
    ["html-pdf", "inbox", true],
    ["jspdf", "reviewed", true],
    ["aaa-missing", null, false],
    ["zzz-missing", null, false],
  ]);
  assert.equal(alternatives(s, "pdfkit")[2].verdict, null);
});

test("alternatives: a note never lists itself; a target written twice, in another case or with a label, counts once", () => {
  const s = sources(["personal", journal({
    "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[pdfkit]]", "[[npm--pdfkit]]", "[[npm--puppeteer]]", "[[Puppeteer|the browser]]", "puppeteer", "[[Wk]]", "[[wk|x]]"]),
    "npm--puppeteer.md": withAlternatives(PUPPETEER, ["[[NPM--PDFKIT]]"]),
  })]);
  assert.deepEqual(names(s, "pdfkit"), ["puppeteer", "Wk"]);
});

test("alternatives: resolved within the note's own journal; a target only in the other journal is unresolved", () => {
  const project = journal({ "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[puppeteer]]"]) });
  const personal = journal({ "npm--puppeteer.md": PUPPETEER, "npm--pdfkit.md": PDFKIT });
  const [inProject, inPersonal] = recall(sources(["personal", personal], ["project", project]), "pdfkit", ["npm"]);
  assert.deepEqual([inProject.journal, inProject.alternatives], ["project", [unresolved("puppeteer", "project")]]);
  assert.deepEqual([inPersonal.journal, inPersonal.alternatives], ["personal", []]);
});

test("alternatives resolve as the link index resolves the same field (one rule, src/core/wikilinks.ts)", () => {
  const path = journal({
    "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[npm--puppeteer]]", "[[Pdf-Lib|lib]]", "[[pdf]]", "[[missing]]", "plain-name", "[[NPM--ZOD#Verdict]]"]),
    "npm--puppeteer.md": PUPPETEER,
    "npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib" }),
    "npm--pdf.md": note({ id: "pkg:npm/pdf", name: "pdf" }),
    "pypi--pdf.md": note({ id: "pkg:pypi/pdf", name: "pdf" }),
    "npm--zod.md": note({ id: "pkg:npm/zod" }),
    "plain-name.md": note({ id: "pkg:npm/plain", name: "plain" }),
    "npm--broken.md": "---\nid: [\nname: pdf-lib\n---\n",
  });
  const fromIndex = linkIndex(path).outgoing["npm--pdfkit.md"].filter((l) => l.from === "alternatives").map((l) => l.id);
  const fromRecall = alternatives(sources(["personal", path]), "pdfkit").map((a) => a.id);
  const order = (ids: (string | null)[]) => [...ids].sort((a, b) => String(a).localeCompare(String(b)));
  assert.deepEqual(order(fromRecall), order(fromIndex));
  assert.deepEqual(order(fromRecall), order(["pkg:npm/pdf-lib", "pkg:npm/plain", "pkg:npm/puppeteer", "pkg:npm/zod", null, null]));
});

test("the recall cache: entries keep the alternatives as written; a version 1 cache is rebuilt once", () => {
  const path = journal({ "npm--pdfkit.md": withAlternatives(PDFKIT, ["[[npm--puppeteer|Puppeteer]]", "wkhtmltopdf"]), "npm--puppeteer.md": PUPPETEER });
  const { entries } = loadRecallEntries(path);
  assert.deepEqual(entries.find((e) => e.file === "npm--pdfkit.md")?.alternatives, [{ target: "npm--puppeteer", label: "Puppeteer" }, { target: "wkhtmltopdf", label: null }]);
  assert.deepEqual(entries.find((e) => e.file === "npm--puppeteer.md")?.alternatives, []);

  const cacheFile = join(path, ".cache", RECALL_CACHE);
  const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as { version: number; files: unknown; data: Record<string, unknown>[] };
  assert.equal(cache.version, 2);
  const versionOne = cache.data.map(({ alternatives: _alternatives, ...rest }) => rest);
  writeFileSync(cacheFile, JSON.stringify({ version: 1, files: cache.files, data: versionOne }));
  const upgraded = loadRecallEntries(path);
  assert.deepEqual([upgraded.rebuilt, upgraded.entries], [true, entries]);
  assert.equal(loadRecallEntries(path).rebuilt, false);
});
