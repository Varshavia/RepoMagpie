import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { copyFolder } from "./copy-folder.ts";
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
