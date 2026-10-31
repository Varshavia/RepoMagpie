import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { magpie, sandbox, type Box } from "../cli/fixtures/sandbox.ts";
import { removeFolder } from "../core/copy-folder.ts";
import { graphDocument, noteDocument, noteListDocument, settingsDocument, tagListDocument } from "../core/documents.ts";
import { noteVersion } from "../core/edit.ts";
import { STARTER_TAGS } from "../core/journals.ts";
import { fakeFetch, recorded } from "../core/fixtures/fake-fetch.ts";
import type { Fetch } from "../core/github.ts";
import type { Context, ImportJson } from "../core/save.ts";
import { PASTE } from "../core/fixtures/import-paste.ts";
import { addSectionItems } from "../core/write.ts";
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

async function start(t: TestContext, options: { open?: (path: string) => Promise<void>; assets?: string; fetch?: Fetch } = {}) {
  const box = sandbox({
    "journal/notes/npm--pdfkit.md": PDFKIT,
    "journal/notes/npm--left-pad.md": LEFT_PAD,
    "journal/notes/npm--broken.md": "no frontmatter\n",
    "journal/tags.md": "- `pdf`\n- `testing`\n",
    "project/.magpie/notes/npm--pdfkit.md": PDFKIT.replace("avoid: async streams painful; use puppeteer", "fine for invoices"),
    "project/package.json": "{}",
  });
  const fetch = options.fetch ?? fakeFetch(recorded("microsoft--playwright-cli"));
  const context: Context = { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project, fetch, today: () => "2026-10-04" };
  const opened: string[] = [];
  const server = await startServer({ context, open: options.open ?? (async (path) => { opened.push(path); }), log: () => {}, assets: options.assets });
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
    ["q=pdf&domain=api&domain=testing&tag=pdf&match=filter", ["search", "pdf", "--domain", "api", "--domain", "testing", "--tag", "pdf", "--match", "filter"]],
    ["q=pdf&domain=pdfs", ["search", "pdf", "--domain", "pdfs"]],
    ["q=nothing-like-this", ["search", "nothing-like-this"]],
    ["q=", ["search", ""]],
  ];
  for (const [query, argv] of cases) {
    const expected = await cli(box, argv, fetch);
    assert.deepEqual(parsed(await http.get(`/api/search?${query}`)), { status: STATUS_FOR_EXIT[expected.code], document: expected.document }, query);
  }
  for (const query of ["q=pdf&kind=gadget", "q=pdf&limit=0", "q=pdf&limit=x", "q=pdf&journal=both", "q=pdf&match=all"]) assert.equal((await http.get(`/api/search?${query}`)).status, 400, query);
});

// Every search answers with the recorded page of GitHub's search, whatever its query.
const [SEARCH] = Object.values(recorded("search"));
const searchFetch = (calls: string[] = [], delay = 0) =>
  fakeFetch({}, [], (path) => {
    if (!path.startsWith("/search/repositories?")) return undefined;
    calls.push(path);
    return new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(SEARCH), { status: 200 })), delay));
  });

test("GET /api/discover returns exactly repomagpie discover --json; the CLI's flags as the query", async (t) => {
  const fetch = searchFetch();
  const { box, http } = await start(t, { fetch });
  const cache = join(box.journal, ".cache", "discover.json");
  const fresh = () => existsSync(cache) && unlinkSync(cache); // each side searches, so neither reads the other's answer
  const cases: [string, string[]][] = [
    ["q=design+system", ["discover", "design system"]],
    ["q=ui&domain=styling&kind=library&topic=react&topic=css&language=TypeScript&min_stars=100&updated_within=6&include_archived=true&sort=forks&limit=5&page=2", ["discover", "ui", "--domain", "styling", "--kind", "library", "--topic", "react", "--topic", "css", "--language", "TypeScript", "--min-stars", "100", "--updated-within", "6", "--include-archived", "--sort", "forks", "--limit", "5", "--page", "2"]],
    ["q=", ["discover"]],
    ["q=x&page=100", ["discover", "x", "--page", "100"]],
  ];
  for (const [query, argv] of cases) {
    fresh();
    const expected = await cli(box, argv, fetch);
    fresh();
    assert.deepEqual(parsed(await http.get(`/api/discover?${query}`)), { status: STATUS_FOR_EXIT[expected.code], document: expected.document }, query);
  }
  for (const query of ["q=x&domain=web", "q=x&kind=tool", "q=x&limit=x", "q=x&min_stars=-1", "q=x&sort=name", "q=x&include_archived=yes", "q=x&limit=51"]) {
    assert.equal((await http.get(`/api/discover?${query}`)).status, 400, query);
  }
});

