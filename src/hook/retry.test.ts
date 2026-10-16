import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { RETRY_WINDOW, retryDecision, retryFile, retryKey } from "./retry.ts";

// The retry record (decision 0036): a deny is recorded, and the same install goes through until
// 10 minutes after it. When the record can't be read or written, the answer is "unavailable", and
// the adapter informs instead of denying.

const T0 = Date.UTC(2026, 9, 16, 10, 0, 0);
const MINUTE = 60_000;
const PDFKIT = [{ type: "npm", name: "pdfkit" }];

function journal(): string {
  const path = join(scratchBase("retry"), "journal");
  mkdirSync(path);
  return path;
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

test("the first try is denied and recorded; the same install goes through until 10 minutes after the deny, then is denied again", () => {
  const j = journal();
  const key = retryKey("codex", "/work/app", PDFKIT);
  assert.equal(retryDecision(j, key, T0), "deny");
  assert.equal(retryDecision(j, key, T0 + 1), "pass");
  assert.equal(retryDecision(j, key, T0 + 9 * MINUTE), "pass"); // a pass neither removes nor renews the entry
  assert.equal(retryDecision(j, key, T0 + RETRY_WINDOW - 1), "pass");
  assert.equal(retryDecision(j, key, T0 + RETRY_WINDOW), "deny");
  assert.equal(retryDecision(j, key, T0 + RETRY_WINDOW + MINUTE), "pass");
});

test("the key: the same install however the command wrote it; another folder, agent or package is another install", () => {
  const key = retryKey("codex", "/work/app", [{ type: "npm", name: "pdfkit" }, { type: "npm", name: "chalk" }]);
  assert.equal(retryKey("codex", "/work/app", [{ type: "npm", name: "chalk" }, { type: "npm", name: "pdfkit" }, { type: "npm", name: "chalk" }]), key);
  assert.match(key, /^[0-9a-f]{64}$/);
  for (const other of [
    retryKey("codex", "/work/other", [{ type: "npm", name: "pdfkit" }, { type: "npm", name: "chalk" }]),
    retryKey("cursor", "/work/app", [{ type: "npm", name: "pdfkit" }, { type: "npm", name: "chalk" }]),
    retryKey("codex", "/work/app", [{ type: "npm", name: "pdfkit" }]),
    retryKey("codex", "/work/app", [{ type: "pypi", name: "pdfkit" }, { type: "npm", name: "chalk" }]),
  ]) assert.notEqual(other, key);
});

test("a different folder or a changed install is denied on its own first try", () => {
  const j = journal();
  assert.equal(retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0), "deny");
  assert.equal(retryDecision(j, retryKey("codex", "/work/other", PDFKIT), T0 + 1), "deny");
  assert.equal(retryDecision(j, retryKey("codex", "/work/app", [{ type: "npm", name: "jspdf" }]), T0 + 2), "deny");
  assert.equal(retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0 + 3), "pass");
});

test("two agents at once: each has its own entry, and both stay", () => {
  const j = journal();
  const codex = retryKey("codex", "/work/app", PDFKIT);
  const cursor = retryKey("cursor", "/work/app", PDFKIT);
  assert.equal(retryDecision(j, codex, T0), "deny");
  assert.equal(retryDecision(j, cursor, T0 + 1), "deny");
  assert.equal(retryDecision(j, codex, T0 + 2), "pass");
  assert.equal(retryDecision(j, cursor, T0 + 3), "pass");
});

// The last writer wins: an entry written by the other process at the same moment can be lost, and
// that install is denied once more. The record itself is never half written.
test("two processes writing at the same time leave a whole record", async () => {
  const j = journal();
  const script = `import { retryDecision, retryKey } from ${JSON.stringify(new URL("./retry.ts", import.meta.url).href)};
    for (let i = 0; i < 20; i++) retryDecision(${JSON.stringify(j)}, retryKey(process.argv[1] + i, "/work/app", []), Date.now());`;
  const run = (agent: string) => new Promise<number | null>((done) => spawn(process.execPath, ["--input-type=module", "-e", script, agent], { stdio: "ignore" }).on("exit", done));
  assert.deepEqual(await Promise.all([run("codex"), run("cursor")]), [0, 0]);
  const record = JSON.parse(readFileSync(retryFile(j), "utf8"));
  assert.equal(record.version, 1);
  assert.ok(Object.keys(record.entries).length >= 1);
  for (const [key, time] of Object.entries(record.entries)) assert.ok(/^[0-9a-f]{64}$/.test(key) && Number.isFinite(time), key);
});

test("the record holds hashes and times only: no command text, no package names, no folder", () => {
  const j = journal();
  retryDecision(j, retryKey("codex", "/work/secret-app", PDFKIT), T0);
  const text = readFileSync(retryFile(j), "utf8");
  for (const word of ["pdfkit", "npm", "codex", "secret-app"]) assert.ok(!text.includes(word), word);
  assert.deepEqual(JSON.parse(text), { version: 1, entries: { [retryKey("codex", "/work/secret-app", PDFKIT)]: T0 } });
});

