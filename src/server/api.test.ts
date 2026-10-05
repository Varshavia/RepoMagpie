import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { magpie, sandbox, type Box } from "../cli/fixtures/sandbox.ts";
import { noteDocument, noteListDocument, settingsDocument, tagListDocument } from "../core/documents.ts";
import { noteVersion } from "../core/edit.ts";
import { fakeFetch, recorded } from "../core/fixtures/fake-fetch.ts";
import type { Fetch } from "../core/github.ts";
import type { Context } from "../core/save.ts";
import { client } from "./fixtures/http.ts";
import { startServer } from "./server.ts";

// Every endpoint of docs/ui.md §6. Responses are compared with the CLI's --json output for the same
// input (decision 0023), or with core's shared documents. Scratch journals only; recorded GitHub.

const PDFKIT = `---
id: pkg:npm/pdfkit
name: pdfkit
explored: 2026-10-03
kind: library
tags:
  - pdf
tried: true
rating:
status: reviewed
---

## Verdict
avoid: async streams painful; use puppeteer

## Avoid when
- streamed output for large PDFs

## What it does
<!-- magpie:draft -->
A PDF library.
`;
const LEFT_PAD = "---\nid: pkg:npm/left-pad\nname: left-pad\nexplored: 2026-10-03\nkind: library\ntags: []\ntried: false\nrating:\nstatus: inbox\n---\n\n## Verdict\n";

async function start(t: TestContext, options: { open?: (path: string) => Promise<void> } = {}) {
  const box = sandbox({
    "journal/notes/npm--pdfkit.md": PDFKIT,
    "journal/notes/npm--left-pad.md": LEFT_PAD,
    "journal/notes/npm--broken.md": "no frontmatter\n",
    "journal/tags.md": "- `pdf`\n- `testing`\n",
    "project/.magpie/notes/npm--pdfkit.md": PDFKIT.replace("avoid: async streams painful; use puppeteer", "fine for invoices"),
    "project/package.json": "{}",
  });
  const fetch = fakeFetch(recorded("microsoft--playwright-cli"));
  const context: Context = { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project, fetch, today: () => "2026-10-04" };
  const opened: string[] = [];
  const server = await startServer({ context, open: options.open ?? (async (path) => { opened.push(path); }), log: () => {} });
  t.after(() => server.close());
  return { box, context, fetch, http: client(server), opened };
}

// The CLI's --json document and exit code for the same input.
async function cli(box: Box, argv: string[], fetch: Fetch) {
  const r = await magpie(box, [...argv, "--json"], { fetch });
  return { code: r.code, document: JSON.parse(r.out) as unknown };
}

const parsed = (r: { status: number; body: string }) => ({ status: r.status, document: JSON.parse(r.body) as unknown });
const STATUS_FOR_EXIT: Record<number, number> = { 0: 200, 1: 422, 2: 400 };

test("GET /api/search returns exactly magpie search --json", async (t) => {
  const { box, fetch, http } = await start(t);
  const cases: [string, string[]][] = [
    ["q=pdf", ["search", "pdf"]],
    ["q=pdf&journal=personal", ["search", "pdf", "--journal", "personal"]],
    ["q=pdf&tag=pdf&kind=library&limit=1", ["search", "pdf", "--tag", "pdf", "--kind", "library", "--limit", "1"]],
    ["q=nothing-like-this", ["search", "nothing-like-this"]],
    ["q=", ["search", ""]],
  ];
  for (const [query, argv] of cases) {
    const expected = await cli(box, argv, fetch);
    assert.deepEqual(parsed(await http.get(`/api/search?${query}`)), { status: STATUS_FOR_EXIT[expected.code], document: expected.document }, query);
  }
  for (const query of ["q=pdf&kind=gadget", "q=pdf&limit=0", "q=pdf&limit=x", "q=pdf&journal=both"]) assert.equal((await http.get(`/api/search?${query}`)).status, 400, query);
});

test("GET /api/recall returns exactly magpie recall --json", async (t) => {
  const { box, fetch, http } = await start(t);
  const cases: [string, string[]][] = [
    ["package=pdfkit", ["recall", "pdfkit"]],
    ["package=pdfkit%401.2.0&package=left-pad&type=npm", ["recall", "pdfkit@1.2.0", "left-pad", "--type", "npm"]],
    ["package=nothing", ["recall", "nothing"]],
  ];
  for (const [query, argv] of cases) {
    const expected = await cli(box, argv, fetch);
    assert.deepEqual(parsed(await http.get(`/api/recall?${query}`)), { status: 200, document: expected.document }, query);
  }
  assert.equal((await http.get("/api/recall")).status, 400);
  assert.equal((await http.get("/api/recall?package=pdfkit&type=maven")).status, 400);
});

