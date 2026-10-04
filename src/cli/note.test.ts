import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { fakeFetch, recorded, type Call } from "../core/fixtures/fake-fetch.ts";
import type { Fetch } from "../core/github.ts";
import { STARTER_TAGS } from "../core/journals.ts";
import { readNote, validate } from "../core/note.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// Every test gets its own temporary home, journal and project (fixtures/sandbox.ts); the real
// home is never used, and fetch answers from recorded responses only.

const PLAYWRIGHT_URL = "https://github.com/microsoft/playwright-cli";
const playwright = () => fakeFetch(recorded("microsoft--playwright-cli"));
const valid = (path: string) => assert.deepEqual(validate(readNote(readFileSync(path, "utf8")), { fileName: parse(path).base }), []);

// --- a bare name with text (the spec's example) ---

test("note pdfkit \"text\": saved to the personal journal; message on stderr, path on stdout", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const r = await magpie(box, ["note", "pdfkit", "avoid: async streams painful; use puppeteer"]);
  assert.equal(r.code, 0);
  assert.equal(r.err, "✔ Saved to your personal journal: pdfkit\n");
  assert.equal(r.out, `${box.note("npm--pdfkit.md")}\n`);
  const note = readNote(readFileSync(box.note("npm--pdfkit.md"), "utf8"));
  assert.equal(note.verdict, "avoid: async streams painful; use puppeteer");
  assert.equal(note.frontmatter.status, "reviewed");
  valid(box.note("npm--pdfkit.md"));
});

test("--json prints exactly the spec's document and nothing on stderr", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const r = await magpie(box, ["note", "pdfkit", "ok", "--json"]);
  assert.equal(r.code, 0);
  assert.equal(r.err, "");
  assert.deepEqual(JSON.parse(r.out), { id: "pkg:npm/pdfkit", journal: "personal", path: box.note("npm--pdfkit.md"), created: true, status: "reviewed", warnings: [] });
});

test("a second Verdict is refused: exit 1, the path is printed, the file is unchanged", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "first"]);
  const before = readFileSync(box.note("npm--pdfkit.md"), "utf8");
  const r = await magpie(box, ["note", "pdfkit", "second"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /This note already has a Verdict; edit the file to change it/);
  assert.equal(r.out, `${box.note("npm--pdfkit.md")}\n`);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), before);
});

test("text for an existing note with an empty Verdict writes it", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit"]);
  const r = await magpie(box, ["note", "pdfkit", "later verdict", "--json"]);
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out), { id: "pkg:npm/pdfkit", journal: "personal", path: box.note("npm--pdfkit.md"), created: false, status: "reviewed", warnings: [] });
  valid(box.note("npm--pdfkit.md"));
});

test("an existing note without text and without a URL: no change, path printed, exit 0", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "ok"]);
  const r = await magpie(box, ["note", "pdfkit"]);
  assert.equal(r.code, 0);
  assert.equal(r.err, "Already in your personal journal: pdfkit\n");
  assert.equal(r.out, `${box.note("npm--pdfkit.md")}\n`);
  const json = await magpie(box, ["note", "pdfkit", "--json"]);
  assert.equal(JSON.parse(json.out).created, false);
});

// --- GitHub URLs: metadata, drafts, refresh ---

test("a GitHub URL creates a note from GitHub's metadata, with tags from tags.md", async () => {
  const box = sandbox({ "journal/tags.md": "- `testing` — tests\n- `playwright`\n" });
  const r = await magpie(box, ["note", PLAYWRIGHT_URL], { fetch: playwright() });
  assert.equal(r.code, 0, r.err);
  const path = box.note("github--microsoft--playwright-cli.md");
  const note = readNote(readFileSync(path, "utf8"));
  assert.equal(note.frontmatter.kind, "cli");
  assert.deepEqual(note.frontmatter.tags, ["playwright"]);
  assert.deepEqual(note.frontmatter.packages, ["pkg:npm/%40playwright/cli"]);
  assert.equal(note.frontmatter.status, "inbox");
  assert.match(readFileSync(path, "utf8"), /- `dev` —\n- `playwright-cli` —/);
  valid(path);
});

test("the first note in a new journal writes the starter tag list and drafts tags from it", async () => {
  const box = sandbox();
  const responses = recorded("microsoft--playwright-cli");
  const repo = responses["/repos/microsoft/playwright-cli"] as object;
  const fetch = fakeFetch({ ...responses, "/repos/microsoft/playwright-cli": { ...repo, topics: ["playwright", "testing"] } });
  const r = await magpie(box, ["note", PLAYWRIGHT_URL], { fetch });
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), STARTER_TAGS);
  assert.deepEqual(readNote(readFileSync(box.note("github--microsoft--playwright-cli.md"), "utf8")).frontmatter.tags, ["testing"]);
});

