import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderNote, type NewNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// magpie recall (spec §2, §5, §8) in sandboxes.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });

const PDFKIT = note({
  id: "pkg:npm/pdfkit",
  verdict: "avoid: async streams painful; use puppeteer",
  avoidWhen: ["you need streamed output for large PDFs", "you stream to S3"],
  useWhen: ["quick one-page PDFs from a script"],
  drafts: ["Use when"],
  whatItDoes: "A PDF generation library for Node.",
});

const FILES = {
  "journal/notes/npm--pdfkit.md": PDFKIT,
  "journal/notes/pypi--requests.md": note({ id: "pkg:pypi/requests", verdict: "default HTTP client" }),
  "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib" }),
  "project/.magpie/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: "fine for invoices here" }),
};

test("one card per match, project journal first: name · type · journal, Verdict, Avoid when, Use when, path", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["recall", "pdfkit@1.2.0"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, "");
  assert.equal(r.out, [
    "pdfkit · npm · project journal",
    "  Verdict       fine for invoices here",
    `  ${join(box.project, ".magpie", "notes", "npm--pdfkit.md")}`,
    "",
    "pdfkit · npm · personal journal",
    "  Verdict       avoid: async streams painful; use puppeteer",
    "  Avoid when    you need streamed output for large PDFs (+1 more)",
    "  Use when      (draft) quick one-page PDFs from a script",
    `  ${join(box.journal, "notes", "npm--pdfkit.md")}`,
    "",
  ].join("\n"));
});

test("an inbox note says so; a path in the home directory starts with ~", async () => {
  const box = sandbox({ "home/.magpie/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib" }) });
  const r = await magpie(box, ["recall", "pdf-lib"], { env: {} }); // personal journal: <home>/.magpie
  assert.equal(r.out, ["pdf-lib · npm · personal journal", "  Verdict       [inbox] no verdict yet", `  ${join("~", ".magpie", "notes", "npm--pdf-lib.md")}`, ""].join("\n"));
});

test("--json prints the spec's document", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["recall", "pdfkit", "--json"]);
  assert.equal(r.err, "");
  const json = JSON.parse(r.out);
  assert.deepEqual(Object.keys(json), ["matches"]);
  assert.deepEqual(json.matches[1], {
    query: "pdfkit",
    id: "pkg:npm/pdfkit",
    journal: "personal",
    confidence: "exact",
    verdict: "avoid: async streams painful; use puppeteer",
    avoid_when: ["you need streamed output for large PDFs", "you stream to S3"],
    use_when: ["quick one-page PDFs from a script"],
    drafts: ["use_when"],
    status: "reviewed",
    path: join(box.journal, "notes", "npm--pdfkit.md"),
    alternatives: [],
  });
  assert.equal(json.matches[0].journal, "project");
});

test("a damaged recall cache: an entry of the wrong shape is rebuilt from the notes, and recall answers as before", async () => {
  const box = sandbox(FILES);
  const before = await magpie(box, ["recall", "pdfkit", "--json"]); // builds the caches
  for (const cacheFile of [join(box.journal, ".cache", "recall-index.json"), join(box.project, ".magpie", ".cache", "recall-index.json")]) {
    const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as { data: Record<string, unknown>[] };
    writeFileSync(cacheFile, JSON.stringify({ ...cache, data: cache.data.map((e) => (e.file === "npm--pdfkit.md" ? { ...e, keys: "npm pdfkit", avoidWhen: "never" } : e)) }));
  }
  const after = await magpie(box, ["recall", "pdfkit", "--json"]);
  assert.deepEqual([after.code, after.err, after.out], [before.code, "", before.out]);
});

test("no match: nothing on stdout, a short message on stderr, exit 0; --json gives an empty list", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["recall", "left-pad"]);
  assert.deepEqual([r.code, r.out, r.err], [0, "", "No note for left-pad.\n"]);
  assert.deepEqual(JSON.parse((await magpie(box, ["recall", "left-pad", "--json"])).out), { matches: [] });
});

