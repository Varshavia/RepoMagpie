import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import {
  configPath,
  createProjectJournal,
  findManifests,
  findProjectJournal,
  findProjectRoot,
  listNotes,
  noteFor,
  parseTagList,
  readTagList,
  resolvePersonalJournal,
} from "./journals.ts";

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

// Project root and manifests (spec §2 note step 5, §4 bare names)

test("the project root is the nearest folder with .git", () => {
  const root = fixture({ ".git/": null, "src/deep/": null });
  assert.equal(findProjectRoot(join(root, "src", "deep")), root);
});

test("outside git, the project root is the working directory", () => {
  const root = fixture({ "outside/": null });
  // The fixture's parents may be inside some repository; the walk only ever returns a folder that has .git, or cwd.
  const found = findProjectRoot(join(root, "outside"));
  assert.ok(found === join(root, "outside") || existsSync(join(found, ".git")));
});

test("the nearest manifests are those in the closest folder that has any", () => {
  const root = fixture({ ".git/": null, "package.json": "{}", "pyproject.toml": "", "app/Cargo.toml": "", "app/src/": null });
  assert.deepEqual(findManifests(join(root, "app", "src")), ["Cargo.toml"]);
  assert.deepEqual(findManifests(root), ["package.json", "pyproject.toml"]);
});

test("the manifest walk stops at the git root", () => {
  const outer = fixture({ "package.json": "{}", "repo/.git/": null, "repo/src/": null });
  assert.deepEqual(findManifests(join(outer, "repo", "src")), []);
});

// Notes in a journal: found by id or packages (schema rule 6)

const note = (id: string, packages: string[] = []) => `---\nid: ${id}\nname: x\npackages: [${packages.join(", ")}]\n---\n\n## Verdict\n`;

test("listNotes reads every note's id and packages; noteFor matches either", () => {
  const journal = fixture({
    "notes/npm--pdfkit.md": note("pkg:npm/pdfkit"),
    "notes/github--microsoft--playwright-cli.md": note("pkg:github/microsoft/playwright-cli", ["pkg:npm/%40playwright/cli"]),
    "notes/readme.txt": "not a note",
  });
  const notes = listNotes(journal);
  assert.equal(notes.length, 2);
  assert.equal(noteFor(notes, "pkg:npm/pdfkit")?.path, join(journal, "notes", "npm--pdfkit.md"));
  assert.equal(noteFor(notes, "pkg:npm/%40playwright/cli")?.id, "pkg:github/microsoft/playwright-cli");
  assert.equal(noteFor(notes, "pkg:npm/other"), undefined);
});

test("listNotes on a journal without notes/ is empty; unreadable frontmatter gives an entry without id", () => {
  assert.deepEqual(listNotes(fixture({})), []);
  const journal = fixture({ "notes/npm--broken.md": "---\nid: [\n---\n" });
  assert.deepEqual(listNotes(journal), [{ path: join(journal, "notes", "npm--broken.md"), id: undefined, packages: [] }]);
});

// The tag list: one "- `tag`" line per tag, optionally followed by " — meaning"

test("parseTagList reads list lines with or without backticks and ignores everything else", () => {
  const text = "# Tags\n\nIntro with `not-a-tag`.\n\n- `agent-skills` — repos of skills\n* testing\n- `Bad Tag` — no\n- design\n";
  assert.deepEqual(parseTagList(text), ["agent-skills", "testing", "design"]);
});

test("readTagList reads <journal>/tags.md, or nothing when it is missing", () => {
  assert.deepEqual(readTagList(fixture({ "tags.md": "- `pdf`\r\n- `testing` — tests\r\n" })), ["pdf", "testing"]);
  assert.deepEqual(readTagList(fixture({})), []);
});

test("the example vault's tag list parses to its ten tags", () => {
  const tags = readTagList(fileURLToPath(new URL("../../examples/vault/", import.meta.url)));
  assert.equal(tags.length, 10);
  assert.ok(tags.includes("agent-skills"));
});

// Creating a project journal (spec §2 note step 5)

test("createProjectJournal makes the folder and a .gitignore for .cache/", () => {
  const root = fixture({ ".git/": null });
  const journal = join(root, ".magpie");
  assert.equal(createProjectJournal(journal), true);
  assert.equal(readFileSync(join(journal, ".gitignore"), "utf8"), ".cache/\n");
  assert.equal(createProjectJournal(journal), false);
});

test("createProjectJournal keeps an existing .gitignore", () => {
  const root = fixture({ ".magpie/.gitignore": "mine\n" });
  assert.equal(createProjectJournal(join(root, ".magpie")), false);
  assert.equal(readFileSync(join(root, ".magpie", ".gitignore"), "utf8"), "mine\n");
});