test("POST /api/note returns exactly magpie note --json and writes the same note", async (t) => {
  const { box, fetch, http } = await start(t);
  const cases: [Record<string, unknown>, string[], string | null][] = [
    [{ target: "pkg:npm/chalk", text: "fine", to: "personal" }, ["note", "pkg:npm/chalk", "fine"], "npm--chalk.md"],
    [{ target: "chalk", to: "personal" }, ["note", "chalk"], "npm--chalk.md"],
    [{ target: "https://github.com/microsoft/playwright-cli", text: "great for agents", to: "personal" }, ["note", "https://github.com/microsoft/playwright-cli", "great for agents"], "github--microsoft--playwright-cli.md"],
    [{ target: "pkg:npm/pdfkit", text: "second verdict", to: "personal" }, ["note", "pkg:npm/pdfkit", "second verdict"], null],
    [{ target: "https://example.com/an-article", to: "personal" }, ["note", "https://example.com/an-article"], null],
  ];
  for (const [body, argv, file] of cases) {
    const expected = await cli(box, argv, fetch);
    const written = file ? readFileSync(box.note(file), "utf8") : null;
    if (file) rmSync(box.note(file));
    assert.deepEqual(parsed(await http.write("POST", "/api/note", body)), { status: STATUS_FOR_EXIT[expected.code], document: expected.document }, JSON.stringify(body));
    if (file) {
      assert.equal(readFileSync(box.note(file), "utf8"), written);
      rmSync(box.note(file)); // the next case starts without it
    }
  }
  for (const body of [{ to: "personal" }, { target: "pkg:npm/x", to: "elsewhere" }, { target: "pkg:npm/x", type: "maven" }, { target: "pkg:npm/x", text: 3 }]) {
    assert.equal((await http.write("POST", "/api/note", body)).status, 400, JSON.stringify(body));
  }
});

test("POST /api/import returns exactly magpie import --json", async (t) => {
  const { box, fetch, http } = await start(t);
  const text = "- pkg:npm/chalk — verdict: fine | use: colours\n- https://example.com/x — verdict: no\n- pkg:npm/pdfkit — verdict: again\n";
  writeFileSync(join(box.root, "list.md"), text);
  const dry = await cli(box, ["import", join(box.root, "list.md"), "--dry-run"], fetch);
  assert.deepEqual(parsed(await http.write("POST", "/api/import", { text, to: "personal", dry_run: true })), { status: STATUS_FOR_EXIT[dry.code], document: dry.document });
  const real = await cli(box, ["import", join(box.root, "list.md")], fetch);
  const written = readFileSync(box.note("npm--chalk.md"), "utf8");
  rmSync(box.note("npm--chalk.md"));
  assert.deepEqual(parsed(await http.write("POST", "/api/import", { text, to: "personal" })), { status: 422, document: real.document });
  assert.equal(readFileSync(box.note("npm--chalk.md"), "utf8"), written);
  assert.deepEqual(parsed(await http.write("POST", "/api/import", { text: "nothing here", to: "project" })), { status: 200, document: { items: [], created: 0, updated: 0, failed: 0 } });
  for (const body of [{ to: "personal" }, { text: "", to: "x" }, { text: "", dry_run: "yes" }]) assert.equal((await http.write("POST", "/api/import", body)).status, 400);
});

test("POST /api/note/preview returns the Note preview document and writes nothing", async (t) => {
  const { http, box } = await start(t);
  const r = parsed(await http.write("POST", "/api/note/preview", { target: "pkg:npm/pdfkit", to: "personal" }));
  assert.equal(r.status, 200);
  assert.deepEqual({ ...(r.document as object) }, {
    id: "pkg:npm/pdfkit", journal: "personal", path: box.note("npm--pdfkit.md"), exists: true, verdict: "avoid: async streams painful; use puppeteer",
    name: "pdfkit", url: null, what_it_does: "A PDF library.", language: null, license: null, topics: [], kind: "library", tags: ["pdf"], packages: [], skills: [], warnings: [],
  });
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), PDFKIT);
  assert.equal((await http.write("POST", "/api/note/preview", { target: "https://github.com/nobody/nothing", to: "personal" })).status, 422);
  assert.equal((await http.write("POST", "/api/note/preview", { target: "not a name" })).status, 400);
});