test("several packages: each query's matches in turn; a query without a note is reported on stderr", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["recall", "requests", "left-pad", "pdf-lib", "--json"]);
  assert.deepEqual(JSON.parse(r.out).matches.map((m: { query: string; id: string }) => `${m.query} ${m.id}`), ["requests pkg:pypi/requests", "pdf-lib pkg:npm/pdf-lib"]);
  const human = await magpie(box, ["recall", "requests", "left-pad"]);
  assert.match(human.out, /^requests · pypi · personal journal/);
  assert.equal(human.err, "No note for left-pad.\n");
});

test("a bare name is typed by the nearest manifest; another type then matches by name only", async () => {
  const box = sandbox({ ...FILES, "project/package.json": "{}" });
  const r = await magpie(box, ["recall", "requests"]);
  assert.match(r.out, /^requests · pypi · personal journal \(name match only\)\n/);
  const json = JSON.parse((await magpie(box, ["recall", "requests", "--json"])).out);
  assert.equal(json.matches[0].confidence, "name-only");
});

test("without a manifest, a bare name is looked up under every type; --type and a PURL settle it", async () => {
  const box = sandbox(FILES);
  const exact = async (...argv: string[]) => JSON.parse((await magpie(box, ["recall", ...argv, "--json"])).out).matches.map((m: { confidence: string }) => m.confidence);
  assert.deepEqual(await exact("requests"), ["exact"]);
  assert.deepEqual(await exact("requests", "--type", "npm"), ["name-only"]);
  assert.deepEqual(await exact("pkg:pypi/requests@2.31.0"), ["exact"]);
  assert.equal((await magpie(box, ["recall", "requests", "--type", "gem"])).code, 2);
});

test("--full shows every section that has text", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["recall", "pdfkit", "--full"]);
  const personal = r.out.split("\n\n")[1];
  assert.match(personal, /\n {2}Avoid when +you need streamed output for large PDFs\n {2}\s+you stream to S3\n/);
  assert.match(personal, /\n {2}What it does +A PDF generation library for Node\.\n/);
  assert.ok(!personal.includes("(+1 more)"));
});

// --- Alternatives (decision 0029) ---

const withAlternatives = (text: string, entries: string[]) => text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);
const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering in new projects" });
const ALTERNATIVES = {
  "journal/notes/npm--pdfkit.md": withAlternatives(note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful; use puppeteer", avoidWhen: ["you need streamed output for large PDFs"] }),
    ["[[npm--puppeteer]]", "[[pdf-lib]]", "[[jspdf]]", "[[wkhtmltopdf]]"]),
  "journal/notes/npm--puppeteer.md": PUPPETEER,
  "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib" }),
  "journal/notes/npm--jspdf.md": note({ id: "pkg:npm/jspdf", verdict: "avoid: tiny API" }),
  "journal/notes/npm--playwright.md": withAlternatives(note({ id: "pkg:npm/playwright", verdict: "browser tests" }), ["[[pdfkit]]"]),
};
const terminal = (box: ReturnType<typeof sandbox>) => ({ columns: 120, env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });

test("the card's Alternatives row: after Avoid when, the alternative's name and Verdict", async () => {
  const box = sandbox({ "journal/notes/npm--pdfkit.md": withAlternatives(PDFKIT, ["[[puppeteer]]"]), "journal/notes/npm--puppeteer.md": PUPPETEER });
  const r = await magpie(box, ["recall", "pdfkit"]);
  assert.equal(r.out, [
    "pdfkit · npm · personal journal",
    "  Verdict       avoid: async streams painful; use puppeteer",
    "  Avoid when    you need streamed output for large PDFs (+1 more)",
    "  Alternatives  puppeteer: default for PDF rendering in new projects",
    "  Use when      (draft) quick one-page PDFs from a script",
    `  ${join(box.journal, "notes", "npm--pdfkit.md")}`,
    "",
  ].join("\n"));
});