test("GET /api/discover: one search at a time; the second gets the first's answer from the cache", async (t) => {
  const calls: string[] = [];
  const { http } = await start(t, { fetch: searchFetch(calls, 50) });
  const [a, b] = await Promise.all([http.get("/api/discover?q=design+system"), http.get("/api/discover?q=design+system")]);
  assert.equal(calls.length, 1);
  assert.deepEqual([(JSON.parse(a.body) as { cached: boolean }).cached, (JSON.parse(b.body) as { cached: boolean }).cached].sort(), [false, true]);
  const offline = await start(t, { fetch: (async () => { throw new TypeError("fetch failed"); }) as Fetch });
  const failed = parsed(await offline.http.get("/api/discover?q=x"));
  assert.equal(failed.status, 422);
  assert.equal((failed.document as { problem: { kind: string } }).problem.kind, "offline");
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

test("GET /api/suggest returns exactly magpie suggest --json", async (t) => {
  const { box, fetch, http } = await start(t);
  writeFileSync(join(box.project, "package.json"), JSON.stringify({ description: "PDF invoices", dependencies: { pdfkit: "*" } }));
  const cases: [string, string[]][] = [
    ["", ["suggest"]],
    ["description=left%20pad%20strings", ["suggest", "left pad strings"]],
    ["description=pdf&journal=personal&limit=1", ["suggest", "pdf", "--journal", "personal", "--limit", "1"]],
    ["description=", ["suggest", ""]],
  ];
  for (const [query, argv] of cases) {
    const expected = await cli(box, argv, fetch);
    assert.deepEqual(parsed(await http.get(`/api/suggest?${query}`)), { status: STATUS_FOR_EXIT[expected.code], document: expected.document }, query);
  }
  // Both pdfkit notes have "Avoid when" text, so both are avoid notes (decision 0024); project first.
  const avoid = parsed(await http.get("/api/suggest")).document as { in_use_avoid: { id: string; journal: string }[] };
  assert.deepEqual(avoid.in_use_avoid.map((m) => `${m.journal} ${m.id}`), ["project pkg:npm/pdfkit", "personal pkg:npm/pdfkit"]);
  for (const query of ["limit=0", "limit=x", "journal=both"]) assert.equal((await http.get(`/api/suggest?${query}`)).status, 400, query);
});

test("POST /api/adopt returns exactly magpie adopt --json and writes the same note", async (t) => {
  const { box, fetch, http } = await start(t);
  const copy = join(box.project, ".magpie", "notes", "npm--left-pad.md");
  const expected = await cli(box, ["adopt", "pkg:npm/left-pad"], fetch);
  assert.equal(expected.code, 0);
  const written = readFileSync(copy, "utf8");
  removeFolder(copy);
  assert.deepEqual(parsed(await http.write("POST", "/api/adopt", { target: "pkg:npm/left-pad" })), { status: 200, document: expected.document });
  assert.equal(readFileSync(copy, "utf8"), written);
  assert.match(written, /\nadopted: 2026-10-04\n/);

  const cases: [Record<string, unknown>, string[]][] = [
    [{ target: "pkg:npm/left-pad" }, ["adopt", "pkg:npm/left-pad"]], // already in the project now
    [{ target: "pkg:npm/nothing" }, ["adopt", "pkg:npm/nothing"]],
    [{ target: "left-pad", type: "npm" }, ["adopt", "left-pad", "--type", "npm"]],
    [{ target: "https://example.com/an-article" }, ["adopt", "https://example.com/an-article"]],
  ];
  for (const [body, argv] of cases) {
    const cliResult = await cli(box, argv, fetch);
    assert.deepEqual(parsed(await http.write("POST", "/api/adopt", body)), { status: STATUS_FOR_EXIT[cliResult.code], document: cliResult.document }, JSON.stringify(body));
  }
  // The personal pdfkit note's Verdict says to avoid: copied, with no install command (spec §2).
  removeFolder(join(box.project, ".magpie", "notes", "npm--pdfkit.md"));
  const avoid = parsed(await http.write("POST", "/api/adopt", { target: "pkg:npm/pdfkit" }));
  assert.equal(avoid.status, 200);
  assert.deepEqual(avoid.document, { id: "pkg:npm/pdfkit", from: box.note("npm--pdfkit.md"), to: join(box.project, ".magpie", "notes", "npm--pdfkit.md"), install: null, install_choices: [] });

  for (const body of [{}, { target: 3 }, { target: "pkg:npm/x", type: "maven" }]) {
    const r = parsed(await http.write("POST", "/api/adopt", body));
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.deepEqual(Object.keys(r.document as object), ["id", "from", "to", "install", "install_choices", "error"], "the success shape plus error (spec §1)");
  }
});

test("POST /api/note returns exactly magpie note --json and writes the same note", async (t) => {
  const { box, fetch, http } = await start(t);
  const cases: [Record<string, unknown>, string[], string | null][] = [
    [{ target: "pkg:npm/chalk", text: "fine", to: "personal" }, ["note", "pkg:npm/chalk", "fine"], "npm--chalk.md"],
    [{ target: "chalk", to: "personal" }, ["note", "chalk"], "npm--chalk.md"],
    [{ target: "pkg:npm/chalk", to: "personal", use_when: ["colour in a CLI"], avoid_when: ["browser code"] }, ["note", "pkg:npm/chalk", "--use-when", "colour in a CLI", "--avoid-when", "browser code"], "npm--chalk.md"],
    [{ target: "https://github.com/microsoft/playwright-cli", text: "great for agents", to: "personal" }, ["note", "https://github.com/microsoft/playwright-cli", "great for agents"], "github--microsoft--playwright-cli.md"],
    [{ target: "https://github.com/microsoft/playwright-cli", to: "personal", domains: ["testing"] }, ["note", "https://github.com/microsoft/playwright-cli", "--domain", "testing"], "github--microsoft--playwright-cli.md"],
    [{ target: "pkg:npm/pdfkit", text: "second verdict", to: "personal" }, ["note", "pkg:npm/pdfkit", "second verdict"], null],
    [{ target: "https://example.com/an-article", to: "personal" }, ["note", "https://example.com/an-article"], null],
  ];
  const tagsMd = join(box.journal, "tags.md");
  const tagsBefore = readFileSync(tagsMd, "utf8");
  for (const [body, argv, file] of cases) {
    const expected = await cli(box, argv, fetch);
    const written = file ? readFileSync(box.note(file), "utf8") : null;
    const tagsWritten = readFileSync(tagsMd, "utf8");
    if (file) removeFolder(box.note(file));
    writeFileSync(tagsMd, tagsBefore);
    assert.deepEqual(parsed(await http.write("POST", "/api/note", body)), { status: STATUS_FOR_EXIT[expected.code], document: expected.document }, JSON.stringify(body));
    assert.equal(readFileSync(tagsMd, "utf8"), tagsWritten);
    if (file) {
      assert.equal(readFileSync(box.note(file), "utf8"), written);
      removeFolder(box.note(file)); // the next case starts without it
    }
    writeFileSync(tagsMd, tagsBefore);
  }
  for (const body of [{ to: "personal" }, { target: "pkg:npm/x", to: "elsewhere" }, { target: "pkg:npm/x", type: "maven" }, { target: "pkg:npm/x", text: 3 }, { target: "pkg:npm/x", tags: "pdf" }, { target: "pkg:npm/x", tags: ["Not A Tag"] }, { target: "pkg:npm/x", use_when: "one" }, { target: "pkg:npm/x", avoid_when: [3] }, { target: "pkg:npm/x", use_when: [" "] }, { target: "pkg:npm/x", use_when: ["x".repeat(501)] }, { target: "pkg:npm/x", domains: ["pdfs"] }, { target: "pkg:npm/x", domains: "api" }]) {
    assert.equal((await http.write("POST", "/api/note", body)).status, 400, JSON.stringify(body));
  }
});

// Decision 0030: Add's preview shows the tags the save will write; the user can remove one first.
test("POST /api/note with tags writes those tags for a new note, appending the new ones to tags.md; an existing note keeps its tags", async (t) => {
  const { box, http } = await start(t);
  const target = "https://github.com/microsoft/playwright-cli";
  const r = parsed(await http.write("POST", "/api/note", { target, to: "personal", tags: ["testing", "browsers"] }));
  assert.equal(r.status, 200);
  assert.deepEqual((r.document as { tags_md_added: string[] }).tags_md_added, ["browsers"]);
  const path = box.note("github--microsoft--playwright-cli.md");
  const before = readFileSync(path, "utf8");
  assert.match(before, /^tags: \[testing, browsers\]$/m);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n- `browsers`\n");

  const again = parsed(await http.write("POST", "/api/note", { target: "pkg:npm/pdfkit", to: "personal", tags: ["other"] }));
  assert.equal(again.status, 200);
  assert.match((again.document as { warnings: string[] }).warnings.join(" "), /already exists, so its tags were not changed/);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), PDFKIT);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n- `browsers`\n");
});

