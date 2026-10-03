import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { configPath, findProjectJournal, resolvePersonalJournal } from "./journals.ts";

// Every fixture lives in its own temporary folder; the real home directory is never used.
const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function fixture(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), "magpie-journals-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    if (content === null) mkdirSync(full, { recursive: true });
    else {
      mkdirSync(parse(full).dir, { recursive: true });
      writeFileSync(full, content);
    }
  }
  return root;
}

// Personal journal: --home > MAGPIE_HOME > personal_journal in ~/.magpie/config.yaml > ~/.magpie/

test("personal journal defaults to <home>/.magpie", () => {
  const home = fixture({});
  assert.deepEqual(resolvePersonalJournal({ home, env: {}, cwd: home }), { path: join(home, ".magpie"), source: "default", warnings: [] });
});

test("the config file is always <home>/.magpie/config.yaml", () => {
  assert.equal(configPath("/h"), join("/h", ".magpie", "config.yaml"));
});

test("personal_journal in the config file beats the default (absolute path)", () => {
  const home = fixture({});
  const target = join(home, "elsewhere", "journal");
  mkdirSync(join(home, ".magpie"));
  writeFileSync(configPath(home), `personal_journal: ${JSON.stringify(target)}\n`);
  assert.deepEqual(resolvePersonalJournal({ home, env: {}, cwd: home }), { path: target, source: "config", warnings: [] });
});

test("personal_journal may start with ~", () => {
  const home = fixture({ ".magpie/config.yaml": "personal_journal: ~/notes/magpie\n" });
  assert.equal(resolvePersonalJournal({ home, env: {}, cwd: home }).path, join(home, "notes", "magpie"));
});

test("a relative personal_journal is relative to the config file's folder", () => {
  const home = fixture({ ".magpie/config.yaml": "personal_journal: journal\n" });
  assert.equal(resolvePersonalJournal({ home, env: {}, cwd: home }).path, join(home, ".magpie", "journal"));
});

test("a config file without personal_journal leaves the default", () => {
  const home = fixture({ ".magpie/config.yaml": "# nothing set yet\n" });
  assert.equal(resolvePersonalJournal({ home, env: {}, cwd: home }).source, "default");
});

test("invalid YAML in the config file falls back to the default with a warning", () => {
  const home = fixture({ ".magpie/config.yaml": "personal_journal: [unclosed\n" });
  const r = resolvePersonalJournal({ home, env: {}, cwd: home });
  assert.equal(r.path, join(home, ".magpie"));
  assert.equal(r.source, "default");
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /config\.yaml/);
});

test("MAGPIE_HOME beats the config file", () => {
  const home = fixture({ ".magpie/config.yaml": "personal_journal: /from/config\n" });
  const r = resolvePersonalJournal({ home, env: { MAGPIE_HOME: join(home, "from-env") }, cwd: home });
  assert.deepEqual(r, { path: join(home, "from-env"), source: "env", warnings: [] });
});

test("an empty MAGPIE_HOME counts as unset", () => {
  const home = fixture({});
  assert.equal(resolvePersonalJournal({ home, env: { MAGPIE_HOME: "" }, cwd: home }).source, "default");
});

test("--home beats MAGPIE_HOME and resolves against the working directory", () => {
  const home = fixture({});
  const cwd = join(home, "work");
  const r = resolvePersonalJournal({ home, env: { MAGPIE_HOME: join(home, "from-env") }, cwd, flag: "my-journal" });
  assert.deepEqual(r, { path: join(cwd, "my-journal"), source: "flag", warnings: [] });
});

// Project journal: --project, or the first .magpie/ walking up from the working directory,
// stopping at the git root or the filesystem root, never taking the personal journal.

test("finds .magpie/ in the working directory", () => {
  const root = fixture({ ".git/": null, ".magpie/": null });
  assert.equal(findProjectJournal({ cwd: root, personalJournal: join(root, "personal") }), join(root, ".magpie"));
});

test("walks up to find .magpie/ in a parent folder", () => {
  const root = fixture({ ".git/": null, ".magpie/": null, "src/core/": null });
  assert.equal(findProjectJournal({ cwd: join(root, "src", "core"), personalJournal: join(root, "personal") }), join(root, ".magpie"));
});

test("stops at the git root: a .magpie/ above it is not taken", () => {
  const root = fixture({ ".magpie/": null, "repo/.git/": null, "repo/src/": null });
  assert.equal(findProjectJournal({ cwd: join(root, "repo", "src"), personalJournal: join(root, "personal") }), null);
});

test("a .git file (worktree or submodule) also marks the git root", () => {
  const root = fixture({ ".magpie/": null, "repo/.git": "gitdir: ../elsewhere\n", "repo/src/": null });
  assert.equal(findProjectJournal({ cwd: join(root, "repo", "src"), personalJournal: join(root, "personal") }), null);
});

test("never takes the personal journal as a project journal", () => {
  const home = fixture({ ".git/": null, ".magpie/": null, "projects/notes/": null });
  assert.equal(findProjectJournal({ cwd: join(home, "projects", "notes"), personalJournal: join(home, ".magpie") }), null);
});

test("a file named .magpie is not a journal", () => {
  const root = fixture({ ".git/": null, ".magpie": "not a folder" });
  assert.equal(findProjectJournal({ cwd: root, personalJournal: join(root, "personal") }), null);
});

test("stops at the filesystem root", () => {
  const fsRoot = parse(tmpdir()).root;
  assert.equal(findProjectJournal({ cwd: fsRoot, personalJournal: join(fsRoot, "no-such-personal-journal") }), null);
});

test("--project with a path to the .magpie folder itself is used as given", () => {
  const root = fixture({ ".git/": null, ".magpie/": null });
  assert.equal(findProjectJournal({ cwd: root, personalJournal: join(root, "personal"), flag: "../other/.magpie" }), join(root, "..", "other", ".magpie"));
});

test("--project with a project root means that root's .magpie folder (like git -C)", () => {
  const root = fixture({ ".git/": null, ".magpie/": null });
  assert.equal(findProjectJournal({ cwd: root, personalJournal: join(root, "personal"), flag: "../repo" }), join(root, "..", "repo", ".magpie"));
  assert.equal(findProjectJournal({ cwd: root, personalJournal: join(root, "personal"), flag: "." }), join(root, ".magpie"));
});
