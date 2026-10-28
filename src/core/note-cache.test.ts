import { mock, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs, { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { withJournal } from "../../scripts/bench-journal.ts";
import { removeFolder } from "./copy-folder.ts";
import { noteListDocument } from "./documents.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import { graphData } from "./graph.ts";
import { linkEntries } from "./links.ts";
import { forgetParsed, readCache, writeCache } from "./note-cache.ts";

// Writing a cache on Windows: another process (antivirus, the search indexer) may hold the file the
// cache replaces for a moment, and the rename fails with EPERM, EACCES or EBUSY. Faults are injected
// into fs.renameSync; writeCache imports it by name, so the built-in's exports are synced.

const realRename = fs.renameSync;

// renameSync fails `times` times with `code`, then renames; returns the attempts made.
function holdRename(t: TestContext, times: number, code = "EPERM"): { attempts: () => number } {
  let attempts = 0;
  mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    attempts++;
    if (attempts <= times) throw Object.assign(new Error(`${code}: operation not permitted, rename`), { code });
    realRename(from, to);
  });
  syncBuiltinESMExports();
  t.after(() => {
    mock.restoreAll();
    syncBuiltinESMExports();
  });
  return { attempts: () => attempts };
}

function journal(): string {
  const root = join(scratchBase("cache"), "journal");
  mkdirSync(join(root, "notes"), { recursive: true });
  writeFileSync(join(root, "notes", "npm--a.md"), `---\nid: "pkg:npm/a"\ntags: ["pdf"]\n---\n\n## Related\n[[npm--b]]\n`);
  writeFileSync(join(root, "notes", "npm--b.md"), `---\nid: "pkg:npm/b"\ntags: ["pdf"]\n---\n\n## Verdict\nfine\n`);
  return root;
}

const tmpFiles = (root: string) => (existsSync(join(root, ".cache")) ? readdirSync(join(root, ".cache")).filter((name) => name.endsWith(".tmp")) : []);

for (const code of ["EPERM", "EACCES", "EBUSY"]) {
  test(`writeCache: a rename held twice (${code}) is tried again, and the cache is written`, (t) => {
    const root = journal();
    const rename = holdRename(t, 2, code);
    const asked = fakeClock(1); // a busy machine's slow pauses can't use up the 50 ms
    writeCache(root, "x.json", 1, {}, { ok: true });
    // Three tries; more only if the real rename was held too (antivirus on the new file).
    assert.ok(rename.attempts() >= 3, `${rename.attempts()} tries`);
    assert.deepEqual(asked, [5, 10, 15, 20].slice(0, rename.attempts() - 1));
    assert.deepEqual(readCache(root, "x.json", 1, {}), { ok: true });
    assert.deepEqual(tmpFiles(root), []);
  });
}

// A clock that moves only when writeCache pauses: by the pause asked for, or rounded up to a timer
// tick, as Windows does (15.625 ms). Returns the pauses asked for.
function fakeClock(tick: number): number[] {
  let now = 0;
  const asked: number[] = [];
  mock.method(performance, "now", () => now);
  mock.method(Atomics, "wait", (_array: Int32Array, _index: number, _value: number, ms: number) => {
    asked.push(ms);
    now += Math.ceil(ms / tick) * tick;
    return "timed-out";
  });
  return asked;
}

for (const [tick, pauses] of [[1, [5, 10, 15, 20]], [15.625, [5, 10, 15]]] as const) {
  test(`writeCache: a rename that stays held is given up within 50 ms (timer tick ${tick} ms: pauses ${pauses.join(", ")}); no .tmp is left, no cache is written`, (t) => {
    const root = journal();
    const rename = holdRename(t, Infinity);
    const asked = fakeClock(tick);
    writeCache(root, "x.json", 1, {}, { ok: true });
    assert.deepEqual(asked, pauses);
    assert.equal(rename.attempts(), pauses.length + 1);
    assert.deepEqual(tmpFiles(root), []);
    assert.equal(existsSync(join(root, ".cache", "x.json")), false);
  });
}

test("writeCache: any other rename error is not tried again; no .tmp is left", (t) => {
  const root = journal();
  const rename = holdRename(t, Infinity, "EXDEV");
  writeCache(root, "x.json", 1, {}, { ok: true });
  assert.equal(rename.attempts(), 1);
  assert.deepEqual(tmpFiles(root), []);
});

test("a cache that can never be renamed into place: the reader still gets the right answer", (t) => {
  const expected = graphData(journal());
  const root = journal();
  holdRename(t, Infinity);
  assert.deepEqual(graphData(root), expected);
  assert.deepEqual(tmpFiles(root), []);
});

// The caches' cold builds share one parse per note (decision 0049). What they write and return is
// the same, byte for byte, as when each cache parses every note itself, as each did before: in the
// app's order (the note list, the link index, then the graph) and with the graph first.
const CACHES = ["note-list.json", "links.json", "graph.json"];