test("POST /api/tags/from-topics returns exactly magpie tags --from-topics --json, dry run and applied", async (t) => {
  const { box, fetch, http } = await start(t);
  const widget = "---\nid: pkg:github/acme/widget\nname: acme/widget\ntopics: [charts, pdf, widget]\nkind: other\ntags: []\ntried: false\nstatus: inbox\n---\n\n## Verdict\n";
  writeFileSync(box.note("github--acme--widget.md"), widget);
  const tagsBefore = readFileSync(join(box.journal, "tags.md"), "utf8");
  const dry = await cli(box, ["tags", "--from-topics", "--dry-run"], fetch);
  assert.deepEqual(parsed(await http.write("POST", "/api/tags/from-topics", { journal: "personal", dry_run: true })), { status: 200, document: dry.document });
  assert.equal(readFileSync(box.note("github--acme--widget.md"), "utf8"), widget);

  const real = await cli(box, ["tags", "--from-topics"], fetch);
  const written = readFileSync(box.note("github--acme--widget.md"), "utf8");
  const tagsWritten = readFileSync(join(box.journal, "tags.md"), "utf8");
  writeFileSync(box.note("github--acme--widget.md"), widget);
  writeFileSync(join(box.journal, "tags.md"), tagsBefore);
  assert.deepEqual(parsed(await http.write("POST", "/api/tags/from-topics", { journal: "personal", dry_run: false })), { status: 200, document: real.document });
  assert.deepEqual((real.document as { notes: { added: string[] }[] }).notes.map((n) => n.added), [["pdf", "charts"]]);
  assert.equal(readFileSync(box.note("github--acme--widget.md"), "utf8"), written);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), tagsWritten);

  for (const body of [{}, { journal: "elsewhere", dry_run: true }, { journal: "personal", dry_run: "yes" }, { journal: "personal" }]) {
    assert.equal((await http.write("POST", "/api/tags/from-topics", body)).status, 400, JSON.stringify(body));
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
  removeFolder(box.note("npm--chalk.md"));
  assert.deepEqual(parsed(await http.write("POST", "/api/import", { text, to: "personal" })), { status: 422, document: real.document });
  assert.equal(readFileSync(box.note("npm--chalk.md"), "utf8"), written);
  assert.deepEqual(parsed(await http.write("POST", "/api/import", { text: "nothing here", to: "project" })), { status: 200, document: { items: [], created: 0, updated: 0, failed: 0, tags_md_added: [], skipped: [{ line: 1, reason: "Not a URL or a package name." }] } });
  for (const body of [{ to: "personal" }, { text: "", to: "x" }, { text: "", dry_run: "yes" }]) assert.equal((await http.write("POST", "/api/import", body)).status, 400);
});