test("several alternatives in a terminal: one per line, at most 3, then +N more; inbox, avoid and no-note ones say so", async () => {
  const box = sandbox(ALTERNATIVES);
  const r = await magpie(box, ["recall", "pdfkit"], terminal(box));
  assert.equal(r.out, [
    "pdfkit · npm · personal journal",
    "  Verdict       avoid: async streams painful; use puppeteer",
    "  Avoid when    you need streamed output for large PDFs",
    "  Alternatives  playwright: browser tests",
    "                puppeteer: default for PDF rendering in new projects",
    "                pdf-lib: [inbox] no verdict yet",
    "                +2 more (magpie recall pdfkit --full)",
    `  ${join(box.journal, "notes", "npm--pdfkit.md")}`,
    "",
  ].join("\n"));
});

test("several alternatives piped: one line, separated by ; (spec §8)", async () => {
  const box = sandbox(ALTERNATIVES);
  const r = await magpie(box, ["recall", "pdfkit"]);
  assert.match(r.out, /\n {2}Alternatives {2}playwright: browser tests; puppeteer: default for PDF rendering in new projects; pdf-lib: \[inbox\] no verdict yet; \+2 more \(magpie recall pdfkit --full\)\n/);
});

test("--full lists every alternative, after Avoid when", async () => {
  const box = sandbox(ALTERNATIVES);
  const r = await magpie(box, ["recall", "pdfkit", "--full"], terminal(box));
  assert.match(r.out, new RegExp([
    "\n {2}Avoid when {6}you need streamed output for large PDFs",
    " {2}Alternatives {4}playwright: browser tests",
    " {18}puppeteer: default for PDF rendering in new projects",
    " {18}pdf-lib: \\[inbox\\] no verdict yet",
    " {18}jspdf: avoid: tiny API \\(you also noted to avoid it\\)",
    " {18}wkhtmltopdf\n",
  ].join("\n")));
  assert.ok(!r.out.includes("more (magpie recall"));
});

test("--json: every match carries its alternatives in recall's shape", async () => {
  const box = sandbox(ALTERNATIVES);
  const json = JSON.parse((await magpie(box, ["recall", "pdfkit", "--json"])).out) as { matches: { alternatives: unknown[] }[] };
  const path = (file: string) => join(box.journal, "notes", file);
  assert.deepEqual(json.matches[0].alternatives, [
    { name: "playwright", id: "pkg:npm/playwright", journal: "personal", verdict: "browser tests", status: "reviewed", avoid: false, path: path("npm--playwright.md") },
    { name: "puppeteer", id: "pkg:npm/puppeteer", journal: "personal", verdict: "default for PDF rendering in new projects", status: "reviewed", avoid: false, path: path("npm--puppeteer.md") },
    { name: "pdf-lib", id: "pkg:npm/pdf-lib", journal: "personal", verdict: null, status: "inbox", avoid: false, path: path("npm--pdf-lib.md") },
    { name: "jspdf", id: "pkg:npm/jspdf", journal: "personal", verdict: "avoid: tiny API", status: "reviewed", avoid: true, path: path("npm--jspdf.md") },
    { name: "wkhtmltopdf", id: null, journal: "personal", verdict: null, status: null, avoid: false, path: null },
  ]);
});

test("colour only in a terminal: the Avoid when label and [inbox]; never with NO_COLOR or --json", async () => {
  const box = sandbox(FILES);
  const terminal = await magpie(box, ["recall", "pdfkit", "pdf-lib"], { columns: 120 });
  assert.match(terminal.out, /\u001b\[31mAvoid when\u001b\[39m/);
  assert.match(terminal.out, /\u001b\[33m\[inbox\]\u001b\[39m no verdict yet/);
  const plain = await magpie(box, ["recall", "pdfkit", "pdf-lib"], { columns: 120, env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  assert.ok(!plain.out.includes("\u001b"));
  assert.ok(!(await magpie(box, ["recall", "pdfkit", "--json"], { columns: 120 })).out.includes("\u001b"));
});