test("entries older than 10 minutes, and entries dated in the future, are dropped on the next write", () => {
  const j = journal();
  const old = retryKey("codex", "/a", PDFKIT);
  const future = retryKey("codex", "/b", PDFKIT);
  mkdirSync(join(j, ".cache"));
  writeFileSync(retryFile(j), JSON.stringify({ version: 1, entries: { [old]: T0 - RETRY_WINDOW, [future]: T0 + MINUTE } }));
  assert.equal(retryDecision(j, future, T0), "deny"); // a time after now isn't a deny within the window
  const now = retryKey("codex", "/c", PDFKIT);
  assert.equal(retryDecision(j, now, T0 + 1), "deny");
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(retryFile(j), "utf8")).entries).sort(), [future, now].sort());
});

test("a malformed or oversized record counts as empty and is replaced on the next deny", () => {
  for (const content of ["not json", "null", JSON.stringify({ version: 2, entries: {} }), JSON.stringify({ version: 1, entries: { "not-a-hash": 1, ["a".repeat(64)]: "soon" } }), `{"version":1,"entries":{}}${" ".repeat(300_000)}`]) {
    const j = journal();
    mkdirSync(join(j, ".cache"));
    writeFileSync(retryFile(j), content);
    const key = retryKey("codex", "/work/app", PDFKIT);
    assert.equal(retryDecision(j, key, T0), "deny", content.slice(0, 40));
    assert.deepEqual(JSON.parse(readFileSync(retryFile(j), "utf8")), { version: 1, entries: { [key]: T0 } });
  }
});

test("at most 1,000 entries are kept, the newest", () => {
  const j = journal();
  mkdirSync(join(j, ".cache"));
  const entries = Object.fromEntries(Array.from({ length: 1_200 }, (_, i) => [retryKey("codex", `/f${i}`, PDFKIT), T0 - i]));
  writeFileSync(retryFile(j), JSON.stringify({ version: 1, entries }));
  const key = retryKey("codex", "/new", PDFKIT);
  assert.equal(retryDecision(j, key, T0), "deny");
  const kept = JSON.parse(readFileSync(retryFile(j), "utf8")).entries;
  assert.equal(Object.keys(kept).length, 1_000);
  assert.equal(kept[key], T0);
  assert.equal(kept[retryKey("codex", "/f0", PDFKIT)], T0);
  assert.equal(kept[retryKey("codex", "/f998", PDFKIT)], T0 - 998);
  assert.equal(kept[retryKey("codex", "/f999", PDFKIT)], undefined);
});

test("a link in place of the record: unavailable, and the link's target is untouched", (t) => {
  const j = journal();
  const target = join(j, "..", "elsewhere.json");
  writeFileSync(target, "untouched");
  mkdirSync(join(j, ".cache"));
  if (!link(t, target, retryFile(j), "file")) return;
  assert.equal(retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0), "unavailable");
  assert.equal(readFileSync(target, "utf8"), "untouched");
});

test("a link in place of .cache: unavailable, and nothing is written through it", (t) => {
  const j = journal();
  const outside = join(j, "..", "outside");
  mkdirSync(outside);
  if (!link(t, outside, join(j, ".cache"), "dir")) return;
  assert.equal(retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0), "unavailable");
  assert.equal(existsSync(join(outside, "hook-retry.json")), false);
});

test("an unwritable .cache (a file in its place): unavailable, so the adapter informs", () => {
  const j = journal();
  writeFileSync(join(j, ".cache"), "a file, not a folder");
  assert.equal(retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0), "unavailable");
});

test("a folder in place of the record: unavailable", () => {
  const j = journal();
  mkdirSync(retryFile(j), { recursive: true });
  assert.equal(retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0), "unavailable");
});

test("a read-only .cache: unavailable", { skip: process.platform === "win32" && "POSIX permissions" }, async () => {
  const { chmodSync } = await import("node:fs");
  const j = journal();
  mkdirSync(join(j, ".cache"));
  chmodSync(join(j, ".cache"), 0o500);
  try {
    if (process.getuid?.() === 0) return; // root writes anyway
    assert.equal(retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0), "unavailable");
  } finally {
    chmodSync(join(j, ".cache"), 0o700);
  }
});

test("no personal journal: unavailable, and no journal is created", () => {
  const j = join(scratchBase("retry"), "missing");
  assert.equal(retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0), "unavailable");
  assert.equal(existsSync(j), false);
});

test("the record is written for its owner only", { skip: process.platform === "win32" && "POSIX permissions" }, () => {
  const j = journal();
  retryDecision(j, retryKey("codex", "/work/app", PDFKIT), T0);
  assert.equal(statSync(retryFile(j)).mode & 0o777, 0o600);
});
