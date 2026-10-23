import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { magpie, sandbox, type Box } from "../cli/fixtures/sandbox.ts";
import { runCatalog } from "./catalog.ts";
import { deleteCandidates, deleteNote, ignoreTrash, restoreNote } from "./delete.ts";
import { graphDocument, noteDocument, noteListDocument } from "./documents.ts";
import { noteVersion } from "./edit.ts";
import type { Place } from "./journals.ts";
import { runRecall } from "./recall.ts";
import { runSearch } from "./search.ts";
import { runSuggest } from "./suggest.ts";
import { renderNote, type NewNote } from "./write.ts";

// Deleting a note (decision 0037): the file moves to <journal>/.trash/; nothing reads the trash.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-23", kind: "library", tags: ["pdf"], ...n });
const PDFKIT = note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful" });
const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering", related: "- [[pdfkit]]" });
const JSPDF = `${note({ id: "pkg:npm/jspdf", verdict: "tiny API" }).replace("---\n\n", "alternatives: [\"[[npm--pdfkit]]\"]\n---\n\n")}`;
const NOW = new Date("2026-10-23T09:39:00.123Z");

function setup(files: Record<string, string | null> = {}) {
  const box = sandbox({
    "journal/notes/npm--pdfkit.md": PDFKIT,
    "journal/notes/npm--puppeteer.md": PUPPETEER,
    "journal/notes/npm--jspdf.md": JSPDF,
    "journal/notes/npm--broken.md": "---\nid: [pkg:npm/broken\n---\n\n## Verdict\n",
    ...files,
  });
  const place: Place = { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project };
  return { ...box, place, trash: (name: string) => join(box.journal, ".trash", name) };
}

function link(t: TestContext, target: string, path: string, type: "file" | "dir"): boolean {
  try {
    symlinkSync(target, path, type === "dir" && process.platform === "win32" ? "junction" : type);
    return true;
  } catch (error) {
    t.skip(`can't create a ${type} link here: ${(error as NodeJS.ErrnoException).code}`);
    return false;
  }
}

test("deleteNote moves the note to .trash/ with a UTC stamp, and reports the notes that point to it", () => {
  const s = setup();
  const before = readFileSync(s.note("npm--pdfkit.md"));
  const r = deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" } }, s.place, NOW);
  assert.equal(r.outcome, "ok");
  assert.deepEqual(r.document, {
    id: "pkg:npm/pdfkit",
    name: "pdfkit",
    journal: "personal",
    file: "npm--pdfkit.md",
    path: s.note("npm--pdfkit.md"),
    version: noteVersion(before),
    trash: s.trash("npm--pdfkit.20261023-093900Z.md"),
    deleted: true,
    backlinks: [
      { id: "pkg:npm/jspdf", name: "jspdf", from: "alternatives" },
      { id: "pkg:npm/puppeteer", name: "puppeteer", from: "Related" },
    ],
    warnings: [],
  });
  assert.ok(!existsSync(s.note("npm--pdfkit.md")));
  assert.deepEqual(readFileSync(s.trash("npm--pdfkit.20261023-093900Z.md")), before, "the file moves byte for byte");
  assert.equal(readFileSync(s.note("npm--puppeteer.md"), "utf8"), PUPPETEER, "the notes that link to it are never edited");
  assert.equal(readFileSync(s.note("npm--jspdf.md"), "utf8"), JSPDF);
  const links = noteDocument("personal", { id: "pkg:npm/puppeteer" }, s.place).document.links;
  assert.deepEqual(links.map((l) => [l.target, l.reason]), [["pdfkit", "missing"]], "its links become unresolved");
});

test("a dry run returns the same document and moves nothing", () => {
  const s = setup();
  const dry = deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" }, dryRun: true }, s.place, NOW);
  assert.equal(dry.outcome, "ok");
  assert.equal(dry.document.deleted, false);
  assert.equal(dry.document.trash, join(s.journal, ".trash"), "the folder: the stamp is the time of the move");
  assert.equal(dry.document.backlinks.length, 2);
  assert.ok(existsSync(s.note("npm--pdfkit.md")));
  assert.ok(!existsSync(join(s.journal, ".trash")), "not even the trash folder");
  const real = deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" }, version: dry.document.version ?? "" }, s.place, NOW);
  assert.deepEqual({ ...real.document, deleted: false, trash: join(s.journal, ".trash") }, dry.document);
  assert.equal(real.document.trash, s.trash("npm--pdfkit.20261023-093900Z.md"));
});