test("an existing tags.md is never overwritten", async () => {
  const box = sandbox({ "journal/tags.md": "- `mine`\n" });
  await magpie(box, ["note", "pkg:npm/pdfkit"]);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `mine`\n");
});

test("a GitHub URL for an existing note refreshes tool-owned fields and adds new skills only; human content stays", async () => {
  const box = sandbox();
  const responses = recorded("microsoft--playwright-cli");
  const tree = "/repos/microsoft/playwright-cli/git/trees/main?recursive=1";
  const full = responses[tree] as { tree: { path: string }[] };
  await magpie(box, ["note", PLAYWRIGHT_URL], { fetch: fakeFetch({ ...responses, [tree]: { ...full, tree: full.tree.filter((e) => !e.path.startsWith(".claude/")) } }) });
  const path = box.note("github--microsoft--playwright-cli.md");
  const edited = readFileSync(path, "utf8").replace("kind: cli", "kind: library").replace("## My notes\n", "## My notes\nmine\n");
  writeFileSync(path, edited);

  const r = await magpie(box, ["note", PLAYWRIGHT_URL, "default for browser checks"], { fetch: playwright() });
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /✔ Updated in your personal journal: microsoft\/playwright-cli/);
  assert.equal(
    readFileSync(path, "utf8"),
    edited
      .replace("status: inbox", "status: reviewed")
      .replace("## Verdict\n", "## Verdict\ndefault for browser checks\n")
      .replace("- `playwright-cli` —\n", "- `playwright-cli` —\n- `dev` —\n"),
  );
});

test("a skill URL writes the parent repository's note", async () => {
  const box = sandbox();
  const r = await magpie(box, ["note", "https://github.com/multica-ai/andrej-karpathy-skills/tree/main/skills/karpathy-guidelines"], { fetch: fakeFetch(recorded("multica-ai--andrej-karpathy-skills")) });
  assert.equal(r.code, 0, r.err);
  const text = readFileSync(box.note("github--multica-ai--andrej-karpathy-skills.md"), "utf8");
  assert.match(text, /- `karpathy-guidelines` —/);
  assert.match(text, /license: unknown/);
});

test("offline: the note is written without metadata, with a warning; exit 0", async () => {
  const box = sandbox();
  const offline: Fetch = (() => Promise.reject(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }))) as Fetch;
  const r = await magpie(box, ["note", "https://github.com/Egonex-AI/Understand-Anything", "--json"], { fetch: offline });
  assert.equal(r.code, 0);
  const json = JSON.parse(r.out);
  assert.equal(json.created, true);
  assert.equal(json.warnings.length, 1);
  assert.match(json.warnings[0], /ENOTFOUND/);
  const path = box.note("github--egonex-ai--understand-anything.md");
  assert.equal(readNote(readFileSync(path, "utf8")).frontmatter.name, "Egonex-AI/Understand-Anything");
  valid(path);

  const human = await magpie(sandbox(), ["note", "https://github.com/Egonex-AI/Understand-Anything"], { fetch: offline });
  assert.match(human.err, /^warning: .*ENOTFOUND/m);
});