test("POST /api/import reads a pasted list as magpie import does: the same items and skipped lines", async (t) => {
  const { box, fetch, http } = await start(t);
  writeFileSync(join(box.root, "paste.md"), PASTE);
  const dry = await cli(box, ["import", join(box.root, "paste.md"), "--dry-run"], fetch);
  const api = parsed(await http.write("POST", "/api/import", { text: PASTE, to: "personal", dry_run: true }));
  assert.deepEqual(api, { status: STATUS_FOR_EXIT[dry.code], document: dry.document });
  const doc = dry.document as ImportJson;
  assert.deepEqual(doc.items.map((i) => i.line), [3, 4, 5, 7, 10]);
  assert.deepEqual(doc.skipped.map((s) => s.line), [6, 8, 11]);
});

test("POST /api/note/preview returns the Note preview document and writes nothing", async (t) => {
  const { http, box } = await start(t);
  const r = parsed(await http.write("POST", "/api/note/preview", { target: "pkg:npm/pdfkit", to: "personal" }));
  assert.equal(r.status, 200);
  assert.deepEqual({ ...(r.document as object) }, {
    id: "pkg:npm/pdfkit", journal: "personal", path: box.note("npm--pdfkit.md"), exists: true, verdict: "avoid: async streams painful; use puppeteer",
    name: "pdfkit", url: null, what_it_does: "A PDF library.", language: null, license: null, topics: [], topic_tags: [], kind: "library", tags: ["pdf"], packages: [], skills: [], warnings: [],
  });
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), PDFKIT);
  // A GitHub repository: the tags its save would write, and every topic that could become a tag, ranked.
  const github = parsed(await http.write("POST", "/api/note/preview", { target: "https://github.com/microsoft/playwright-cli", to: "personal" }));
  assert.equal(github.status, 200);
  const doc = github.document as { exists: boolean; tags: string[]; topic_tags: string[] };
  assert.deepEqual([doc.exists, doc.tags, doc.topic_tags], [false, ["playwright"], ["playwright"]]);
  assert.equal(existsSync(box.note("github--microsoft--playwright-cli.md")), false);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n");
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
  assert.deepEqual(parsed(await http.get("/api/notes?journal=personal&domain=api")), { status: 200, document: noteListDocument("personal", { domain: "api" }, context).document });
  assert.equal((await http.get("/api/notes?journal=personal&domain=pdfs")).status, 400);
  assert.deepEqual(parsed(await http.get("/api/note?journal=personal&id=pkg%3Anpm%2Fpdfkit")), { status: 200, document: noteDocument("personal", { id: "pkg:npm/pdfkit" }, context).document });
  const broken = parsed(await http.get("/api/note?journal=personal&file=npm--broken.md"));
  assert.deepEqual(broken, { status: 200, document: noteDocument("personal", { file: "npm--broken.md" }, context).document });
  assert.equal((broken.document as { read_only: boolean }).read_only, true);
  for (const path of ["/api/tags", "/api/notes", "/api/notes?journal=personal&status=done", "/api/notes?journal=personal&kind=gadget", "/api/note?journal=personal", "/api/note?journal=personal&id=a&file=b"]) {
    assert.equal((await http.get(path)).status, 400, path);
  }
  assert.equal((await http.get("/api/note?journal=personal&id=pkg%3Anpm%2Fnothing")).status, 404);
});