test("a read-only note is addressed by its file name; an id or file not in notes/ is not found", () => {
  const s = setup();
  const r = deleteNote({ journal: "personal", address: { file: "npm--broken.md" } }, s.place, NOW);
  assert.equal(r.outcome, "ok");
  assert.deepEqual([r.document.id, r.document.name, r.document.backlinks], [null, null, []]);
  assert.ok(existsSync(s.trash("npm--broken.20261023-093900Z.md")));
  for (const address of [{ id: "pkg:npm/nothing" }, { file: "../tags.md" }, { file: "npm--pdfkit" }, { file: join(s.journal, "notes", "npm--pdfkit.md") }, { file: "..\\notes\\npm--pdfkit.md" }]) {
    const missing = deleteNote({ journal: "personal", address }, s.place, NOW);
    assert.equal(missing.outcome, "not-found", JSON.stringify(address));
    assert.match(missing.document.error ?? "", /No note with that id or file name/);
  }
  assert.ok(existsSync(s.note("npm--pdfkit.md")));
});

test("a project journal: deleted there only; its .gitignore gets .trash/ when it predates the trash", () => {
  const s = setup({
    "project/.magpie/notes/npm--pdfkit.md": PDFKIT,
    "project/.magpie/.gitignore": ".cache/\r\nnode_modules",
  });
  const r = deleteNote({ journal: "project", address: { id: "pkg:npm/pdfkit" } }, s.place, NOW);
  assert.equal(r.outcome, "ok");
  assert.equal(r.document.journal, "project");
  assert.ok(existsSync(join(s.project, ".magpie", ".trash", "npm--pdfkit.20261023-093900Z.md")));
  assert.ok(existsSync(s.note("npm--pdfkit.md")), "the personal note stays");
  const ignore = join(s.project, ".magpie", ".gitignore");
  assert.equal(readFileSync(ignore, "utf8"), ".cache/\r\nnode_modules\r\n.trash/\r\n", "appended with the file's line endings");
  ignoreTrash(join(s.project, ".magpie"));
  assert.equal(readFileSync(ignore, "utf8"), ".cache/\r\nnode_modules\r\n.trash/\r\n", "once");
});

test("ignoreTrash: a missing .gitignore gets .cache/ and .trash/; a listed /.trash stays as it is", () => {
  const s = setup({ "a/": null, "b/.gitignore": "/.trash\n" });
  ignoreTrash(join(s.root, "a"));
  assert.equal(readFileSync(join(s.root, "a", ".gitignore"), "utf8"), ".cache/\n.trash/\n");
  ignoreTrash(join(s.root, "b"));
  assert.equal(readFileSync(join(s.root, "b", ".gitignore"), "utf8"), "/.trash\n");
});

test("a changed version is refused with the conflict, and nothing moves", () => {
  const s = setup();
  const old = noteVersion(readFileSync(s.note("npm--pdfkit.md")));
  writeFileSync(s.note("npm--pdfkit.md"), PDFKIT.replace("painful", "painful, edited"));
  const r = deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" }, version: old }, s.place, NOW);
  assert.equal(r.outcome, "conflict");
  assert.match(r.document.error ?? "", /changed on disk since you opened it/);
  assert.equal(r.document.version, noteVersion(readFileSync(s.note("npm--pdfkit.md"))));
  assert.ok(existsSync(s.note("npm--pdfkit.md")));
  assert.ok(!existsSync(join(s.journal, ".trash")));
});

