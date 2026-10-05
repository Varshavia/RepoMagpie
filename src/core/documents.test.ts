import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { editNote, noteVersion } from "./edit.ts";
import { fakeFetch, recorded } from "./fixtures/fake-fetch.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import {
  locateNote,
  noteDocument,
  noteListDocument,
  patchNote,
  previewNote,
  settingsDocument,
  tagListDocument,
} from "./documents.ts";
import { parseTagList, STARTER_TAGS } from "./journals.ts";
import { readNote } from "./note.ts";
import { runNote, type Context } from "./save.ts";
import { packageVersion } from "./version.ts";

// The shared JSON documents (spec §2) over a scratch home, personal journal and project journal.

const PDFKIT = `---
id: pkg:npm/pdfkit
name: pdfkit
url: https://www.npmjs.com/package/pdfkit
topics: []
packages: []
explored: 2026-10-03
kind: library
tags: [pdf]
tried: true
rating: 2
status: reviewed
---

## Verdict
avoid: async streams painful; use puppeteer

## Use when
<!-- magpie:draft -->
- quick one-page PDFs

## Notable skills
- \`pdf-forms\` — fill PDF forms from a script
- \`pdf-merge\` —

## Benchmarks
Slow.
`;

const PLAYWRIGHT = `---
id: pkg:github/microsoft/playwright-cli
name: microsoft/playwright-cli
packages: [pkg:npm/%40playwright/cli]
explored: 2026-10-02
kind: cli
tags: [testing]
tried: false
rating:
status: inbox
---

## Verdict
`;

const BROKEN = "---\nid: [pkg:npm/broken\n---\n\n## Verdict\n";
const PUPPETEER = "---\nid: pkg:npm/puppeteer\nname: puppeteer\nexplored: 2026-10-01\nkind: library\ntags: []\ntried: true\nrating:\nstatus: reviewed\n---\n\n## Verdict\ndefault for PDF rendering\n";

function setup(files: Record<string, string> = {}) {
  const base = scratchBase("documents");
  const journal = join(base, "journal");
  const project = join(base, "project");
  const all: Record<string, string> = {
    "journal/notes/npm--pdfkit.md": PDFKIT,
    "journal/notes/github--microsoft--playwright-cli.md": PLAYWRIGHT,
    "journal/notes/npm--broken.md": BROKEN,
    "journal/tags.md": "- `pdf`\n- `testing`\n",
    "project/.magpie/notes/npm--puppeteer.md": PUPPETEER,
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), text);
  }
  mkdirSync(join(base, "home"));
  mkdirSync(join(project, ".git"), { recursive: true });
  const context: Context = {
    home: join(base, "home"),
    env: { MAGPIE_HOME: journal },
    cwd: project,
    fetch: fakeFetch(recorded("microsoft--playwright-cli")),
    today: () => "2026-10-05",
  };
  return { base, journal, project, context, note: (file: string) => join(journal, "notes", file) };
}

// --- Settings ---

test("Settings: both journals with their paths, and whether a GitHub token is set", () => {
  const s = setup();
  assert.deepEqual(settingsDocument(s.context), {
    version: packageVersion(),
    journals: { personal: { path: s.journal, exists: true }, project: { path: join(s.project, ".magpie"), exists: true } },
    github_token_set: false,
  });
});

test("Settings never contains the token's value", () => {
  const s = setup();
  const document = settingsDocument({ ...s.context, env: { ...s.context.env, GITHUB_TOKEN: "ghp_never_shown_123" } });
  assert.equal(document.github_token_set, true);
  assert.doesNotMatch(JSON.stringify(document), /ghp_never_shown_123/);
});

test("Settings: a project journal not created yet is where it would be; none when there is no project root", () => {
  const s = setup();
  const elsewhere = join(s.base, "other");
  mkdirSync(join(elsewhere, ".git"), { recursive: true });
  assert.deepEqual(settingsDocument({ ...s.context, cwd: elsewhere }).journals.project, { path: join(elsewhere, ".magpie"), exists: false });
  assert.equal(settingsDocument({ ...s.context, cwd: s.context.home }).journals.project, null);
});

