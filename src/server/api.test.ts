import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { magpie, sandbox, type Box } from "../cli/fixtures/sandbox.ts";
import { graphDocument, noteDocument, noteListDocument, settingsDocument, tagListDocument } from "../core/documents.ts";
import { noteVersion } from "../core/edit.ts";
import { STARTER_TAGS } from "../core/journals.ts";
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

async function start(t: TestContext, options: { open?: (path: string) => Promise<void>; assets?: string } = {}) {
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
  rmSync(copy);
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
  rmSync(join(box.project, ".magpie", "notes", "npm--pdfkit.md"));
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
  assert.deepEqual(parsed(await http.get("/")), { status: 404, document: { error: "The app isn't built. Run npm run build, then start magpie ui again." } });
  assert.equal((await http.get("/assets/index.js")).status, 404);
  assert.equal((await http.get("/api/notes?journal=personal")).status, 200);
});
