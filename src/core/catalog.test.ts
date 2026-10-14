import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_CAPS, catalogForAgent, runCatalog, type CatalogRequest } from "./catalog.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Place } from "./journals.ts";
import { renderNote, type NewNote } from "./write.ts";

// repomagpie catalog (spec §2): one compact row per note, across both journals, in pages.

const note = (n: Partial<NewNote> & { id: string; name: string }) => renderNote({ explored: "2026-10-14", kind: "library", tags: [], ...n });

// A personal journal and a project journal in a scratch folder; the project is the working folder.
function place(personal: Record<string, string>, project: Record<string, string> = {}): Place {
  const root = scratchBase("catalog");
  const write = (folder: string, files: Record<string, string>) => {
    mkdirSync(join(folder, "notes"), { recursive: true });
    for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, "notes", file), text);
  };
  write(join(root, "journal"), personal);
  mkdirSync(join(root, "project", ".git"), { recursive: true });
  if (Object.keys(project).length) write(join(root, "project", ".magpie"), project);
  mkdirSync(join(root, "home"));
  return { home: join(root, "home"), env: { MAGPIE_HOME: join(root, "journal") }, cwd: join(root, "project") };
}

const request = (over: Partial<CatalogRequest> = {}): CatalogRequest => ({ limit: 100, ...over });

const PERSONAL = {
  "npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", name: "pdfkit", tags: ["pdf"], verdict: "avoid: async streams painful; use puppeteer",
    useWhen: ["small PDFs, no streams", "a second use"], whatItDoes: "A PDF generation library." }),
  "npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib", name: "pdf-lib", tags: ["pdf", "editing"], whatItDoes: "Create and modify PDF documents.\n\nMore text." }),
  "github--mattpocock--skills.md": note({ id: "pkg:github/mattpocock/skills", name: "mattpocock/skills", kind: "skill-pack", tags: ["workflow"], skills: ["tdd"] }),
  "npm--puppeteer.md": note({ id: "pkg:npm/puppeteer", name: "Puppeteer", tags: ["pdf", "browser"], verdict: "default for PDF rendering" })
    .replace("\nstatus:", '\nalternatives: ["[[pdfkit]]", "[[wkhtmltopdf]]"]\nstatus:'),
};
const PROJECT = {
  "npm--puppeteer.md": note({ id: "pkg:npm/puppeteer", name: "puppeteer", tags: ["pdf"], verdict: "the team's PDF renderer" }),
};

test("one row per note, with the spec's fields in order; skill lines aren't rows", () => {
  const run = runCatalog(request(), place(PERSONAL));
  assert.equal(run.outcome, "ok");
  assert.deepEqual(Object.keys(run.document), ["notes", "total", "next_cursor"]);
  assert.equal(run.document.total, 4);
  assert.equal(run.document.next_cursor, null);
  const pdfkit = run.document.notes.find((n) => n.name === "pdfkit");
  assert.deepEqual(pdfkit, {
    id: "pkg:npm/pdfkit",
    name: "pdfkit",
    kind: "library",
    tags: ["pdf"],
    summary: "small PDFs, no streams",
    verdict: "avoid: async streams painful; use puppeteer",
    status: "reviewed",
    journal: "personal",
    alternatives: ["Puppeteer"], // listed by puppeteer's note: alternatives work from either side
  });
});

test("summary: the first Use when item, else the first line of What it does, else null", () => {
  const notes = runCatalog(request(), place(PERSONAL)).document.notes;
  const by = (name: string) => notes.find((n) => n.name === name);
  assert.equal(by("pdfkit")?.summary, "small PDFs, no streams");
  assert.equal(by("pdf-lib")?.summary, "Create and modify PDF documents.");
  assert.equal(by("mattpocock/skills")?.summary, null);
  assert.equal(by("pdf-lib")?.verdict, null);
  assert.equal(by("pdf-lib")?.status, "inbox");
});

test("alternatives are names: resolved notes by their name, unresolved targets as written", () => {
  const notes = runCatalog(request(), place(PERSONAL)).document.notes;
  assert.deepEqual(notes.find((n) => n.name === "Puppeteer")?.alternatives, ["pdfkit", "wkhtmltopdf"]);
  assert.deepEqual(notes.find((n) => n.name === "pdf-lib")?.alternatives, []);
});

