import { mock, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs, { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import { editNote, noteVersion } from "./edit.ts";
import { fakeFetch, recorded } from "./fixtures/fake-fetch.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import {
  addTags,
  createTagList,
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

test("Settings: the home directory, both journals with their paths, and whether a GitHub token is set", () => {
  const s = setup();
  assert.deepEqual(settingsDocument(s.context), {
    version: packageVersion(),
    home: s.context.home,
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

test("Tag list: the journal's tags.md, or the starter list for a journal not created yet; exists says whether tags.md is there", () => {
  const s = setup();
  assert.deepEqual(tagListDocument("personal", s.context), { outcome: "ok", document: { journal: "personal", tags: ["pdf", "testing"], exists: true } });
  assert.deepEqual(tagListDocument("project", s.context).document, { journal: "project", tags: [], exists: false });
  const fresh = join(s.base, "fresh");
  mkdirSync(join(fresh, ".git"), { recursive: true });
  assert.deepEqual(tagListDocument("project", { ...s.context, cwd: fresh }).document, { journal: "project", tags: parseTagList(STARTER_TAGS), exists: false });
});

// Only on the user's click in the app (spec §3, schema rule 5): magpie never adds it on its own to a
// journal that has notes.
test("createTagList writes the starter list to a journal without tags.md, and returns the Tag list", () => {
  const s = setup();
  const result = createTagList("project", s.context);
  assert.deepEqual(result, { outcome: "ok", document: { journal: "project", tags: parseTagList(STARTER_TAGS), exists: true } });
  assert.equal(readFileSync(join(s.project, ".magpie", "tags.md"), "utf8"), STARTER_TAGS);
});

test("createTagList never overwrites an existing tags.md; it returns that list", () => {
  const s = setup();
  assert.deepEqual(createTagList("personal", s.context), { outcome: "ok", document: { journal: "personal", tags: ["pdf", "testing"], exists: true } });
  assert.equal(readFileSync(join(s.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n");
});

test("createTagList without a project journal fails, as the Tag list does, and writes nothing", () => {
  const s = setup();
  const result = createTagList("project", { ...s.context, cwd: s.context.home });
  assert.equal(result.outcome, "failed");
  assert.deepEqual({ ...result.document, error: undefined }, { journal: "project", tags: [], exists: false, error: undefined });
  assert.deepEqual(readdirSync(s.context.home), []);
});

// Tags from GitHub topics (docs/ui.md §7): a click appends a tag the list doesn't have. An explicit
// human action (schema rule 5); the rest of tags.md stays byte for byte.
test("addTags appends the missing tags as list lines, in order, once; the rest of tags.md stays", () => {
  const s = setup();
  const result = addTags("personal", ["browser-automation", "pdf", "cli", "cli"], s.context);
  assert.deepEqual(result, { outcome: "ok", document: { journal: "personal", tags: ["pdf", "testing", "browser-automation", "cli"], exists: true } });
  assert.equal(readFileSync(join(s.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n- `browser-automation`\n- `cli`\n");
});

test("addTags keeps the file's line endings and closes an unfinished last line; tags already there write nothing", () => {
  const s = setup({ "journal/tags.md": "# Tags\r\n\r\n- `pdf` — documents\r\n- testing" });
  addTags("personal", ["cli"], s.context);
  assert.equal(readFileSync(join(s.journal, "tags.md"), "utf8"), "# Tags\r\n\r\n- `pdf` — documents\r\n- testing\r\n- `cli`\r\n");
  const before = readFileSync(join(s.journal, "tags.md"), "utf8");
  assert.equal(addTags("personal", ["pdf", "testing", "cli"], s.context).outcome, "ok");
  assert.deepEqual(addTags("personal", [], s.context).document.tags, ["pdf", "testing", "cli"]);
  assert.equal(readFileSync(join(s.journal, "tags.md"), "utf8"), before);
});

test("addTags: a journal without tags.md is not found; bad tags are refused; nothing is written", () => {
  const s = setup();
  const missing = addTags("project", ["cli"], s.context);
  assert.equal(missing.outcome, "not-found");
  assert.match(missing.document.error ?? "", /no tags\.md/);
  assert.equal(existsSync(join(s.project, ".magpie", "tags.md")), false);
  for (const bad of [["Not Kebab"], ["a--b"], [""], [1], "cli", null, ["ok", "BAD"]]) {
    const r = addTags("personal", bad as never, s.context);
    assert.equal(r.outcome, "usage", JSON.stringify(bad));
    assert.ok(r.document.error);
  }
  assert.equal(readFileSync(join(s.journal, "tags.md"), "utf8"), "- `pdf`\n- `testing`\n");
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

test("Note list cache: .cache/note-list.json; unchanged notes come from it, changed and new notes from disk", () => {
  const s = setup();
  const first = noteListDocument("personal", {}, s.context).document;
  const cacheFile = join(s.journal, ".cache", "note-list.json");
  const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as { version: number; files: Record<string, unknown>; data: Record<string, { name: string | null }> };
  assert.deepEqual(Object.keys(cache.data).sort(), first.notes.map((n) => n.file).sort());

  // A summary for an unchanged file is taken from the cache, not read again (the planted name shows it).
  cache.data["npm--pdfkit.md"] = { ...cache.data["npm--pdfkit.md"], name: "from the cache" };
  writeFileSync(cacheFile, JSON.stringify(cache));
  assert.equal(noteListDocument("personal", {}, s.context).document.notes.find((n) => n.file === "npm--pdfkit.md")?.name, "from the cache");

  // A changed file is read again; a new one is read; a deleted one is gone.
  writeFileSync(s.note("npm--pdfkit.md"), PDFKIT.replace("name: pdfkit", "name: pdfkit-renamed"));
  writeFileSync(s.note("npm--puppeteer.md"), PUPPETEER);
  rmSync(s.note("npm--broken.md"));
  const next = noteListDocument("personal", {}, s.context).document;
  assert.deepEqual(next.notes.map((n) => n.name), ["microsoft/playwright-cli", "pdfkit-renamed", "puppeteer"]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(cacheFile, "utf8")).data).sort(), ["github--microsoft--playwright-cli.md", "npm--pdfkit.md", "npm--puppeteer.md"]);

  // Without the cache, or with one that can't be read, the same document.
  writeFileSync(cacheFile, "{not json");
  assert.deepEqual(noteListDocument("personal", {}, s.context).document, next);
  rmSync(cacheFile);
  assert.deepEqual(noteListDocument("personal", {}, s.context).document, next);
});

test("Note list cache: a cached summary of the wrong shape is read again from its note, and the cache rewritten", () => {
  const s = setup();
  const expected = noteListDocument("personal", {}, s.context).document;
  const cacheFile = join(s.journal, ".cache", "note-list.json");
  const good = JSON.parse(readFileSync(cacheFile, "utf8")) as { version: number; files: unknown; data: Record<string, Record<string, unknown>> };
  const summary = good.data["npm--pdfkit.md"];
  for (const wrong of ["nonsense", 42, [], { ...summary, tags: "pdf" }, { ...summary, status: "done" }, { ...summary, tried: "yes" }, { ...summary, rating: "2" }, { ...summary, read_only: undefined }]) {
    writeFileSync(cacheFile, JSON.stringify({ ...good, data: { ...good.data, "npm--pdfkit.md": wrong } }));
    assert.deepEqual(noteListDocument("personal", {}, s.context).document, expected, JSON.stringify(wrong));
    assert.deepEqual(JSON.parse(readFileSync(cacheFile, "utf8")), good, `rewritten after ${JSON.stringify(wrong)}`);
  }
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
    links: [],
    backlinks: [],
    warnings: [],
  });
});

test("Note: links and backlinks from the journal's link index", () => {
  const s = setup({
    "journal/notes/github--microsoft--playwright-cli.md": `${PLAYWRIGHT}\n## Related\n- [[pdfkit|the PDF one]]\n- [[puppeteer]]\n`,
  });
  const playwright = noteDocument("personal", { id: "pkg:github/microsoft/playwright-cli" }, s.context).document;
  assert.deepEqual(playwright.links, [
    { target: "pdfkit", label: "the PDF one", id: "pkg:npm/pdfkit", name: "pdfkit", from: "Related" },
    // puppeteer has a note only in the project journal: no links across journals.
    { target: "puppeteer", label: null, id: null, name: null, reason: "missing", from: "Related" },
  ]);
  assert.deepEqual(playwright.backlinks, []);
  assert.deepEqual(noteDocument("personal", { id: "pkg:npm/pdfkit" }, s.context).document.backlinks, [
    { id: "pkg:github/microsoft/playwright-cli", name: "microsoft/playwright-cli", from: "Related" },
  ]);
});

test("Note: a note whose frontmatter can't be read is read-only, addressed by its file name", () => {
  const s = setup();
  const { outcome, document } = noteDocument("personal", { file: "npm--broken.md" }, s.context);
  assert.equal(outcome, "ok");
  assert.equal(document.id, null);
  assert.equal(document.read_only, true);
  assert.equal(document.warnings.length, 1);
  assert.deepEqual([document.links, document.backlinks], [[], []]);
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

// --- Finding a note by id ---

// 40 more notes, p0 … p39, so a scan of the journal shows in the count of files read.
const MANY = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`journal/notes/npm--p${i}.md`, PDFKIT.replace("id: pkg:npm/pdfkit", `id: pkg:npm/p${i}`).replace("name: pdfkit", `name: p${i}`)]));

// How many note files (in a notes/ folder) `run` reads.
function noteReads(t: TestContext, run: () => void): number {
  const reads = mock.method(fs, "readFileSync");
  syncBuiltinESMExports();
  t.after(() => {
    mock.restoreAll();
    syncBuiltinESMExports();
  });
  run();
  const count = reads.mock.calls.filter((call) => /[\\/]notes[\\/][^\\/]+\.md$/.test(String(call.arguments[0]))).length;
  mock.restoreAll();
  syncBuiltinESMExports();
  return count;
}

test("a note found by id, with warm caches, reads that note, not the whole journal: GET and PATCH", (t) => {
  const s = setup(MANY);
  assert.equal(noteDocument("personal", { id: "pkg:npm/p7" }, s.context).document.file, "npm--p7.md"); // builds the caches
  let version = "";
  const get = noteReads(t, () => {
    const r = noteDocument("personal", { id: "pkg:npm/p7" }, s.context);
    assert.equal(r.document.file, "npm--p7.md");
    version = r.document.version as string;
  });
  assert.ok(get <= 2, `GET read ${get} note files`);
  const patch = noteReads(t, () => {
    const r = patchNote({ journal: "personal", id: "pkg:npm/p7", version, fields: { rating: 4 } }, s.context);
    assert.equal(r.outcome, "ok");
    assert.equal(r.document.frontmatter.rating, 4);
  });
  assert.ok(patch <= 6, `PATCH read ${patch} note files`);
});

test("finding by id stays right when the cache is stale: a note added, renamed, or whose id changed", () => {
  const s = setup();
  const find = (id: string) => locateNote("personal", { id }, s.context).path;
  assert.equal(find("pkg:npm/pdfkit"), s.note("npm--pdfkit.md")); // the cache is written
  writeFileSync(s.note("npm--zod.md"), PDFKIT.replace("id: pkg:npm/pdfkit", "id: pkg:npm/zod"));
  assert.equal(find("pkg:npm/zod"), s.note("npm--zod.md"));
  renameSync(s.note("npm--pdfkit.md"), s.note("npm--pdfkit-old.md"));
  assert.equal(find("pkg:npm/pdfkit"), s.note("npm--pdfkit-old.md"));
  writeFileSync(s.note("npm--zod.md"), PDFKIT.replace("id: pkg:npm/pdfkit", "id: pkg:npm/zod-next"));
  assert.equal(find("pkg:npm/zod"), null);
  assert.equal(find("pkg:npm/zod-next"), s.note("npm--zod.md"));
});

test("a cache that names the wrong file for an id falls back to reading the notes", () => {
  const s = setup();
  const find = (id: string) => locateNote("personal", { id }, s.context).path;
  assert.equal(noteDocument("personal", { id: "pkg:npm/pdfkit" }, s.context).document.file, "npm--pdfkit.md"); // writes the link cache
  // The cache's signature still matches the notes, but its entry for pdfkit names another id, as
  // if the file had changed without its size or modification time changing.
  const cacheFile = join(dirname(s.note("npm--pdfkit.md")), "..", ".cache", "links.json");
  const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as { data: Record<string, { id: string }> };
  cache.data["npm--pdfkit.md"].id = "pkg:npm/ghost";
  writeFileSync(cacheFile, JSON.stringify(cache));
  assert.equal(find("pkg:npm/ghost"), null); // the hit is checked against the file
  assert.equal(find("pkg:npm/pdfkit"), s.note("npm--pdfkit.md")); // the miss reads the notes
  assert.equal(noteDocument("personal", { id: "pkg:npm/pdfkit" }, s.context).document.file, "npm--pdfkit.md");
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

test("PATCH: the answer's links follow the edit", () => {
  const s = setup();
  const version = noteVersion(readFileSync(s.note("npm--pdfkit.md")));
  const r = patchNote({ journal: "personal", id: "pkg:npm/pdfkit", version, sections: { Related: "- [[github--microsoft--playwright-cli]]" } }, s.context);
  assert.equal(r.outcome, "ok");
  assert.deepEqual(r.document.links, [
    { target: "github--microsoft--playwright-cli", label: null, id: "pkg:github/microsoft/playwright-cli", name: "microsoft/playwright-cli", from: "Related" },
  ]);
  assert.deepEqual(noteDocument("personal", { id: "pkg:github/microsoft/playwright-cli" }, s.context).document.backlinks, [
    { id: "pkg:npm/pdfkit", name: "pdfkit", from: "Related" },
  ]);
});

test("PATCH alternatives: written as quoted wikilinks; the relation shows on both notes; [] removes the key", () => {
  const s = setup();
  const before = readFileSync(s.note("npm--pdfkit.md"), "utf8");
  const set = patchNote({ journal: "personal", id: "pkg:npm/pdfkit", version: noteVersion(before), fields: { alternatives: ["github--microsoft--playwright-cli", "wkhtmltopdf"] } }, s.context);
  assert.equal(set.outcome, "ok");
  const written = readFileSync(s.note("npm--pdfkit.md"), "utf8");
  assert.equal(written, before.replace("status: reviewed\n", 'status: reviewed\nalternatives: ["[[github--microsoft--playwright-cli]]", "[[wkhtmltopdf]]"]\n'));
  assert.deepEqual(set.document.links.map((l) => [l.target, l.id, l.from]), [
    ["github--microsoft--playwright-cli", "pkg:github/microsoft/playwright-cli", "alternatives"],
    ["wkhtmltopdf", null, "alternatives"],
  ]);
  assert.deepEqual(noteDocument("personal", { id: "pkg:github/microsoft/playwright-cli" }, s.context).document.backlinks, [{ id: "pkg:npm/pdfkit", name: "pdfkit", from: "alternatives" }]);

  const cleared = patchNote({ journal: "personal", id: "pkg:npm/pdfkit", version: set.document.version, fields: { alternatives: [] } }, s.context);
  assert.equal(cleared.outcome, "ok");
  assert.equal(readFileSync(s.note("npm--pdfkit.md"), "utf8"), before);
  assert.deepEqual(noteDocument("personal", { id: "pkg:github/microsoft/playwright-cli" }, s.context).document.backlinks, []);
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