test("GET /api/graph returns the Graph document: core's graph of one journal, missing notes with ghosts=1", async (t) => {
  const { http, box, context } = await start(t);
  writeFileSync(box.note("npm--left-pad.md"), `${LEFT_PAD}\n## Related\n- [[pdfkit]]\n- [[puppeteer]]\n`);
  for (const [path, journal, ghosts] of [
    ["/api/graph?journal=personal", "personal", false],
    ["/api/graph?journal=personal&ghosts=0", "personal", false],
    ["/api/graph?journal=personal&ghosts=1", "personal", true],
    ["/api/graph?journal=project", "project", false],
  ] as const) {
    assert.deepEqual(parsed(await http.get(path)), { status: 200, document: graphDocument(journal, { ghosts }, context).document }, path);
  }
  const graph = parsed(await http.get("/api/graph?journal=personal&ghosts=1")).document as { journal: string; nodes: { key: string }[]; edges: { type: string; source: string; target: string }[]; counts: unknown };
  assert.equal(graph.journal, "personal");
  assert.deepEqual(graph.nodes.map((n) => n.key), ["note:npm--left-pad.md", "note:npm--pdfkit.md", "tag:pdf", "ghost:puppeteer"]);
  assert.deepEqual(graph.edges.filter((e) => e.type === "link").map((e) => `${e.source} ${e.target}`), ["note:npm--left-pad.md ghost:puppeteer", "note:npm--left-pad.md note:npm--pdfkit.md"]);
  assert.deepEqual(graph.counts, { notes: 2, tags: 1, edges_by_type: { tagged: 1, link: 2, alternative: 0, similar: 0 } });

  const empty = { journal: null, nodes: [], edges: [], counts: { notes: 0, tags: 0, edges_by_type: { tagged: 0, link: 0, alternative: 0, similar: 0 } } };
  for (const [path, error] of [
    ["/api/graph", "journal must be personal or project."],
    ["/api/graph?journal=work", "journal must be personal or project."],
    ["/api/graph?journal=personal&ghosts=yes", "ghosts must be 1 or 0."],
    ["/api/graph?journal=personal&ghosts=", "ghosts must be 1 or 0."],
  ]) {
    const r = parsed(await http.get(path));
    assert.equal(r.status, 400, path);
    assert.deepEqual(r.document, { ...empty, journal: path.includes("personal") ? "personal" : null, error }, path);
  }
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
  const items = parsed(await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: current, add_items: { "Avoid when": ["big PDFs"] } }));
  assert.equal(items.status, 200);
  const withItems = readFileSync(box.note("npm--pdfkit.md"), "utf8");
  assert.equal(withItems, addSectionItems(after, "Avoid when", ["big PDFs"]).text);
  assert.equal((await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: noteVersion(withItems), add_items: { "My notes": ["x"] } })).status, 400);
  writeFileSync(box.note("npm--pdfkit.md"), after);
  const domains = parsed(await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: current, domains: { confirm: ["api"] } }));
  assert.equal(domains.status, 200);
  assert.deepEqual((domains.document as { frontmatter: { domains: string[] } }).frontmatter.domains, ["api"]);
  // A suggestion dismissed, then restored with the version the dismiss returned; an old version gets 409.
  const suggested = after.replace("tried: true\n", "domains_suggested: [api, testing]\ntried: true\n");
  assert.notEqual(suggested, after);
  writeFileSync(box.note("npm--pdfkit.md"), suggested);
  const dismissed = parsed(await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: noteVersion(suggested), domains: { dismiss: ["api"] } }));
  assert.equal(dismissed.status, 200);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), suggested.replace("[api, testing]", "[testing]"));
  assert.equal((await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: noteVersion(suggested), domains: { restore: { domain: "api", at: 0 } } })).status, 409);
  const restored = parsed(await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: (dismissed.document as { version: string }).version, domains: { restore: { domain: "api", at: 0 } } }));
  assert.equal(restored.status, 200);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), suggested);
  writeFileSync(box.note("npm--pdfkit.md"), after);
  assert.equal((await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: current, domains: { confirm: ["pdfs"] } })).status, 400);
  assert.equal((await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: current, fields: { name: "x" } })).status, 400);
  assert.equal((await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/nothing", version: current })).status, 404);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), after);
});