function build(root: string, journalPath: string, order: "list first" | "graph first", shared: boolean): string {
  const place = { home: join(root, "home"), env: { MAGPIE_HOME: journalPath }, cwd: root };
  const fresh = () => {
    if (!shared) forgetParsed();
  };
  removeFolder(join(journalPath, ".cache"));
  forgetParsed();
  let list: unknown, graph: unknown;
  if (order === "list first") {
    list = noteListDocument("personal", {}, place).document;
    fresh();
    linkEntries(journalPath);
    fresh();
    graph = graphData(journalPath, { ghosts: true });
  } else {
    if (!shared) linkEntries(journalPath); // so the graph's own entries are parsed apart from the links'
    fresh();
    graph = graphData(journalPath, { ghosts: true });
    fresh();
    list = noteListDocument("personal", {}, place).document;
  }
  return JSON.stringify({ list, graph }) + CACHES.map((name) => readFileSync(join(journalPath, ".cache", name), "utf8")).join("\n");
}

function sameAsParsedApart(root: string, journalPath: string, orders: ("list first" | "graph first")[]): void {
  for (const order of orders) assert.equal(build(root, journalPath, order, true), build(root, journalPath, order, false), order);
  forgetParsed();
}

// How many times a note file is read while `run` runs.
function noteReads(t: TestContext, run: () => void): number {
  const realRead = fs.readFileSync;
  let reads = 0;
  mock.method(fs, "readFileSync", (path: fs.PathOrFileDescriptor, options?: never) => {
    if (String(path).includes(`notes${join("/")}`) && String(path).endsWith(".md")) reads++;
    return realRead(path, options);
  });
  syncBuiltinESMExports();
  try {
    run();
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
  }
  t.diagnostic(`${reads} note reads`);
  return reads;
}

test("shared parse: the bench journal's caches are the same, byte for byte, as when parsed apart", async () => {
  await withJournal("shared-parse", (root, journalPath) => {
    mkdirSync(join(root, "home"));
    sameAsParsedApart(root, journalPath, ["list first"]);
  }, false, true, true);
});

test("shared parse: a hostile journal's caches are the same, byte for byte, as when parsed apart; each note is read once, not three times", (t) => {
  const root = scratchBase("shared-parse");
  const journalPath = join(root, "journal");
  const notes = join(journalPath, "notes");
  mkdirSync(notes, { recursive: true });
  mkdirSync(join(root, "home"));
  const [bom, bidi] = [String.fromCharCode(0xfeff), String.fromCharCode(0x202e)];
  const files: Record<string, string | Buffer> = {
    "npm--bom-crlf.md": `${bom}---\r\nid: pkg:npm/bom-crlf\r\nname: bom-crlf\r\ntags: [pdf]\r\n---\r\n\r\n## Related\r\n[[npm--self]]\r\n`,
    "npm--no-frontmatter.md": "just text, [[npm--bom-crlf]] and [[nowhere]]\n",
    "npm--broken-yaml.md": "---\nid: [unclosed\ntags: {\n---\n\n## Verdict\nx\n",
    "npm--unterminated.md": "---\nid: pkg:npm/unterminated\nname: unterminated\n\n## Verdict\nno end\n",
    "npm--latin1.md": Buffer.from("---\nid: pkg:npm/latin1\nname: caf\xe9\n---\n\n## Verdict\n\xff\xfe fine\n", "latin1"),
    "npm--empty.md": "",
    "npm--dup-a.md": "---\nid: pkg:npm/dup\nname: dup\ntags: [pdf]\n---\n",
    "npm--dup-b.md": "---\nid: pkg:npm/dup\nname: dup\n---\n\n## Related\n[[dup]]\n",
    "npm--bidi.md": `---\nid: pkg:npm/bidi\nname: "bi${bidi}di"\nstatus: reviewed\n---\n\n## Verdict\n<script>alert(1)</script> <!-- unterminated\n`,
    "npm--weird-fields.md": "---\nid: pkg:npm/weird\nname: 5\ntags: [1, a, a, null]\nalternatives: 5\nrating: x\ntried: yes\ndomains: [security, nonsense]\ntopics: {a: 1}\n---\n",
    "npm--self.md": "---\nid: pkg:npm/self\nname: self\nalternatives: ['[[npm--self]]', '[[dup]]', 3]\n---\n\n## Related\n[[npm--self]] [[nowhere|x]] [[npm--dup-a]]\n",
    "npm--oversized.md": `---\nid: pkg:npm/oversized\n---\n${"x".repeat(300 * 1024)}`,
  };
  for (const [file, text] of Object.entries(files)) writeFileSync(join(notes, file), text);
  mkdirSync(join(notes, "folder.md")); // not a file: never read
  try {
    symlinkSync(join(notes, "npm--self.md"), join(notes, "npm--link.md")); // a link: never followed
  } catch {
    // No symbolic links here (Windows without the privilege).
  }
  sameAsParsedApart(root, journalPath, ["list first", "graph first"]);
  const readable = Object.keys(files).length - 1; // all but the oversized note
  assert.equal(noteReads(t, () => build(root, journalPath, "list first", true)), readable);
  assert.equal(noteReads(t, () => build(root, journalPath, "list first", false)), 3 * readable);
});