// --- Tag list ---

test("Tag list: the journal's tags.md, or the starter list for a journal not created yet", () => {
  const s = setup();
  assert.deepEqual(tagListDocument("personal", s.context), { outcome: "ok", document: { journal: "personal", tags: ["pdf", "testing"] } });
  assert.deepEqual(tagListDocument("project", s.context).document, { journal: "project", tags: [] });
  const fresh = join(s.base, "fresh");
  mkdirSync(join(fresh, ".git"), { recursive: true });
  assert.deepEqual(tagListDocument("project", { ...s.context, cwd: fresh }).document, { journal: "project", tags: parseTagList(STARTER_TAGS) });
});

// --- Note list ---

test("Note list: every note, sorted by name, read-only ones included", () => {
  const s = setup();
  const { outcome, document } = noteListDocument("personal", {}, s.context);
  assert.equal(outcome, "ok");
  assert.equal(document.count, 3);
  assert.deepEqual(document.notes.map((n) => n.file), ["github--microsoft--playwright-cli.md", "npm--broken.md", "npm--pdfkit.md"]);
  assert.deepEqual(document.notes[2], {
    id: "pkg:npm/pdfkit", file: "npm--pdfkit.md", name: "pdfkit", kind: "library", tags: ["pdf"], status: "reviewed",
    verdict: "avoid: async streams painful; use puppeteer", tried: true, rating: 2, explored: "2026-10-03", read_only: false,
  });
  assert.deepEqual(document.notes[1], {
    id: null, file: "npm--broken.md", name: null, kind: null, tags: [], status: "inbox",
    verdict: "", tried: false, rating: null, explored: null, read_only: true,
  });
});

test("Note list filters: status, kind, and every tag", () => {
  const s = setup();
  const files = (filters: Parameters<typeof noteListDocument>[1]) => noteListDocument("personal", filters, s.context).document.notes.map((n) => n.file);
  assert.deepEqual(files({ status: "inbox" }), ["github--microsoft--playwright-cli.md", "npm--broken.md"]);
  assert.deepEqual(files({ kind: "library" }), ["npm--pdfkit.md"]);
  assert.deepEqual(files({ tags: ["pdf"] }), ["npm--pdfkit.md"]);
  assert.deepEqual(files({ tags: ["pdf", "testing"] }), []);
  assert.deepEqual(noteListDocument("project", {}, s.context).document.notes.map((n) => n.id), ["pkg:npm/puppeteer"]);
});

// --- Note ---

test("Note: the note as read, with its version", () => {
  const s = setup();
  const { outcome, document } = noteDocument("personal", { id: "pkg:npm/pdfkit" }, s.context);
  assert.equal(outcome, "ok");
  assert.deepEqual(document, {
    id: "pkg:npm/pdfkit",
    journal: "personal",
    file: "npm--pdfkit.md",
    path: s.note("npm--pdfkit.md"),
    version: noteVersion(readFileSync(s.note("npm--pdfkit.md"))),
    read_only: false,
    status: "reviewed",
    verdict: "avoid: async streams painful; use puppeteer",
    frontmatter: readNote(PDFKIT).frontmatter,
    sections: [
      { name: "Verdict", heading: "Verdict", body: "avoid: async streams painful; use puppeteer\n", draft: false },
      { name: "Use when", heading: "Use when", body: "<!-- magpie:draft -->\n- quick one-page PDFs\n", draft: true },
      { name: "Notable skills", heading: "Notable skills", body: "- `pdf-forms` — fill PDF forms from a script\n- `pdf-merge` —\n", draft: false },
      { name: null, heading: "Benchmarks", body: "Slow.\n", draft: false },
    ],
    skills: [{ name: "pdf-forms", text: "fill PDF forms from a script" }, { name: "pdf-merge", text: "" }],
    warnings: [],
  });
});

