import { mock, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs, { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { graphData } from "./graph.ts";
import { readCache, writeCache } from "./note-cache.ts";

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
