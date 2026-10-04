import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { fileURLToPath } from "node:url";
import {
  configPath,
  createJournal,
  journalTagList,
  STARTER_TAGS,
  findManifests,
  findProjectJournal,
  findProjectRoot,
  listNotes,
  noteFor,
  parseTagList,
  readTagList,
  resolvePersonalJournal,
} from "./journals.ts";

// Every fixture is <base>/w, where <base> is a scratch folder (with a .git fence) that the tests pass
// as the home directory, so every walk stops at <base>. The real home directory is never used.
function fixture(files: Record<string, string | null>): string {
  const root = join(scratchBase("journals"), "w");
  mkdirSync(root);
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
// stopping at the git root, the home directory or the filesystem root, never taking the personal
// journal or the home directory's own .magpie.

const find = (root: string, cwd: string, flag?: string) =>
  findProjectJournal({ cwd, home: dirname(root), personalJournal: join(root, "personal"), flag });

test("finds .magpie/ in the working directory", () => {
  const root = fixture({ ".git/": null, ".magpie/": null });
  assert.equal(find(root, root), join(root, ".magpie"));
});

test("walks up to find .magpie/ in a parent folder", () => {
  const root = fixture({ ".git/": null, ".magpie/": null, "src/core/": null });
  assert.equal(find(root, join(root, "src", "core")), join(root, ".magpie"));
});

test("stops at the git root: a .magpie/ above it is not taken", () => {
  const root = fixture({ ".magpie/": null, "repo/.git/": null, "repo/src/": null });
  assert.equal(find(root, join(root, "repo", "src")), null);
});

test("a .git file (worktree or submodule) also marks the git root", () => {
  const root = fixture({ ".magpie/": null, "repo/.git": "gitdir: ../elsewhere\n", "repo/src/": null });
  assert.equal(find(root, join(root, "repo", "src")), null);
});

test("never takes the personal journal as a project journal", () => {
  const root = fixture({ ".git/": null, ".magpie/": null, "projects/notes/": null });
  const cwd = join(root, "projects", "notes");
  assert.equal(findProjectJournal({ cwd, home: dirname(root), personalJournal: join(root, ".magpie") }), null);
});

test("a file named .magpie is not a journal", () => {
  const root = fixture({ ".git/": null, ".magpie": "not a folder" });
  assert.equal(find(root, root), null);
});

test("stops at the filesystem root", () => {
  const fsRoot = parse(process.cwd()).root;
  assert.equal(findProjectJournal({ cwd: fsRoot, home: join(fsRoot, "no-such-home"), personalJournal: join(fsRoot, "no-such-personal-journal") }), null);
});

test("stops at the home directory: the home's own .magpie is never a project journal, even when the personal journal is elsewhere", () => {
  const root = fixture({ "home/.magpie/": null, "home/code/app/": null, "home/.git/": null });
  const home = join(root, "home");
  const personalJournal = join(root, "custom-journal"); // MAGPIE_HOME points elsewhere
  assert.equal(findProjectJournal({ cwd: join(home, "code", "app"), home, personalJournal }), null);
  assert.equal(findProjectJournal({ cwd: home, home, personalJournal }), null);
});

test("stops at the home directory: a .magpie above it is not taken", () => {
  const root = fixture({ ".magpie/": null, "home/code/": null });
  const home = join(root, "home");
  assert.equal(findProjectJournal({ cwd: join(home, "code"), home, personalJournal: join(root, "personal") }), null);
});

test("below the home directory, a project's .magpie is still found", () => {
  const root = fixture({ "home/code/app/.magpie/": null, "home/code/app/src/": null });
  const home = join(root, "home");
  assert.equal(findProjectJournal({ cwd: join(home, "code", "app", "src"), home, personalJournal: join(home, ".magpie") }), join(home, "code", "app", ".magpie"));
});

test("--project with a path to the .magpie folder itself is used as given", () => {
  const root = fixture({ ".git/": null, ".magpie/": null });
  assert.equal(find(root, root, "../other/.magpie"), join(root, "..", "other", ".magpie"));
});

test("--project with a project root means that root's .magpie folder (like git -C)", () => {
  const root = fixture({ ".git/": null, ".magpie/": null });
  assert.equal(find(root, root, "../repo"), join(root, "..", "repo", ".magpie"));
  assert.equal(find(root, root, "."), join(root, ".magpie"));
});

// Project root and manifests (spec §2 note step 5, §4 bare names)

test("the project root is the nearest folder with .git", () => {
  const root = fixture({ ".git/": null, "src/deep/": null });
  assert.equal(findProjectRoot(join(root, "src", "deep"), dirname(root)), root);
});

test("outside git, the project root is the working directory", () => {
  const root = fixture({ "outside/": null });
  assert.equal(findProjectRoot(join(root, "outside"), dirname(root)), join(root, "outside"));
});

test("the project-root walk stops at the home directory: a git repository at home doesn't make home the root", () => {
  const root = fixture({ "home/.git/": null, "home/notes/": null });
  const home = join(root, "home");
  assert.equal(findProjectRoot(join(home, "notes"), home), join(home, "notes"));
  assert.equal(findProjectRoot(home, home), home);
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

// Creating a journal (spec §2 note step 5, §3): notes/, the starter tag list, and for a project
// journal a .gitignore for .cache/

test("createJournal makes a project journal: notes/, a .gitignore for .cache/ and the starter tag list", () => {
  const root = fixture({ ".git/": null });
  const journal = join(root, ".magpie");
  assert.equal(createJournal(journal, "project"), true);
  assert.ok(existsSync(join(journal, "notes")));
  assert.equal(readFileSync(join(journal, ".gitignore"), "utf8"), ".cache/\n");
  assert.equal(readFileSync(join(journal, "tags.md"), "utf8"), STARTER_TAGS);
  assert.equal(createJournal(journal, "project"), false);
});

test("createJournal makes a personal journal without a .gitignore; a folder that exists (it holds config.yaml) still gets the starter", () => {
  const home = fixture({ ".magpie/config.yaml": "personal_journal:\n" });
  const journal = join(home, ".magpie");
  assert.equal(createJournal(journal, "personal"), false); // the folder existed
  assert.equal(readFileSync(join(journal, "tags.md"), "utf8"), STARTER_TAGS);
  assert.equal(existsSync(join(journal, ".gitignore")), false);
});

test("createJournal never overwrites an existing tags.md or .gitignore", () => {
  const root = fixture({ ".magpie/.gitignore": "mine\n", ".magpie/tags.md": "- `mine`\n" });
  createJournal(join(root, ".magpie"), "project");
  assert.equal(readFileSync(join(root, ".magpie", ".gitignore"), "utf8"), "mine\n");
  assert.equal(readFileSync(join(root, ".magpie", "tags.md"), "utf8"), "- `mine`\n");
});

test("a journal that already has notes/ but no tags.md is not given one (the user removed it)", () => {
  const journal = fixture({ "notes/": null });
  createJournal(journal, "personal");
  assert.equal(existsSync(join(journal, "tags.md")), false);
});

test("the starter tag list has exactly the example vault's ten tag lines", () => {
  const example = readFileSync(fileURLToPath(new URL("../../examples/vault/tags.md", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  const tagLines = (text: string) => text.split("\n").filter((line) => line.startsWith("- `"));
  assert.deepEqual(tagLines(STARTER_TAGS), tagLines(example));
  assert.equal(parseTagList(STARTER_TAGS).length, 10);
  assert.doesNotMatch(STARTER_TAGS, /\]\(/); // no links that would break inside a user's journal
});

test("journalTagList: tags.md if there is one; the starter list for a journal not created yet; otherwise none", () => {
  assert.deepEqual(journalTagList(fixture({ "tags.md": "- `pdf`\n", "notes/": null })), ["pdf"]);
  assert.deepEqual(journalTagList(fixture({})), parseTagList(STARTER_TAGS));
  assert.deepEqual(journalTagList(fixture({ "notes/": null })), []);
});