test("POST /api/note/delete: a dry run moves nothing; then the note moves to the trash, as magpie delete --json does", async (t) => {
  const { http, box, fetch } = await start(t);
  const version = noteVersion(PDFKIT);
  const request = { journal: "personal", id: "pkg:npm/pdfkit", version };
  const dry = parsed(await http.write("POST", "/api/note/delete", { ...request, dry_run: true }));
  assert.equal(dry.status, 200);
  assert.equal((dry.document as { deleted: boolean }).deleted, false);
  assert.equal((dry.document as { trash: string }).trash, join(box.journal, ".trash"), "the folder: the stamp is the time of the move");
  assert.ok(existsSync(box.note("npm--pdfkit.md")));

  const done = parsed(await http.write("POST", "/api/note/delete", request));
  assert.equal(done.status, 200);
  const document = done.document as { deleted: boolean; trash: string };
  assert.equal(document.deleted, true);
  assert.ok(existsSync(document.trash) && !existsSync(box.note("npm--pdfkit.md")));
  assert.deepEqual({ ...(dry.document as object), deleted: true, trash: document.trash }, document);
  assert.match(document.trash, /[\\/]\.trash[\\/]npm--pdfkit\.\d{8}-\d{6}Z\.md$/);
  assert.equal((await http.get("/api/note?journal=personal&id=pkg%3Anpm%2Fpdfkit")).status, 404);

  // The CLI's document for the same note, once it is back.
  writeFileSync(box.note("npm--pdfkit.md"), PDFKIT);
  const expected = await cli(box, ["delete", "pkg:npm/pdfkit", "--journal", "personal", "--yes"], fetch);
  const stamp = (d: unknown) => JSON.stringify(d).replace(/\.\d{8}-\d{6}Z(-\d+)?\.md/g, ".<stamp>.md");
  assert.equal(stamp(expected.document), stamp(document));
});

