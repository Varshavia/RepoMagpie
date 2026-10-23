import { mock, test } from "node:test";
import assert from "node:assert/strict";
import fs, { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { copyFolder, removeFolder } from "./copy-folder.ts";
import { scratchBase } from "./fixtures/scratch.ts";

// fs.cpSync(from, to, { recursive: true }) in plain JS, for paths cpSync breaks on Windows: letters
// outside ASCII. Ş, ı and ü are the ones it was seen to break.
const NON_ASCII = "Şuat Işık Über";

function source(root: string): string {
  const from = join(root, "from");
  for (const [path, text] of Object.entries({ "SKILL.md": "skill\n", "references/a.md": "a\n", "references/deep/b.md": "b\n", "references/çay.md": "tea\n" })) {
    mkdirSync(join(from, path, ".."), { recursive: true });
    writeFileSync(join(from, path), text);
  }
  return from;
}
const tree = (folder: string): string[] => readdirSync(folder, { recursive: true }).map(String).sort();

test("copies a folder's files and subfolders, making the destination's parents, under a non-ASCII path; nothing appears beside it", () => {
  const root = join(scratchBase("copy-folder"), NON_ASCII);
  const from = source(join(root, "npm"));
  const to = join(root, ".agents", "skills", "repomagpie");
  copyFolder(from, to);
  assert.deepEqual(tree(to), tree(from));
  assert.equal(readFileSync(join(to, "references", "çay.md"), "utf8"), "tea\n");
  assert.deepEqual(readdirSync(join(root, "..")).sort(), [".git", NON_ASCII], "no folder with a mangled name beside it");
});

test("an existing file is replaced; with errorOnExist it is refused, as cpSync's EEXIST", () => {
  const root = scratchBase("copy-folder");
  const from = source(root);
  const to = join(root, "to");
  mkdirSync(to);
  writeFileSync(join(to, "SKILL.md"), "old\n");
  writeFileSync(join(to, "mine.md"), "kept\n");
  copyFolder(from, to);
  assert.equal(readFileSync(join(to, "SKILL.md"), "utf8"), "skill\n");
  assert.equal(readFileSync(join(to, "mine.md"), "utf8"), "kept\n", "a folder that exists is merged into, as cpSync does");
  assert.throws(() => copyFolder(from, to, { errorOnExist: true }), { code: "EEXIST" });
});

test("a file's mode is kept: read-only stays read-only (on Windows chmod sets only that bit)", () => {
  const root = scratchBase("copy-folder");
  const from = source(root);
  const to = join(root, "to");
  chmodSync(join(from, "references", "a.md"), 0o444);
  copyFolder(from, to);
  assert.equal(statSync(join(to, "references", "a.md")).mode & 0o222, 0, "not writable");
  for (const folder of [from, to]) chmodSync(join(folder, "references", "a.md"), 0o644); // so the scratch folder can be removed
});

test("a link is copied as a link, its relative target resolved against the source, as cpSync does", { skip: process.platform === "win32" && "symlinks need Developer Mode on Windows" }, () => {
  const root = scratchBase("copy-folder");
  const from = source(root);
  symlinkSync(join("references", "a.md"), join(from, "alias.md"));
  const to = join(root, "to");
  copyFolder(from, to);
  assert.ok(lstatSync(join(to, "alias.md")).isSymbolicLink());
  assert.equal(readlinkSync(join(to, "alias.md")), resolve(from, "references", "a.md"));
});

test("a copy into its own source, or onto itself, is refused", () => {
  const root = scratchBase("copy-folder");
  const from = source(root);
  assert.throws(() => copyFolder(from, join(from, "references", "inside")), /into itself/);
  assert.throws(() => copyFolder(from, from), /into itself/);
});

// fs.rmSync in plain JS: on Windows, Node 23.x, 24.0 to 24.13.0 and 25.0 return from rmSync without
// an error and remove nothing under a path with letters outside ASCII.
test("removes a folder with its files and subfolders, and a single file, under a non-ASCII path; nothing beside it", () => {
  const root = join(scratchBase("remove-folder"), NON_ASCII);
  const from = source(root);
  writeFileSync(join(root, "repomagpie.json"), "{}\n");
  removeFolder(join(root, "repomagpie.json"));
  assert.equal(existsSync(join(root, "repomagpie.json")), false);
  removeFolder(from);
  assert.equal(existsSync(from), false);
  assert.deepEqual(readdirSync(root), [], "nothing left beside them");
  assert.deepEqual(readdirSync(join(root, "..")).sort(), [".git", NON_ASCII], "no folder with a mangled name beside it");
});

test("a removal that returns without removing, as rmSync did, throws: it is never reported as done", (t) => {
  const root = join(scratchBase("remove-folder"), NON_ASCII);
  mkdirSync(root, { recursive: true });
  const file = join(root, "repomagpie.json");
  writeFileSync(file, "{}\n");
  mock.method(fs, "unlinkSync", () => {});
  syncBuiltinESMExports();
  t.after(() => {
    mock.restoreAll();
    syncBuiltinESMExports();
  });
  assert.throws(() => removeFolder(file), { message: `${file} is still there after removing it.` });
});

test("a missing path is nothing to do", () => {
  const root = scratchBase("remove-folder");
  assert.doesNotThrow(() => removeFolder(join(root, NON_ASCII, "not-there")));
});

test("a read-only file is removed", () => {
  const root = join(scratchBase("remove-folder"), NON_ASCII);
  const from = source(root);
  chmodSync(join(from, "references", "a.md"), 0o444);
  removeFolder(from);
  assert.equal(existsSync(from), false);
});

test("a link is removed as a link, never followed: its target and the target's files stay", () => {
  const root = join(scratchBase("remove-folder"), NON_ASCII);
  const target = source(join(root, "elsewhere"));
  const folder = join(root, "skills");
  mkdirSync(folder);
  // A junction on Windows needs no admin rights or Developer Mode, as setup's skill links.
  const link = join(folder, "repomagpie");
  symlinkSync(process.platform === "win32" ? target : resolve(target), link, process.platform === "win32" ? "junction" : "dir");
  removeFolder(link);
  assert.equal(lstatSync(link, { throwIfNoEntry: false }), undefined);
  symlinkSync(process.platform === "win32" ? target : resolve(target), link, process.platform === "win32" ? "junction" : "dir");
  removeFolder(folder);
  assert.equal(existsSync(folder), false);
  assert.deepEqual(tree(target), ["SKILL.md", "references", join("references", "a.md"), join("references", "deep"), join("references", "deep", "b.md"), join("references", "çay.md")].sort());
});
