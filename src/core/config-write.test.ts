import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { backupsOf } from "./config-write.ts";
import { scratchBase } from "./fixtures/scratch.ts";

// Setup's backups, found from a folder's listing only (decision 0035, "Safety").

test("a file's backups: both stamp forms and the -2 of a second one in the same second, oldest first; nothing else", () => {
  const home = join(scratchBase("backups"), "home");
  mkdirSync(home, { recursive: true });
  const file = join(home, ".claude.json");
  for (const name of [
    ".claude.json",
    ".claude.json.repomagpie-backup-20261015-020000Z-2",
    ".claude.json.repomagpie-backup-20261015-020000Z",
    ".claude.json.repomagpie-backup-20261015-010147", // before the Z (never released); UTC too
    ".claude.json.repomagpie-backup-later",
    ".claude.json.bak",
    ".claude.jsonx.repomagpie-backup-20261015-010101Z",
  ]) writeFileSync(join(home, name), "{}");
  // A backup that is a link is never listed, so never followed.
  mkdirSync(join(home, "elsewhere"));
  symlinkSync(join(home, "elsewhere"), join(home, ".claude.json.repomagpie-backup-20261015-030000Z"), "junction");
  assert.deepEqual(backupsOf(file, home), [
    { path: `${file}.repomagpie-backup-20261015-010147`, date: "2026-10-15T01:01:47Z" },
    { path: `${file}.repomagpie-backup-20261015-020000Z`, date: "2026-10-15T02:00:00Z" },
    { path: `${file}.repomagpie-backup-20261015-020000Z-2`, date: "2026-10-15T02:00:00Z" },
  ]);
});

test("a skill backup is a folder; a linked config folder and a missing one give none", () => {
  const root = scratchBase("backups");
  const home = join(root, "home");
  mkdirSync(join(home, ".agents", "repomagpie-skill.repomagpie-backup-20261015-010147Z"), { recursive: true });
  assert.deepEqual(backupsOf(join(home, ".agents", "repomagpie-skill"), home), [
    { path: join(home, ".agents", "repomagpie-skill.repomagpie-backup-20261015-010147Z"), date: "2026-10-15T01:01:47Z" },
  ]);
  const outside = join(root, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "mcp.json.repomagpie-backup-20261015-010147Z"), "{}");
  symlinkSync(outside, join(home, ".cursor"), "junction");
  assert.deepEqual(backupsOf(join(home, ".cursor", "mcp.json"), home), []);
  assert.deepEqual(backupsOf(join(home, ".codex", "config.toml"), home), []);
});
