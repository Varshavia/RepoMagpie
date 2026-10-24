import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Platform, Where } from "./agents.ts";
import { deleteBackups, planBackups, setupBackups } from "./backups.ts";
import { removeFolder } from "./copy-folder.ts";
import { scratchBase } from "./fixtures/scratch.ts";

// repomagpie setup --delete-backups (decision 0038) on a scratch home: only setup's backups go,
// found again just before, never through a link. Links are junctions, which Windows makes without
// rights, so every platform runs these.

const NON_ASCII = "Şuat Işık Über";

function home(name = "home") {
  const root = scratchBase("backups");
  const folder = join(root, name);
  mkdirSync(folder);
  const where: Where = { home: folder, env: { APPDATA: join(folder, "AppData", "Roaming"), XDG_CONFIG_HOME: join(folder, ".config") }, platform: process.platform as Platform };
  const write = (path: string, text = "{}") => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return path;
  };
  return { root, home: folder, where, write };
}

test("only setup's backups are deleted: beside the files setup edits, with a backup name; nothing else", () => {
  const h = home();
  const claude = h.write(join(h.home, ".claude.json.repomagpie-backup-20261024-101010Z"));
  const older = h.write(join(h.home, ".cursor", "mcp.json.repomagpie-backup-20261015-010147")); // a name from before the Z
  const skill = h.write(join(h.home, ".agents", "repomagpie-skill.repomagpie-backup-20261024-101010Z", "references", "json.md"), "# x");
  const left = [
    h.write(join(h.home, ".claude.json"), '{ "token": "x" }'),
    h.write(join(h.home, ".cursor", "mcp.json.bak")),
    h.write(join(h.home, ".cursor", "mcp.json.repomagpie-backup-notastamp")),
    h.write(join(h.home, ".cursor", "notes.txt.repomagpie-backup-20261024-101010Z")), // a file setup doesn't edit
    h.write(join(h.home, "Documents", ".claude.json.repomagpie-backup-20261024-101010Z")),
  ];
  const found = setupBackups(h.where);
  assert.deepEqual(found.map((b) => b.path).sort(), [claude, older, dirname(dirname(skill))].sort());
  const done = deleteBackups(found, h.where);
  assert.ok(done.every((d) => d.result === "deleted"), JSON.stringify(done));
  assert.ok(![claude, older, dirname(dirname(skill))].some((path) => existsSync(path)));
  for (const path of left) assert.ok(existsSync(path), path);
  assert.equal(readFileSync(join(h.home, ".claude.json"), "utf8"), '{ "token": "x" }');
});

test("a link is never followed: one named like a backup isn't one, nor is a backup in a folder reached through a link", () => {
  const h = home();
  const outside = join(h.root, "outside");
  const kept = h.write(join(outside, "precious.txt"), "mine");
  // A link named like a skill folder's backup.
  mkdirSync(join(h.home, ".agents"));
  symlinkSync(outside, join(h.home, ".agents", "repomagpie-skill.repomagpie-backup-20261024-101010Z"), "junction");
  // ~/.cursor is a link to a folder that holds a backup-named file.
  const elsewhere = join(h.root, "cursor-elsewhere");
  const through = h.write(join(elsewhere, "mcp.json.repomagpie-backup-20261024-101010Z"));
  symlinkSync(elsewhere, join(h.home, ".cursor"), "junction");
  assert.deepEqual(setupBackups(h.where), []);
  assert.ok(existsSync(kept) && existsSync(through));
});

test("a backup that turned into a link after the listing is left, and said so", () => {
  const h = home();
  const backup = h.write(join(h.home, ".agents", "repomagpie-skill.repomagpie-backup-20261024-101010Z", "SKILL.md"));
  const listed = setupBackups(h.where);
  removeFolder(dirname(backup));
  const outside = join(h.root, "outside");
  const kept = h.write(join(outside, "SKILL.md"), "mine");
  symlinkSync(outside, dirname(backup), "junction");
  const [done] = deleteBackups(listed, h.where);
  assert.equal(done.result, "failed");
  assert.match(done.error ?? "", /is no longer one of setup's backups, so it was left\.$/);
  assert.equal(readFileSync(kept, "utf8"), "mine");
});

test("--keep-latest keeps the newest backup of each file, -2 after the same stamp counting as newer", () => {
  const h = home();
  const claude = [
    h.write(join(h.home, ".claude.json.repomagpie-backup-20261015-010147Z")),
    h.write(join(h.home, ".claude.json.repomagpie-backup-20261024-101010Z")),
    h.write(join(h.home, ".claude.json.repomagpie-backup-20261024-101010Z-2")),
  ];
  const cursor = h.write(join(h.home, ".cursor", "mcp.json.repomagpie-backup-20261020-090000Z"));
  const plan = planBackups(setupBackups(h.where), true);
  assert.deepEqual(plan.keep.map((b) => b.path).sort(), [claude[2], cursor].sort());
  assert.deepEqual(plan.delete.map((b) => b.path), claude.slice(0, 2));
  assert.deepEqual(planBackups(setupBackups(h.where), false).keep, []);
  deleteBackups(plan.delete, h.where);
  assert.deepEqual(setupBackups(h.where).map((b) => b.path).sort(), [claude[2], cursor].sort());
});

test("a home folder with letters outside ASCII: found and deleted, folders included", () => {
  const h = home(NON_ASCII);
  const file = h.write(join(h.home, ".claude.json.repomagpie-backup-20261024-101010Z"));
  const skill = h.write(join(h.home, ".claude", "repomagpie-skill.repomagpie-backup-20261024-101010Z", "references", "commands.md"), "# x");
  const found = setupBackups(h.where);
  assert.equal(found.length, 2);
  assert.ok(deleteBackups(found, h.where).every((d) => d.result === "deleted"));
  assert.ok(!existsSync(file) && !existsSync(dirname(dirname(skill))));
  assert.ok(existsSync(join(h.home, ".claude")), "only the backup goes");
});