test("POST /api/note/delete: an old version gets 409 and nothing moves; bad requests 400; a read-only note by file", async (t) => {
  const { http, box } = await start(t);
  const stale = parsed(await http.write("POST", "/api/note/delete", { journal: "personal", id: "pkg:npm/pdfkit", version: "sha256:0" }));
  assert.equal(stale.status, 409);
  assert.match((stale.document as { error: string }).error, /changed on disk/);
  assert.ok(existsSync(box.note("npm--pdfkit.md")));
  for (const body of [
    { journal: "both", id: "pkg:npm/pdfkit", version: "x" },
    { journal: "personal", id: "pkg:npm/pdfkit" },
    { journal: "personal", id: "pkg:npm/pdfkit", file: "npm--pdfkit.md", version: "x" },
    { journal: "personal", version: "x" },
    { journal: "personal", id: "pkg:npm/pdfkit", version: "x", dry_run: "yes" },
  ]) assert.equal((await http.write("POST", "/api/note/delete", body)).status, 400, JSON.stringify(body));
  assert.equal((await http.write("POST", "/api/note/delete", { journal: "personal", id: "pkg:npm/nothing", version: "x" })).status, 404);
  const broken = parsed(await http.write("POST", "/api/note/delete", { journal: "personal", file: "npm--broken.md", version: noteVersion("no frontmatter\n") }));
  assert.equal(broken.status, 200);
  assert.ok(!existsSync(box.note("npm--broken.md")));
  assert.ok(existsSync(box.note("npm--pdfkit.md")));
});

test("POST /api/note/restore puts the file back; 422 when a note has its name now, 404 for a name not in the trash", async (t) => {
  const { http, box } = await start(t);
  const deleted = parsed(await http.write("POST", "/api/note/delete", { journal: "personal", id: "pkg:npm/pdfkit", version: noteVersion(PDFKIT) })).document as { trash: string };
  const trash = deleted.trash.split(/[\\/]/).pop();
  const restored = parsed(await http.write("POST", "/api/note/restore", { journal: "personal", trash }));
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.document, { journal: "personal", trash: deleted.trash, path: box.note("npm--pdfkit.md"), id: "pkg:npm/pdfkit", name: "pdfkit", restored: true });
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), PDFKIT);
  assert.equal((await http.write("POST", "/api/note/restore", { journal: "personal", trash })).status, 404);

  const again = parsed(await http.write("POST", "/api/note/delete", { journal: "personal", id: "pkg:npm/pdfkit", version: noteVersion(PDFKIT) })).document as { trash: string };
  writeFileSync(box.note("npm--pdfkit.md"), LEFT_PAD.replace("left-pad", "pdfkit"));
  const blocked = parsed(await http.write("POST", "/api/note/restore", { journal: "personal", trash: again.trash.split(/[\\/]/).pop() }));
  assert.equal(blocked.status, 422);
  assert.match((blocked.document as { error: string }).error, /stays in the trash/);
  assert.ok(existsSync(again.trash));
  for (const body of [{ journal: "personal" }, { journal: "both", trash }, { journal: "personal", trash: 1 }]) {
    assert.equal((await http.write("POST", "/api/note/restore", body)).status, 400, JSON.stringify(body));
  }
});