test("GET /api/settings, /api/tags, /api/notes and /api/note return core's shared documents", async (t) => {
  const { http, context } = await start(t);
  assert.deepEqual(parsed(await http.get("/api/settings")), { status: 200, document: settingsDocument(context) });
  assert.deepEqual(parsed(await http.get("/api/tags?journal=personal")), { status: 200, document: tagListDocument("personal", context).document });
  assert.deepEqual(parsed(await http.get("/api/notes?journal=personal")), { status: 200, document: noteListDocument("personal", {}, context).document });
  assert.deepEqual(parsed(await http.get("/api/notes?journal=personal&status=inbox&tag=pdf")), { status: 200, document: noteListDocument("personal", { status: "inbox", tags: ["pdf"] }, context).document });
  assert.deepEqual(parsed(await http.get("/api/notes?journal=project&kind=library")), { status: 200, document: noteListDocument("project", { kind: "library" }, context).document });
  assert.deepEqual(parsed(await http.get("/api/note?journal=personal&id=pkg%3Anpm%2Fpdfkit")), { status: 200, document: noteDocument("personal", { id: "pkg:npm/pdfkit" }, context).document });
  const broken = parsed(await http.get("/api/note?journal=personal&file=npm--broken.md"));
  assert.deepEqual(broken, { status: 200, document: noteDocument("personal", { file: "npm--broken.md" }, context).document });
  assert.equal((broken.document as { read_only: boolean }).read_only, true);
  for (const path of ["/api/tags", "/api/notes", "/api/notes?journal=personal&status=done", "/api/notes?journal=personal&kind=gadget", "/api/note?journal=personal", "/api/note?journal=personal&id=a&file=b"]) {
    assert.equal((await http.get(path)).status, 400, path);
  }
  assert.equal((await http.get("/api/note?journal=personal&id=pkg%3Anpm%2Fnothing")).status, 404);
});

test("PATCH /api/note edits through core and returns the Note document; an old version gets 409", async (t) => {
  const { http, box } = await start(t);
  const version = noteVersion(PDFKIT);
  const edit = { journal: "personal", id: "pkg:npm/pdfkit", version, verdict: "fine for invoices", fields: { rating: 3 }, accept_drafts: ["What it does"] };
  const r = parsed(await http.write("PATCH", "/api/note", edit));
  assert.equal(r.status, 200);
  const after = readFileSync(box.note("npm--pdfkit.md"), "utf8");
  assert.equal(after, PDFKIT.replace("rating:\n", "rating: 3\n").replace("avoid: async streams painful; use puppeteer", "fine for invoices").replace("<!-- magpie:draft -->\n", ""));
  assert.equal((r.document as { version: string }).version, noteVersion(after));

  const stale = parsed(await http.write("PATCH", "/api/note", { ...edit, verdict: "something else" }));
  assert.equal(stale.status, 409);
  assert.equal((stale.document as { version: string }).version, noteVersion(after));
  assert.match((stale.document as { error: string }).error, /changed on disk/);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), after);

  const current = noteVersion(after);
  assert.equal((await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: current, fields: { name: "x" } })).status, 400);
  assert.equal((await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/nothing", version: current })).status, 404);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), after);
});

test("POST /api/open opens the note's file in the default editor", async (t) => {
  const { http, box, opened } = await start(t);
  assert.deepEqual(parsed(await http.write("POST", "/api/open", { journal: "personal", id: "pkg:npm/pdfkit" })), { status: 200, document: { opened: true, path: box.note("npm--pdfkit.md") } });
  assert.deepEqual(parsed(await http.write("POST", "/api/open", { journal: "personal", file: "npm--broken.md" })), { status: 200, document: { opened: true, path: box.note("npm--broken.md") } });
  assert.deepEqual(opened, [box.note("npm--pdfkit.md"), box.note("npm--broken.md")]);
  assert.equal((await http.write("POST", "/api/open", { journal: "personal", id: "pkg:npm/nothing" })).status, 404);
  assert.equal((await http.write("POST", "/api/open", { journal: "personal" })).status, 400);
});

test("POST /api/open says so when the editor can't be started", async (t) => {
  const { http, box } = await start(t, { open: () => Promise.reject(new Error("spawn xdg-open ENOENT")) });
  assert.deepEqual(parsed(await http.write("POST", "/api/open", { journal: "personal", id: "pkg:npm/pdfkit" })), {
    status: 422,
    document: { opened: false, path: box.note("npm--pdfkit.md"), error: "Couldn't open the note: spawn xdg-open ENOENT" },
  });
});