test("Note: a note whose frontmatter can't be read is read-only, addressed by its file name", () => {
  const s = setup();
  const { outcome, document } = noteDocument("personal", { file: "npm--broken.md" }, s.context);
  assert.equal(outcome, "ok");
  assert.equal(document.id, null);
  assert.equal(document.read_only, true);
  assert.equal(document.warnings.length, 1);
});

test("Note: an unknown id or file, a package of another note, and paths are not found", () => {
  const s = setup();
  writeFileSync(join(s.base, "secret.md"), PUPPETEER);
  const addresses = [
    { id: "pkg:npm/nothing" },
    { id: "pkg:npm/%40playwright/cli" },
    { file: "nothing.md" },
    { file: "../tags.md" },
    { file: "..\\tags.md" },
    { file: "../../secret.md" },
    { file: "%2e%2e%2fsecret.md" },
    { file: join(s.base, "secret.md") },
    { file: "notes/npm--pdfkit.md" },
    { file: "NPM--PDFKIT.md" },
    { file: "" },
  ];
  for (const address of addresses) {
    const r = noteDocument("personal", address, s.context);
    assert.equal(r.outcome, "not-found", JSON.stringify(address));
    assert.equal(r.document.path, null);
    assert.equal(locateNote("personal", address, s.context).path, null);
  }
});

// --- PATCH ---

test("PATCH: edits go through editNote, byte for byte, and the new version comes back", () => {
  const s = setup();
  const before = readFileSync(s.note("npm--pdfkit.md"), "utf8");
  const version = noteVersion(before);
  const edits = { sections: { "Avoid when": "- big files" }, fields: { rating: 3 }, accept_drafts: ["Use when"] };
  const r = patchNote({ journal: "personal", id: "pkg:npm/pdfkit", version, ...edits }, s.context);
  const expected = editNote(before, edits);
  assert.ok(expected.ok);
  assert.equal(r.outcome, "ok");
  assert.equal(readFileSync(s.note("npm--pdfkit.md"), "utf8"), expected.text);
  assert.equal(r.document.version, noteVersion(expected.text));
  assert.equal(r.document.frontmatter.rating, 3);
});

test("PATCH with an old version: conflict, the current version, nothing written", () => {
  const s = setup();
  const old = noteVersion(readFileSync(s.note("npm--pdfkit.md")));
  writeFileSync(s.note("npm--pdfkit.md"), PDFKIT.replace("Slow.", "Slow, edited in Obsidian."));
  const now = readFileSync(s.note("npm--pdfkit.md"), "utf8");
  const r = patchNote({ journal: "personal", id: "pkg:npm/pdfkit", version: old, fields: { rating: 5 } }, s.context);
  assert.equal(r.outcome, "conflict");
  assert.equal(r.document.version, noteVersion(now));
  assert.match(r.document.error ?? "", /changed/);
  assert.equal(readFileSync(s.note("npm--pdfkit.md"), "utf8"), now);
});

test("PATCH refusals write nothing", () => {
  const s = setup();
  const version = noteVersion(readFileSync(s.note("npm--pdfkit.md")));
  const cases: [Record<string, unknown>, string][] = [
    [{ journal: "personal", id: "pkg:npm/pdfkit", version, fields: { kind: "gadget" } }, "usage"],
    [{ journal: "personal", id: "pkg:npm/pdfkit", version, status: "inbox" }, "usage"],
    [{ journal: "personal", id: "pkg:npm/pdfkit", fields: { rating: 3 } }, "usage"],
    [{ journal: "elsewhere", id: "pkg:npm/pdfkit", version }, "usage"],
    [{ journal: "personal", version, fields: { rating: 3 } }, "usage"],
    [{ journal: "personal", id: "pkg:npm/nothing", version, fields: { rating: 3 } }, "not-found"],
    [{ journal: "personal", id: "../npm--pdfkit.md", version, fields: { rating: 3 } }, "not-found"],
  ];
  for (const [request, outcome] of cases) {
    const r = patchNote(request, s.context);
    assert.equal(r.outcome, outcome, JSON.stringify(request));
    assert.ok(r.document.error, JSON.stringify(request));
  }
  assert.equal(readFileSync(s.note("npm--pdfkit.md"), "utf8"), PDFKIT);
});