test("POST /api/open opens the note's file in the default editor", async (t) => {
  const { http, box, opened } = await start(t);
  assert.deepEqual(parsed(await http.write("POST", "/api/open", { journal: "personal", id: "pkg:npm/pdfkit" })), { status: 200, document: { opened: true, path: box.note("npm--pdfkit.md") } });
  assert.deepEqual(parsed(await http.write("POST", "/api/open", { journal: "personal", file: "npm--broken.md" })), { status: 200, document: { opened: true, path: box.note("npm--broken.md") } });
  assert.deepEqual(opened, [box.note("npm--pdfkit.md"), box.note("npm--broken.md")]);
  assert.equal((await http.write("POST", "/api/open", { journal: "personal", id: "pkg:npm/nothing" })).status, 404);
  assert.equal((await http.write("POST", "/api/open", { journal: "personal" })).status, 400);
});

test("POST /api/open with tag_list opens the journal's tags.md", async (t) => {
  const { http, box, opened } = await start(t);
  assert.deepEqual(parsed(await http.write("POST", "/api/open", { journal: "personal", tag_list: true })), { status: 200, document: { opened: true, path: join(box.journal, "tags.md") } });
  assert.deepEqual(opened, [join(box.journal, "tags.md")]);
  // The project journal in this sandbox has no tags.md.
  assert.deepEqual(parsed(await http.write("POST", "/api/open", { journal: "project", tag_list: true })), {
    status: 404,
    document: { opened: false, path: null, error: "This journal has no tags.md yet." },
  });
  for (const body of [{ journal: "personal", tag_list: true, id: "pkg:npm/pdfkit" }, { journal: "personal", tag_list: "yes" }, { journal: "personal", tag_list: true, file: "../x" }]) {
    assert.equal((await http.write("POST", "/api/open", body)).status, 400, JSON.stringify(body));
  }
  assert.equal(opened.length, 1);
});

test("POST /api/tags writes the starter list to a journal without tags.md; never over an existing one", async (t) => {
  const { http, box, context } = await start(t);
  const created = parsed(await http.write("POST", "/api/tags", { journal: "project" }));
  assert.deepEqual(created, { status: 200, document: tagListDocument("project", context).document });
  assert.equal((created.document as { exists: boolean }).exists, true);
  assert.equal(readFileSync(join(box.project, ".magpie", "tags.md"), "utf8"), STARTER_TAGS);
  const kept = parsed(await http.write("POST", "/api/tags", { journal: "personal" }));
  assert.deepEqual(kept.document, { journal: "personal", tags: ["pdf", "testing"], exists: true });
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n");
  assert.equal((await http.write("POST", "/api/tags", { journal: "elsewhere" })).status, 400);
});

test("POST /api/tags with add appends missing tags to tags.md and returns the Tag list; 404 without tags.md; 400 for a bad tag", async (t) => {
  const { http, box } = await start(t);
  const added = parsed(await http.write("POST", "/api/tags", { journal: "personal", add: ["cli", "pdf"] }));
  assert.deepEqual(added, { status: 200, document: { journal: "personal", tags: ["pdf", "testing", "cli"], exists: true } });
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n- `cli`\n");
  const missing = await http.write("POST", "/api/tags", { journal: "project", add: ["cli"] });
  assert.equal(missing.status, 404);
  assert.equal(existsSync(join(box.project, ".magpie", "tags.md")), false);
  for (const add of [["Not Kebab"], "cli", [3]]) assert.equal((await http.write("POST", "/api/tags", { journal: "personal", add })).status, 400, JSON.stringify(add));
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n- `cli`\n");
});

test("POST /api/open says so when the editor can't be started", async (t) => {
  const { http, box } = await start(t, { open: () => Promise.reject(new Error("spawn xdg-open ENOENT")) });
  assert.deepEqual(parsed(await http.write("POST", "/api/open", { journal: "personal", id: "pkg:npm/pdfkit" })), {
    status: 422,
    document: { opened: false, path: box.note("npm--pdfkit.md"), error: "Couldn't open the note: spawn xdg-open ENOENT" },
  });
});

test("without a built app, the page says how to build it, and the API still works", async (t) => {
  const { http } = await start(t, { assets: fileURLToPath(new URL("./fixtures/no-such-folder/", import.meta.url)) });
  assert.deepEqual(parsed(await http.get("/")), { status: 404, document: { error: "The app isn't built. Run npm run build, then start repomagpie ui again." } });
  assert.equal((await http.get("/assets/index.js")).status, 404);
  assert.equal((await http.get("/api/notes?journal=personal")).status, 200);
});