test("two deletes of the same name in one second never collide", () => {
  const s = setup();
  assert.equal(deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" } }, s.place, NOW).outcome, "ok");
  writeFileSync(s.note("npm--pdfkit.md"), PDFKIT);
  const second = deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" } }, s.place, NOW);
  assert.equal(second.document.trash, s.trash("npm--pdfkit.20261023-093900Z-2.md"));
  assert.deepEqual(readdirSync(join(s.journal, ".trash")).sort(), ["npm--pdfkit.20261023-093900Z-2.md", "npm--pdfkit.20261023-093900Z.md"]);
});

test("a note that is a link is never found, and the file it points to stays", (t) => {
  const s = setup();
  const outside = join(s.root, "outside.md");
  writeFileSync(outside, note({ id: "pkg:npm/chalk", verdict: "colours" }));
  if (!link(t, outside, s.note("npm--chalk.md"), "file")) return;
  const r = deleteNote({ journal: "personal", address: { file: "npm--chalk.md" } }, s.place, NOW);
  assert.equal(r.outcome, "not-found");
  assert.ok(existsSync(outside));
  assert.ok(!existsSync(join(s.journal, ".trash")));
});

test(".trash/ that is a link is refused, in a dry run too, and nothing moves", (t) => {
  const s = setup({ "elsewhere/": null });
  if (!link(t, join(s.root, "elsewhere"), join(s.journal, ".trash"), "dir")) return;
  for (const dryRun of [true, false]) {
    const r = deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" }, dryRun }, s.place, NOW);
    assert.equal(r.outcome, "failed");
    assert.match(r.document.error ?? "", /Won't move .*npm--pdfkit\.md to the trash: .*\.trash is a link/);
  }
  assert.ok(existsSync(s.note("npm--pdfkit.md")));
  assert.deepEqual(readdirSync(join(s.root, "elsewhere")), []);
});

test("after a delete, search, recall, catalog, suggest, the note list and the graph no longer show it", () => {
  const s = setup();
  const reads = () => ({
    search: runSearch({ query: "pdfkit", tags: [], limit: 10 }, s.place).document.results.map((r) => r.id),
    recall: runRecall(["pdfkit"], "npm", s.place).document.matches.map((m) => m.id),
    catalog: runCatalog({ limit: 100, journal: "personal" }, s.place).document.notes.map((n) => n.id),
    suggest: runSuggest({ description: "pdf rendering async streams", limit: 20 }, s.place).document.candidates.map((c) => c.id),
    list: noteListDocument("personal", {}, s.place).document.notes.map((n) => n.file),
    graph: graphDocument("personal", { ghosts: false }, s.place).document.nodes.flatMap((n) => (n.type === "note" ? [n.file] : [])),
  });
  const warm = reads(); // builds every cache
  assert.ok(warm.search.includes("pkg:npm/pdfkit") && warm.recall.includes("pkg:npm/pdfkit") && warm.catalog.includes("pkg:npm/pdfkit"));
  assert.ok(warm.suggest.includes("pkg:npm/pdfkit") && warm.list.includes("npm--pdfkit.md") && warm.graph.includes("npm--pdfkit.md"));
  deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" } }, s.place, NOW);
  const after = reads();
  assert.ok(!after.search.includes("pkg:npm/pdfkit"));
  assert.deepEqual(after.recall, []);
  assert.ok(!after.catalog.includes("pkg:npm/pdfkit"));
  assert.ok(!after.suggest.includes("pkg:npm/pdfkit"));
  assert.ok(!after.list.includes("npm--pdfkit.md"));
  assert.ok(!after.graph.includes("npm--pdfkit.md"));
});

test("a file put in .trash/ by hand is never read as a note: search, recall, catalog, suggest, the hook, doctor, the graph", async () => {
  const box: Box = sandbox({
    "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }),
    "journal/.trash/npm--pdfkit.md": PDFKIT,
    "journal/.trash/npm--pdfkit.20261023-093900Z.md": PDFKIT,
  });
  const json = async (argv: string[]) => JSON.parse((await magpie(box, [...argv, "--json"])).out);
  assert.deepEqual((await json(["search", "pdfkit"])).results, []);
  assert.deepEqual((await json(["recall", "pdfkit", "--type", "npm"])).matches, []);
  assert.deepEqual((await json(["catalog", "--full"])).notes.map((n: { id: string }) => n.id), ["pkg:npm/chalk"]);
  assert.deepEqual((await json(["suggest", "pdf async streams"])).candidates.map((c: { id: string }) => c.id), ["pkg:npm/chalk"]);
  const hook = await magpie(box, ["hook", "claude-code"], {
    stdin: async () => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm i pdfkit" }, cwd: box.project }),
  });
  assert.deepEqual([hook.code, hook.out], [0, ""]);
  const doctor = await json(["doctor"]);
  assert.equal(doctor.journals.find((j: { scope: string }) => j.scope === "personal").notes, 1);
  const place: Place = { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project };
  assert.deepEqual(graphDocument("personal", { ghosts: true }, place).document.counts.notes, 1);
  assert.equal(noteListDocument("personal", {}, place).document.count, 1);
});

test("restoreNote moves the file back under its original name; a note there now keeps it in the trash", () => {
  const s = setup();
  const before = readFileSync(s.note("npm--pdfkit.md"));
  deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" } }, s.place, NOW);
  const r = restoreNote({ journal: "personal", trash: "npm--pdfkit.20261023-093900Z.md" }, s.place);
  assert.equal(r.outcome, "ok");
  assert.deepEqual(r.document, { journal: "personal", trash: s.trash("npm--pdfkit.20261023-093900Z.md"), path: s.note("npm--pdfkit.md"), id: "pkg:npm/pdfkit", name: "pdfkit", restored: true });
  assert.deepEqual(readFileSync(s.note("npm--pdfkit.md")), before);
  assert.deepEqual(runRecall(["pdfkit"], "npm", s.place).document.matches.map((m) => m.id), ["pkg:npm/pdfkit"], "back in recall");

  deleteNote({ journal: "personal", address: { id: "pkg:npm/pdfkit" } }, s.place, NOW);
  writeFileSync(s.note("npm--pdfkit.md"), note({ id: "pkg:npm/pdfkit", verdict: "a new note" }));
  const blocked = restoreNote({ journal: "personal", trash: "npm--pdfkit.20261023-093900Z.md" }, s.place);
  assert.equal(blocked.outcome, "failed");
  assert.match(blocked.document.error ?? "", /A note named npm--pdfkit\.md is in notes\/ now, so pdfkit stays in the trash/);
  assert.match(readFileSync(s.note("npm--pdfkit.md"), "utf8"), /a new note/);
  assert.ok(existsSync(s.trash("npm--pdfkit.20261023-093900Z.md")));
});

test("restoreNote takes only a stamped name from the trash's listing; nothing else moves", () => {
  const s = setup({ "journal/.trash/plain.md": PDFKIT, "journal/elsewhere.20261023-093900Z.md": PDFKIT });
  mkdirSync(join(s.journal, ".trash"), { recursive: true });
  for (const trash of ["plain.md", "../elsewhere.20261023-093900Z.md", "nothing.20261023-093900Z.md", join(s.journal, ".trash", "plain.md")]) {
    const r = restoreNote({ journal: "personal", trash }, s.place);
    assert.equal(r.outcome, "not-found", trash);
  }
  assert.ok(existsSync(join(s.journal, "elsewhere.20261023-093900Z.md")));
  assert.ok(!existsSync(s.note("plain.md")) && !existsSync(s.note("elsewhere.md")));
});

test("deleteCandidates: exact matches by name, PURL or URL, in both journals, project first; name-only matches apart", () => {
  const s = setup({
    "project/.magpie/notes/npm--pdfkit.md": PDFKIT,
    "journal/notes/github--foliojs--pdfkit-tools.md": note({ id: "pkg:github/foliojs/pdfkit-tools" }),
  });
  const pick = (r: ReturnType<typeof deleteCandidates>) => [r.candidates.map((c) => `${c.journal}:${c.file}`), r.nameOnly.map((c) => c.file)];
  assert.deepEqual(pick(deleteCandidates("pdfkit", undefined, s.place)), [["project:npm--pdfkit.md", "personal:npm--pdfkit.md"], []]);
  assert.deepEqual(pick(deleteCandidates("pkg:npm/pdfkit", "personal", s.place)), [["personal:npm--pdfkit.md"], []]);
  assert.deepEqual(pick(deleteCandidates("https://github.com/foliojs/pdfkit-tools", undefined, s.place)), [["personal:github--foliojs--pdfkit-tools.md"], []]);
  assert.deepEqual(pick(deleteCandidates("pdfkit-tools", undefined, s.place)), [[], ["github--foliojs--pdfkit-tools.md"]]);
  assert.deepEqual(pick(deleteCandidates("nothing", undefined, s.place)), [[], []]);
});