// --- Note preview ---

test("Note preview of a GitHub URL: the drafts magpie note would write, and nothing written", async () => {
  const s = setup();
  const url = "https://github.com/microsoft/playwright-cli";
  const fresh = join(s.base, "fresh-journal");
  const context = { ...s.context, env: { MAGPIE_HOME: fresh } };
  const r = await previewNote({ target: url, to: "personal" }, context);
  assert.equal(r.outcome, "ok");
  assert.deepEqual(readdirSync(s.base).includes("fresh-journal"), false);

  await runNote({ target: url, to: "personal" }, context);
  const written = readNote(readFileSync(join(fresh, "notes", "github--microsoft--playwright-cli.md"), "utf8"));
  const fm = written.frontmatter;
  assert.deepEqual(r.document, {
    id: "pkg:github/microsoft/playwright-cli",
    journal: "personal",
    path: join(fresh, "notes", "github--microsoft--playwright-cli.md"),
    exists: false,
    verdict: null,
    name: fm.name,
    url: fm.url,
    what_it_does: "CLI for common Playwright actions. Record and generate Playwright code, inspect selectors and take screenshots.",
    language: fm.language,
    license: fm.license,
    topics: fm.topics,
    kind: fm.kind,
    tags: fm.tags,
    packages: fm.packages,
    skills: [...(written.sections.find((section) => section.name === "Notable skills")?.body ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]),
    warnings: [],
  });
  assert.ok(r.document.skills.includes("playwright-cli"));
});

test("Note preview of an existing note says so, with its Verdict", async () => {
  const s = setup();
  const r = await previewNote({ target: "pkg:npm/pdfkit", to: "personal" }, s.context);
  assert.equal(r.outcome, "ok");
  assert.equal(r.document.exists, true);
  assert.equal(r.document.verdict, "avoid: async streams painful; use puppeteer");
  assert.equal(r.document.path, s.note("npm--pdfkit.md"));
  assert.equal(readFileSync(s.note("npm--pdfkit.md"), "utf8"), PDFKIT);
});

test("Note preview without metadata: registry name, null metadata fields", async () => {
  const s = setup();
  const r = await previewNote({ target: "pkg:npm/left-pad", to: "personal" }, s.context);
  assert.deepEqual(r.document, {
    id: "pkg:npm/left-pad", journal: "personal", path: s.note("npm--left-pad.md"), exists: false, verdict: null,
    name: "left-pad", url: "https://www.npmjs.com/package/left-pad", what_it_does: null, language: null, license: null,
    topics: [], kind: "other", tags: [], packages: [], skills: [], warnings: [],
  });
});

test("Note preview failures: unknown repository (failed), unsupported input and ambiguous names (usage)", async () => {
  const s = setup();
  const missing = await previewNote({ target: "https://github.com/nobody/nothing", to: "personal" }, s.context);
  assert.equal(missing.outcome, "failed");
  assert.ok(missing.document.error);
  for (const target of ["../../secret.md", "C:\\Windows\\win.ini", "/etc/passwd", "left-pad"]) {
    const r = await previewNote({ target, to: "personal" }, { ...s.context, cwd: s.base });
    assert.equal(r.outcome, "usage", target);
    assert.equal(r.document.path, null);
  }
});

test("Note preview offline: saved without metadata would be the answer, with a warning", async () => {
  const s = setup();
  const offline = { ...s.context, fetch: (() => Promise.reject(new TypeError("fetch failed"))) as Context["fetch"] };
  const r = await previewNote({ target: "https://github.com/microsoft/playwright-cli", to: "project" }, offline);
  assert.equal(r.outcome, "ok");
  assert.equal(r.document.journal, "project");
  assert.equal(r.document.language, null);
  assert.equal(r.document.warnings.length, 1);
});