test("a repository GitHub doesn't know: exit 1, nothing written", async () => {
  const box = sandbox();
  const r = await magpie(box, ["note", "https://github.com/nobody/nothing", "text"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /GitHub has no repository nobody\/nothing/);
  assert.equal(r.out, "");
  assert.equal(existsSync(box.journal), false);
});

test("a rejected token: exit 1, nothing written, says it may be invalid or expired; the token is never printed", async () => {
  const box = sandbox();
  const calls: Call[] = [];
  const reject = fakeFetch({}, calls, () => new Response("{}", { status: 401 }));
  for (const json of [[], ["--json"]]) {
    const r = await magpie(box, ["note", PLAYWRIGHT_URL, ...json], { fetch: reject, env: { MAGPIE_HOME: box.journal, GITHUB_TOKEN: "t0k3n-secret" } });
    assert.equal(r.code, 1);
    assert.match(r.err + r.out, /GITHUB_TOKEN may be invalid or expired/);
    assert.ok(!(r.err + r.out).includes("t0k3n-secret"));
  }
  assert.equal(calls[0].headers.Authorization, "Bearer t0k3n-secret");
  assert.equal(existsSync(box.journal), false);
});

// --- which subject: bare names, --type, rejected input, schema rule 6 ---

test("a bare name the manifests don't settle: exit 2 with a --type hint; --type settles it", async () => {
  const box = sandbox({ "project/package.json": "{}", "project/pyproject.toml": "" });
  const r = await magpie(box, ["note", "requests", "ok"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /--type/);
  const typed = await magpie(box, ["note", "requests", "ok", "--type", "pypi"]);
  assert.equal(typed.code, 0, typed.err);
  assert.ok(existsSync(box.note("pypi--requests.md")));
});

test("in a terminal, an unsettled bare name is asked for", async () => {
  const box = sandbox();
  const questions: string[] = [];
  const r = await magpie(box, ["note", "ripgrep", "fast"], { interactive: true, ask: (q) => { questions.push(q); return Promise.resolve("cargo"); } });
  assert.equal(r.code, 0, r.err);
  assert.equal(questions.length, 1);
  assert.ok(existsSync(box.note("cargo--ripgrep.md")));
});

test("--json never prompts", async () => {
  const box = sandbox();
  const r = await magpie(box, ["note", "ripgrep", "--json"], { interactive: true });
  assert.equal(r.code, 2);
});

test("--type with a URL or PURL is a usage error", async () => {
  const r = await magpie(sandbox(), ["note", "pkg:npm/pdfkit", "--type", "npm"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /--type/);
});

test("an unsupported input is a usage error", async () => {
  const r = await magpie(sandbox(), ["note", "https://example.com/article"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /Not a supported input/);
});

test("a package listed in a repository note's packages updates that note (schema rule 6)", async () => {
  const box = sandbox();
  await magpie(box, ["note", PLAYWRIGHT_URL], { fetch: playwright() });
  const r = await magpie(box, ["note", "pkg:npm/%40playwright/cli", "use the CLI"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${box.note("github--microsoft--playwright-cli.md")}\n`);
  assert.equal(readNote(readFileSync(box.note("github--microsoft--playwright-cli.md"), "utf8")).verdict, "use the CLI");
  assert.equal(existsSync(box.note("npm--playwright--cli.md")), false);
});

test("a case-only clash with an existing file: exit 1, names both PURLs, nothing changes", async () => {
  const box = sandbox();
  await magpie(box, ["note", "pkg:cargo/Inflector", "ok"]);
  const before = readFileSync(box.note("cargo--inflector.md"), "utf8");
  const r = await magpie(box, ["note", "pkg:cargo/inflector", "other"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /pkg:cargo\/inflector and pkg:cargo\/Inflector/);
  assert.equal(readFileSync(box.note("cargo--inflector.md"), "utf8"), before);
});

// --- journals ---

test("--to project without a project journal creates .magpie/ at the git root and says so", async () => {
  const box = sandbox({ "project/src/": null });
  const r = await magpie(box, ["note", "pkg:npm/pdfkit", "ok", "--to", "project"], { cwd: join(box.project, "src") });
  assert.equal(r.code, 0, r.err);
  const journal = join(box.project, ".magpie");
  assert.match(r.err, new RegExp(`Created the project journal: ${journal.replace(/\\/g, "\\\\")}`));
  assert.match(r.err, /✔ Saved to the project journal: pdfkit/);
  assert.equal(readFileSync(join(journal, ".gitignore"), "utf8"), ".cache/\n");
  assert.equal(readFileSync(join(journal, "tags.md"), "utf8"), STARTER_TAGS);
  assert.ok(existsSync(join(journal, "notes", "npm--pdfkit.md")));
});

test("--to project --json reports the journal as project and the creation as a warning", async () => {
  const box = sandbox();
  const r = await magpie(box, ["note", "pkg:npm/pdfkit", "--to", "project", "--json"]);
  const json = JSON.parse(r.out);
  assert.equal(json.journal, "project");
  assert.equal(json.path, join(box.project, ".magpie", "notes", "npm--pdfkit.md"));
  assert.match(json.warnings[0], /Created the project journal/);
  assert.equal(r.err, "");
});

// The personal journal's folder is never the project journal (spec §3), also with --to project.

const PERSONAL_GUARD = /is your personal journal, so it can't be the project journal/;

test("--to project where <root>/.magpie is the personal journal fails; nothing is written", async () => {
  const box = sandbox({ "home/.git/": null }); // a home folder under git, e.g. a dotfiles repository
  const env = {}; // personal journal: the default, <home>/.magpie
  await magpie(box, ["note", "pkg:npm/pdfkit", "ok"], { cwd: box.home, env });
  const personal = join(box.home, ".magpie");
  const r = await magpie(box, ["note", "pkg:npm/chalk", "ok", "--to", "project"], { cwd: box.home, env });
  assert.equal(r.code, 1);
  assert.match(r.err, PERSONAL_GUARD);
  assert.equal(existsSync(join(personal, "notes", "npm--chalk.md")), false);
  assert.equal(existsSync(join(personal, ".gitignore")), false);
});

test("--project naming the personal journal (by its root or the folder itself) fails, also under --json", async () => {
  const box = sandbox();
  const env = {}; // personal journal: <home>/.magpie
  for (const project of [box.home, join(box.home, ".magpie")]) {
    const r = await magpie(box, ["note", "pkg:npm/chalk", "--to", "project", "--project", project, "--json"], { env });
    assert.equal(r.code, 1);
    const json = JSON.parse(r.out);
    assert.equal(json.journal, "project");
    assert.equal(json.path, null);
    assert.match(json.error, PERSONAL_GUARD);
  }
  assert.equal(existsSync(join(box.home, ".magpie")), false);
});

test("the personal journal's own folder as the project root fails (custom MAGPIE_HOME): by --project, or as the working directory", async () => {
  // The journal is its own git repository (a backed-up journal), so walking up from it stops there and
  // never leaves the sandbox: on Windows the temp folder is under the real home, next to ~/.magpie.
  const box = sandbox({ "journal/.git/": null });
  await magpie(box, ["note", "pkg:npm/pdfkit", "ok"]); // creates the personal journal, <root>/journal
  const cases: [string[], string][] = [
    [["--project", box.journal], box.root],
    [[], box.journal],
  ];
  for (const [flags, cwd] of cases) {
    const r = await magpie(box, ["note", "pkg:npm/chalk", "ok", "--to", "project", ...flags], { cwd });
    assert.equal(r.code, 1, `${flags.join(" ")} in ${cwd}: ${r.err}`);
    assert.match(r.err, PERSONAL_GUARD);
  }
  assert.equal(existsSync(join(box.journal, ".magpie")), false);
  assert.equal(existsSync(join(box.journal, "notes", "npm--chalk.md")), false);
});

const HOME_GUARD = /is reserved for the default personal journal, so it can't be the project journal/;

test("the home directory's own .magpie is never the project journal, even with a custom MAGPIE_HOME", async () => {
  const box = sandbox({ "home/.magpie/notes/": null, "home/code/": null });
  const homeJournal = join(box.home, ".magpie");
  for (const [flags, cwd] of [[[], box.home], [["--project", box.home], box.root], [["--project", homeJournal], box.root]] as [string[], string][]) {
    const r = await magpie(box, ["note", "pkg:npm/chalk", "ok", "--to", "project", ...flags], { cwd });
    assert.equal(r.code, 1, `${flags.join(" ")} in ${cwd}: ${r.err}`);
    assert.match(r.err, HOME_GUARD);
  }
  assert.equal(existsSync(join(homeJournal, "notes", "npm--chalk.md")), false);
  assert.equal(existsSync(join(homeJournal, ".gitignore")), false);

  // Below home, outside any repository: the project journal is created in the working directory.
  const below = await magpie(box, ["note", "pkg:npm/chalk", "ok", "--to", "project"], { cwd: join(box.home, "code") });
  assert.equal(below.code, 0, below.err);
  assert.ok(existsSync(join(box.home, "code", ".magpie", "notes", "npm--chalk.md")));
});

test("search never reads the home directory's own .magpie as the project journal", async () => {
  const box = sandbox({
    "home/.magpie/notes/npm--chalk.md": "---\nid: pkg:npm/chalk\nname: chalk\n---\n\n## Verdict\nfine\n",
    "home/code/": null,
  });
  const r = await magpie(box, ["search", "chalk", "--json"], { cwd: join(box.home, "code") });
  assert.deepEqual(JSON.parse(r.out).results, []);
  const flagged = await magpie(box, ["search", "chalk", "--json", "--project", box.home]);
  assert.deepEqual(JSON.parse(flagged.out).results, []);
});

test("--home beats MAGPIE_HOME", async () => {
  const box = sandbox();
  const other = join(box.root, "other");
  const r = await magpie(box, ["--home", other, "note", "pkg:npm/pdfkit"]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(other, "notes", "npm--pdfkit.md")));
  assert.equal(existsSync(box.journal), false);
});

test("output never has colour codes", async () => {
  const box = sandbox();
  const r = await magpie(box, ["note", PLAYWRIGHT_URL, "ok"], { fetch: playwright(), interactive: true });
  assert.ok(!(r.out + r.err).includes("\u001b"));
});