test("order: by name ignoring case; the same name in both journals, project first", () => {
  const run = runCatalog(request(), place(PERSONAL, PROJECT));
  assert.deepEqual(run.document.notes.map((n) => `${n.name} ${n.journal}`), [
    "mattpocock/skills personal", "pdf-lib personal", "pdfkit personal", "puppeteer project", "Puppeteer personal",
  ]);
});

test("filters: --tag (every tag), --kind and --journal; total counts what the filters keep", () => {
  const p = place(PERSONAL, PROJECT);
  const names = (over: Partial<CatalogRequest>) => runCatalog(request(over), p).document.notes.map((n) => `${n.name} ${n.journal}`);
  assert.deepEqual(names({ tags: ["pdf", "editing"] }), ["pdf-lib personal"]);
  assert.deepEqual(names({ kind: "skill-pack" }), ["mattpocock/skills personal"]);
  assert.deepEqual(names({ journal: "project" }), ["puppeteer project"]);
  assert.equal(runCatalog(request({ journal: "personal" }), p).document.total, 4);
});

test("pages: limit, then next_cursor until null; every row exactly once", () => {
  const p = place(PERSONAL, PROJECT);
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const run = runCatalog(request({ limit: 2, cursor }), p);
    assert.equal(run.outcome, "ok");
    assert.equal(run.document.total, 5);
    seen.push(...run.document.notes.map((n) => `${n.name} ${n.journal}`));
    if (run.document.next_cursor === null) break;
    cursor = run.document.next_cursor;
  }
  assert.deepEqual(seen, runCatalog(request(), p).document.notes.map((n) => `${n.name} ${n.journal}`));
});

test("a cursor survives a note added before it: the next page starts after the last row shown", () => {
  const p = place(PERSONAL);
  const first = runCatalog(request({ limit: 2 }), p);
  assert.deepEqual(first.document.notes.map((n) => n.name), ["mattpocock/skills", "pdf-lib"]);
  writeFileSync(join(p.env.MAGPIE_HOME as string, "notes", "npm--aaa.md"), note({ id: "pkg:npm/aaa", name: "aaa" }));
  const next = runCatalog(request({ limit: 2, cursor: first.document.next_cursor ?? undefined }), p);
  assert.deepEqual(next.document.notes.map((n) => n.name), ["pdfkit", "Puppeteer"]);
});

test("a cursor that isn't one is a usage error, with the document's empty shape", () => {
  for (const cursor of ["nope", Buffer.from("[1,2]").toString("base64url"), Buffer.from('["a","elsewhere","b"]').toString("base64url")]) {
    const run = runCatalog(request({ cursor }), place(PERSONAL));
    assert.equal(run.outcome, "usage", cursor);
    assert.deepEqual({ ...run.document, error: typeof run.document.error }, { notes: [], total: 0, next_cursor: null, error: "string" });
  }
});

test("no journal at all: an empty catalog, and nothing is created", () => {
  const root = scratchBase("catalog");
  const run = runCatalog(request(), { home: join(root, "home"), env: { MAGPIE_HOME: join(root, "none") }, cwd: root });
  assert.deepEqual(run.document, { notes: [], total: 0, next_cursor: null });
  assert.equal(existsSync(join(root, "none")), false);
});

test("for an agent: note text gets markers and the catalog's caps, with truncated", () => {
  const rtl = String.fromCharCode(0x202e);
  const long = "x".repeat(CATALOG_CAPS.verdict + 50);
  const p = place({
    "npm--evil.md": note({ id: "pkg:npm/evil", name: `ev${rtl}il`, tags: ["pdf"], verdict: long, useWhen: ["y".repeat(CATALOG_CAPS.summary + 1)] }),
  });
  const [row] = catalogForAgent(runCatalog(request(), p).document).notes;
  assert.equal(row.name, "ev<U+202E>il");
  assert.equal(row.verdict?.length, CATALOG_CAPS.verdict);
  assert.ok(row.verdict?.endsWith("…"));
  assert.equal(row.summary?.length, CATALOG_CAPS.summary);
  assert.deepEqual(row.truncated, ["summary", "verdict"]);
  const honest = catalogForAgent(runCatalog(request(), place(PERSONAL)).document).notes;
  assert.ok(honest.every((n) => !("truncated" in n)));
});
