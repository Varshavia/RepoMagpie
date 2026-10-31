import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { fakeFetch, recorded, type Call } from "../core/fixtures/fake-fetch.ts";
import type { Fetch } from "../core/github.ts";
import { STARTER_TAGS } from "../core/journals.ts";
import { readNote, validate } from "../core/note.ts";
import { renderNote } from "../core/write.ts";
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
  assert.deepEqual(JSON.parse(r.out), { id: "pkg:npm/pdfkit", journal: "personal", path: box.note("npm--pdfkit.md"), created: true, status: "reviewed", warnings: [], alternatives_added: [], alternatives_present: [], tags_md_added: [], sections_changed: [], drafts_replaced: [], items_present: [], domains_added: [] });
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
  assert.deepEqual(JSON.parse(r.out), { id: "pkg:npm/pdfkit", journal: "personal", path: box.note("npm--pdfkit.md"), created: false, status: "reviewed", warnings: [], alternatives_added: [], alternatives_present: [], tags_md_added: [], sections_changed: [], drafts_replaced: [], items_present: [], domains_added: [] });
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

// The playwright-cli fixture with other topics.
function withTopics(topics: string[]): Fetch {
  const responses = recorded("microsoft--playwright-cli");
  const repo = responses["/repos/microsoft/playwright-cli"] as object;
  return fakeFetch({ ...responses, "/repos/microsoft/playwright-cli": { ...repo, topics } });
}

test("the first note in a new journal writes the starter tag list, then appends its topics that the list doesn't have", async () => {
  const box = sandbox();
  const r = await magpie(box, ["note", PLAYWRIGHT_URL], { fetch: withTopics(["playwright", "testing"]) });
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), `${STARTER_TAGS}- \`playwright\`\n`);
  assert.deepEqual(readNote(readFileSync(box.note("github--microsoft--playwright-cli.md"), "utf8")).frontmatter.tags, ["testing", "playwright"]);
  assert.match(r.err, /^Added to tags\.md: playwright$/m);
});

// Decision 0030: topics become tags at creation.
test("topics become tags: ranked (tags.md, then other notes, then the rest), at most 8, without the repository's name or the stop list", async () => {
  const tagsMd = "# My tags\r\n\r\n- `pdf` — PDFs\r\nfree text\r\n- `llm`"; // CRLF, no final line break
  const other = "---\nid: pkg:npm/x\nname: x\ntopics: [vector]\ntags: [rag]\n---\n";
  const box = sandbox({ "journal/tags.md": tagsMd, "journal/notes/npm--x.md": other });
  const topics = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "hacktoberfest", "llm", "open-source", "pdf", "playwright-cli", "rag", "vector"];
  const r = await magpie(box, ["note", PLAYWRIGHT_URL, "--json"], { fetch: withTopics(topics) });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readNote(readFileSync(box.note("github--microsoft--playwright-cli.md"), "utf8")).frontmatter.tags, ["llm", "pdf", "rag", "vector", "a1", "a2", "a3", "a4"]);
  assert.deepEqual(JSON.parse(r.out).tags_md_added, ["rag", "vector", "a1", "a2", "a3", "a4"]);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), `${tagsMd}\r\n- \`rag\`\r\n- \`vector\`\r\n- \`a1\`\r\n- \`a2\`\r\n- \`a3\`\r\n- \`a4\`\r\n`);
  assert.equal(readFileSync(box.note("npm--x.md"), "utf8"), other);
});

test("a topic already in tags.md isn't appended again; tags.md stays byte for byte", async () => {
  const box = sandbox({ "journal/tags.md": "- `testing` — tests\n- `playwright`\n" });
  const r = await magpie(box, ["note", PLAYWRIGHT_URL, "--json"], { fetch: withTopics(["playwright", "testing"]) });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(r.out).tags_md_added, []);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `testing` — tests\n- `playwright`\n");
  assert.deepEqual(readNote(readFileSync(box.note("github--microsoft--playwright-cli.md"), "utf8")).frontmatter.tags, ["playwright", "testing"]);
});

test("a journal with notes but no tags.md gets one holding just the new tags", async () => {
  const box = sandbox({ "journal/notes/": null });
  const r = await magpie(box, ["note", PLAYWRIGHT_URL], { fetch: withTopics(["playwright", "testing"]) });
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "# Tags\n\n- `playwright`\n- `testing`\n");
});

test("a registry package gets no tags, and an existing tags.md is never overwritten", async () => {
  const box = sandbox({ "journal/tags.md": "- `mine`\n" });
  await magpie(box, ["note", "pkg:npm/pdfkit"]);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `mine`\n");
  assert.deepEqual(readNote(readFileSync(box.note("npm--pdfkit.md"), "utf8")).frontmatter.tags, []);
});

test("an existing note's tags are never changed by its topics", async () => {
  const box = sandbox({ "journal/tags.md": "- `mine`\n" });
  await magpie(box, ["note", PLAYWRIGHT_URL], { fetch: withTopics(["mine"]) });
  const path = box.note("github--microsoft--playwright-cli.md");
  const r = await magpie(box, ["note", PLAYWRIGHT_URL, "--json"], { fetch: withTopics(["mine", "newer", "topics"]) });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readNote(readFileSync(path, "utf8")).frontmatter.tags, ["mine"]);
  assert.deepEqual(readNote(readFileSync(path, "utf8")).frontmatter.topics, ["mine", "newer", "topics"]);
  assert.deepEqual(JSON.parse(r.out).tags_md_added, []);
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
  assert.ok(r.err.includes(`Created the project journal: ${journal}`), r.err);
  assert.match(r.err, /✔ Saved to the project journal: pdfkit/);
  assert.equal(readFileSync(join(journal, ".gitignore"), "utf8"), ".cache/\n.trash/\n");
  assert.equal(readFileSync(join(journal, "tags.md"), "utf8"), STARTER_TAGS);
  assert.ok(existsSync(join(journal, "notes", "npm--pdfkit.md")));
});

// Home is the scratch root here, so the walk stops there and never sees its .git fence.
test("--to project outside a git repository fails and says to use --project; nothing is written; --project works", async () => {
  const box = sandbox({ "outside/": null });
  const outside = { home: box.root, cwd: join(box.root, "outside") };
  const r = await magpie(box, ["note", "pkg:npm/pdfkit", "ok", "--to", "project"], outside);
  assert.equal(r.code, 1);
  assert.match(r.err, /outside a git repository, use --project <path>/);
  assert.equal(existsSync(join(box.root, "outside", ".magpie")), false);
  const flagged = await magpie(box, ["note", "pkg:npm/pdfkit", "ok", "--to", "project", "--project", "."], outside);
  assert.equal(flagged.code, 0, flagged.err);
  assert.ok(existsSync(join(box.root, "outside", ".magpie", "notes", "npm--pdfkit.md")));
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

  // Below home, outside any repository: no project journal without --project.
  const below = await magpie(box, ["note", "pkg:npm/chalk", "ok", "--to", "project"], { cwd: join(box.home, "code") });
  assert.equal(below.code, 1, below.err);
  assert.match(below.err, /outside a git repository, use --project <path>/);
  assert.equal(existsSync(join(box.home, "code", ".magpie")), false);
});

// A regression guard: the walk for the git root stops at the home folder, so a home folder under git
// (dotfiles) is no project (decision 0051), for every command that looks for a project journal.
test("a home folder that is a git repository is no project: doctor, recall and note --to project find no project journal there", async () => {
  const pdfkit = renderNote({ id: "pkg:npm/pdfkit", name: "pdfkit", explored: "2026-10-31", kind: "library", tags: [], verdict: "avoid: async streams painful" });
  const box = sandbox({ "home/.git/": null, "home/.magpie/notes/npm--pdfkit.md": pdfkit, "home/code/app/": null, "home/code/repo/.git/": null, "home/code/repo/.magpie/notes/npm--pdfkit.md": pdfkit });
  for (const cwd of [box.home, join(box.home, "code", "app")]) {
    const doctor = JSON.parse((await magpie(box, ["doctor", "--json"], { cwd })).out);
    assert.deepEqual([doctor.git_repository, doctor.journals.map((j: { scope: string }) => j.scope)], [false, ["personal"]], cwd);
    assert.deepEqual(JSON.parse((await magpie(box, ["recall", "pdfkit", "--json"], { cwd })).out).matches, [], cwd);
    const note = await magpie(box, ["note", "pkg:npm/chalk", "ok", "--to", "project"], { cwd });
    assert.equal(note.code, 1, `${cwd}: ${note.err}`);
    assert.match(note.err, cwd === box.home ? HOME_GUARD : /outside a git repository, use --project <path>/);
  }
  assert.deepEqual(readdirSync(join(box.home, ".magpie", "notes")), ["npm--pdfkit.md"]);
  assert.equal(existsSync(join(box.home, "code", "app", ".magpie")), false);
  // A repository below the home folder is still a project.
  const repo = join(box.home, "code", "repo");
  assert.deepEqual(JSON.parse((await magpie(box, ["recall", "pdfkit", "--json"], { cwd: repo })).out).matches.map((m: { journal: string }) => m.journal), ["project"]);
  assert.equal((await magpie(box, ["note", "pkg:npm/chalk", "ok", "--to", "project"], { cwd: repo })).code, 0);
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

// --- --alternative (decision 0029): the user's own words, written into the alternatives field ---

const alternativesOf = (path: string) => readNote(readFileSync(path, "utf8")).frontmatter.alternatives;

test("--alternative on a new note: written with it; a target without a note is written as given", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const r = await magpie(box, ["note", "pdfkit", "avoid: async streams painful", "--alternative", "puppeteer", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(r.out), {
    id: "pkg:npm/pdfkit", journal: "personal", path: box.note("npm--pdfkit.md"), created: true, status: "reviewed", warnings: [],
    alternatives_added: ["puppeteer"], alternatives_present: [], tags_md_added: [], sections_changed: [], drafts_replaced: [], items_present: [], domains_added: [],
  });
  assert.deepEqual(alternativesOf(box.note("npm--pdfkit.md")), ["[[puppeteer]]"]);
  valid(box.note("npm--pdfkit.md"));
});

test("--alternative on an existing note, without text: only the field changes, byte for byte; a target with a note is written by its file stem", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "puppeteer", "default for PDF rendering"]);
  await magpie(box, ["note", "pdfkit", "avoid: async streams painful"]);
  const path = box.note("npm--pdfkit.md");
  const before = readFileSync(path, "utf8").replace("status: reviewed\n", "status: reviewed   # mine\n") + "\nHand-written tail.\n";
  writeFileSync(path, before);
  const r = await magpie(box, ["note", "pdfkit", "--alternative", "puppeteer"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, "✔ Updated in your personal journal: pdfkit\n");
  assert.equal(readFileSync(path, "utf8"), before.replace("---\n\n## Verdict", 'alternatives: ["[[npm--puppeteer]]"]\n---\n\n## Verdict'));
});

test("--alternative takes a name, a PURL or a file stem; repeated, each is added in order", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "puppeteer", "ok"]);
  await magpie(box, ["note", "pkg:npm/pdf-lib"]);
  await magpie(box, ["note", "pkg:pypi/weasyprint"]);
  await magpie(box, ["note", "pdfkit", "--alternative", "pkg:npm/pdf-lib", "--alternative", "pypi--weasyprint", "--alternative", "Puppeteer"]);
  assert.deepEqual(alternativesOf(box.note("npm--pdfkit.md")), ["[[npm--pdf-lib]]", "[[pypi--weasyprint]]", "[[npm--puppeteer]]"]);
});

test("a PURL target is written as the file stem its note would have, so a note created later resolves it", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "avoid: async streams painful", "--alternative", "pkg:npm/puppeteer", "--alternative", "pkg:npm/%40babel/core"]);
  assert.deepEqual(alternativesOf(box.note("npm--pdfkit.md")), ["[[npm--puppeteer]]", "[[npm--babel--core]]"]);
  await magpie(box, ["note", "puppeteer", "default for PDF rendering in new projects"]);
  const [pdfkit] = JSON.parse((await magpie(box, ["recall", "pdfkit", "--json"])).out).matches;
  assert.deepEqual(pdfkit.alternatives[0], {
    name: "puppeteer", id: "pkg:npm/puppeteer", journal: "personal", verdict: "default for PDF rendering in new projects", status: "reviewed", avoid: false, path: box.note("npm--puppeteer.md"),
  });
  const again = JSON.parse((await magpie(box, ["note", "pdfkit", "--alternative", "npm--babel--core", "--json"])).out);
  assert.deepEqual(again.alternatives_present, ["npm--babel--core"], "the stem written for a PURL counts as there");
  assert.equal((await magpie(box, ["note", "pdfkit", "--alternative", "pkg:nope"])).code, 2, "a PURL that doesn't parse is a usage error");
});

test("an alternative already there, by its note or by its text (ignoring case), isn't added again; stderr says so, exit 0", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "puppeteer", "ok"]);
  await magpie(box, ["note", "pdfkit", "--alternative", "puppeteer", "--alternative", "wkhtmltopdf"]);
  const path = box.note("npm--pdfkit.md");
  const before = readFileSync(path, "utf8");
  const r = await magpie(box, ["note", "pdfkit", "--alternative", "npm--puppeteer", "--alternative", "WKHTMLTOPDF", "--alternative", "pkg:npm/puppeteer"]);
  assert.equal(r.code, 0);
  assert.equal(r.err, [
    "Already an alternative: npm--puppeteer",
    "Already an alternative: WKHTMLTOPDF",
    "Already an alternative: pkg:npm/puppeteer",
    "Already in your personal journal: pdfkit",
    "",
  ].join("\n"));
  assert.equal(readFileSync(path, "utf8"), before);
  const json = JSON.parse((await magpie(box, ["note", "pdfkit", "--alternative", "puppeteer", "--alternative", "pdf-lib", "--alternative", "PDF-LIB", "--json"])).out);
  assert.deepEqual([json.alternatives_added, json.alternatives_present], [["pdf-lib"], ["puppeteer", "PDF-LIB"]]);
});

test("--alternative with text for a note that has a Verdict: refused as before, exit 1, nothing written", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "first"]);
  const before = readFileSync(box.note("npm--pdfkit.md"), "utf8");
  const r = await magpie(box, ["note", "pdfkit", "second", "--alternative", "puppeteer"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /already has a Verdict/);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), before);
});

test("--alternative --to project resolves in the project journal: a note only in the personal journal is written as given", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "puppeteer", "ok"]);
  await magpie(box, ["note", "pdf-lib", "ok", "--to", "project"]);
  const r = await magpie(box, ["note", "pdfkit", "--to", "project", "--alternative", "puppeteer", "--alternative", "pdf-lib"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(alternativesOf(join(box.project, ".magpie", "notes", "npm--pdfkit.md")), ["[[puppeteer]]", "[[npm--pdf-lib]]"]);
});

test("--alternative that is a wikilink, has | or #, or is empty: a usage error (exit 2), nothing written", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  for (const target of ["[[puppeteer]]", "a|b", "a#b", " "]) {
    const r = await magpie(box, ["note", "pdfkit", "--alternative", target]);
    assert.equal(r.code, 2, target);
    assert.match(r.err, /--alternative takes a name, a PURL or a file stem/);
  }
  assert.equal(existsSync(box.note("npm--pdfkit.md")), false);
});

test("a note can't be its own alternative: exit 1, nothing written", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "ok"]);
  const before = readFileSync(box.note("npm--pdfkit.md"), "utf8");
  for (const target of ["pdfkit", "npm--pdfkit", "pkg:npm/pdfkit"]) {
    const r = await magpie(box, ["note", "pdfkit", "--alternative", target]);
    assert.equal(r.code, 1, target);
    assert.match(r.err, /pdfkit can't be an alternative to itself/);
  }
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), before);
});

// --- --use-when and --avoid-when: the user's own items ---

const sectionsOf = (path: string) => {
  const note = readNote(readFileSync(path, "utf8"));
  const body = (name: string) => note.sections.find((s) => s.name === name)?.body.trim() ?? "";
  return { use: body("Use when"), avoid: body("Avoid when") };
};
const hookInput = (command: string, cwd: string) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd });

test("--use-when and --avoid-when on a new note: human-written items, no draft marker; the result says RepoMagpie will ask", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const r = await magpie(box, ["note", "pdfkit", "fine for small docs", "--use-when", "a short invoice", "--use-when", "a receipt", "--avoid-when", "big PDFs"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, "✔ Saved to your personal journal: pdfkit\nRepoMagpie will ask before pdfkit is installed.\n");
  assert.deepEqual(sectionsOf(box.note("npm--pdfkit.md")), { use: "- a short invoice\n- a receipt", avoid: "- big PDFs" });
  valid(box.note("npm--pdfkit.md"));
  const json = await magpie(box, ["note", "zod", "--use-when", "API input", "--json"]);
  assert.deepEqual(JSON.parse(json.out).sections_changed, ["use_when"]);
  assert.equal(readNote(readFileSync(box.note("npm--zod.md"), "utf8")).status, "inbox"); // items without a Verdict: still inbox
});

test("an existing note: an empty section gets the items; one with items keeps every line and gets only the new ones", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "ok"]);
  const r = await magpie(box, ["note", "pdfkit", "--use-when", "invoices", "--json"]);
  assert.equal(r.code, 0, r.err);
  const doc = JSON.parse(r.out);
  assert.deepEqual([doc.created, doc.sections_changed, doc.drafts_replaced, doc.items_present], [false, ["use_when"], [], []]);
  const path = box.note("npm--pdfkit.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("- invoices\n", "- invoices   <!-- mine -->\nA line I wrote by hand.\n"));
  const before = readFileSync(path, "utf8");
  const again = await magpie(box, ["note", "pdfkit", "--use-when", "INVOICES", "--use-when", "receipts"]);
  assert.equal(again.code, 0, again.err);
  assert.match(again.err, /Already in the note: INVOICES\n/);
  assert.equal(readFileSync(path, "utf8"), before.replace("A line I wrote by hand.\n", "A line I wrote by hand.\n- receipts\n"));
});

// "```chalk``` is fine" renders as inline code on GitHub but opens a fence for RepoMagpie,
// so an Avoid when section added after it would be inside the fence and never ask.
test("an Avoid when item that would land inside a fence that doesn't close is refused: no file change, no \"will ask\"", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "chalk", "--json"]);
  const path = box.note("npm--chalk.md");
  const text = readFileSync(path, "utf8").replace(/## Use when\n/, "## Use when\n```chalk``` is fine for colours\n").replace(/## Avoid when\n[^#]*/, "");
  writeFileSync(path, text);
  const r = await magpie(box, ["note", "chalk", "--avoid-when", "never in production"]);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /"Avoid when" section would be inside a code fence or comment that doesn't close earlier in the note, so nothing was written/);
  assert.doesNotMatch(r.err, /will ask/);
  assert.equal(readFileSync(path, "utf8"), text);
});

test("an existing note with a drafted Use when: the user's items replace the draft", async () => {
  const drafted = renderNote({ id: "pkg:npm/pdfkit", name: "pdfkit", explored: "2026-10-24", kind: "library", tags: [], useWhen: ["an agent's guess"], drafts: ["Use when"] });
  const box = sandbox({ "project/package.json": "{}", "journal/notes/npm--pdfkit.md": drafted });
  const r = await magpie(box, ["note", "pdfkit", "--use-when", "invoices", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(r.out).drafts_replaced, ["use_when"]);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), drafted.replace("<!-- magpie:draft -->\n- an agent's guess\n", "- invoices\n"));
  const human = await magpie(box, ["note", "pdfkit", "--use-when", "receipts"]);
  assert.doesNotMatch(human.err, /replaced the draft/);
});

test("the items work with an existing Verdict; with Verdict text too it's exit 1 and nothing is written", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "first"]);
  const path = box.note("npm--pdfkit.md");
  const before = readFileSync(path, "utf8");
  const refused = await magpie(box, ["note", "pdfkit", "second", "--use-when", "invoices", "--avoid-when", "big PDFs"]);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /This note already has a Verdict/);
  assert.doesNotMatch(refused.err, /will ask/);
  assert.equal(readFileSync(path, "utf8"), before);
  const added = await magpie(box, ["note", "pdfkit", "--use-when", "invoices"]);
  assert.equal(added.code, 0, added.err);
  assert.equal(readNote(readFileSync(path, "utf8")).verdict, "first");
  assert.deepEqual(sectionsOf(path).use, "- invoices");
});

test("--avoid-when turns the hook's answer into an ask (decision 0024)", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "fine for small docs"]);
  const quiet = await magpie(box, ["hook", "claude-code"], { stdin: async () => hookInput("npm i pdfkit", box.project) });
  assert.notEqual(quiet.out && JSON.parse(quiet.out).hookSpecificOutput?.permissionDecision, "ask");
  const r = await magpie(box, ["note", "pdfkit", "--avoid-when", "big PDFs"]);
  assert.match(r.err, /RepoMagpie will ask before pdfkit is installed\./);
  const asked = await magpie(box, ["hook", "claude-code"], { stdin: async () => hookInput("npm i pdfkit", box.project) });
  assert.equal(JSON.parse(asked.out).hookSpecificOutput.permissionDecision, "ask");
  assert.match(JSON.parse(asked.out).hookSpecificOutput.permissionDecisionReason, /big PDFs/);
});

test("a section the edit can't safely reach: exit 1, the file is named, the note is unchanged (the Verdict too)", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit"]);
  const path = box.note("npm--pdfkit.md");
  writeFileSync(path, `${readFileSync(path, "utf8")}\n## Use when\n- a second section\n`);
  const before = readFileSync(path, "utf8");
  const r = await magpie(box, ["note", "pdfkit", "my verdict", "--use-when", "invoices"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /"Use when" section appears more than once/);
  assert.equal(r.out, `${path}\n`);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("caps: an item is one line of at most 500 characters, at most 20 a flag; blank is refused; exit 2, nothing written", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  for (const args of [
    ["--use-when", "x".repeat(501)],
    ["--avoid-when", "two\nlines"],
    ["--use-when", "   "],
    Array.from({ length: 21 }, (_, k) => ["--use-when", `item ${k}`]).flat(),
  ]) {
    const r = await magpie(box, ["note", "pdfkit", ...args]);
    assert.equal(r.code, 2, args[1]);
    assert.match(r.err, /--(use|avoid)-when takes/);
  }
  assert.equal(existsSync(box.note("npm--pdfkit.md")), false);
  const r = await magpie(box, ["note", "pdfkit", "--use-when", "x".repeat(500)]);
  assert.equal(r.code, 0, r.err);
});

test("hostile characters in an item are kept in the file, as in a Verdict, and shown as markers in output", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const rlo = String.fromCharCode(0x202e);
  const bell = String.fromCharCode(0x07);
  const r = await magpie(box, ["note", "pdfkit", "--use-when", `invoices ${rlo}fdp${bell}`, "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(sectionsOf(box.note("npm--pdfkit.md")).use, `- invoices ${rlo}fdp${bell}`);
  const again = await magpie(box, ["note", "pdfkit", "--use-when", `INVOICES ${rlo}FDP${bell}`, "--json"]);
  assert.deepEqual(JSON.parse(again.out).items_present, ["INVOICES <U+202E>FDP<U+0007>"]);
  const recall = await magpie(box, ["recall", "pdfkit", "--json"]);
  assert.deepEqual(JSON.parse(recall.out).matches[0].use_when, ["invoices <U+202E>fdp<U+0007>"]);
});

test("--to project follows the same rules, and a GitHub URL keeps its drafted What it does next to the user's items", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const r = await magpie(box, ["note", "pdfkit", "--to", "project", "--avoid-when", "big PDFs"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(sectionsOf(join(box.project, ".magpie", "notes", "npm--pdfkit.md")).avoid, "- big PDFs");
  const url = await magpie(box, ["note", PLAYWRIGHT_URL, "--use-when", "browser checks from a script"], { fetch: playwright() });
  assert.equal(url.code, 0, url.err);
  const note = readNote(readFileSync(box.note("github--microsoft--playwright-cli.md"), "utf8"));
  assert.deepEqual(note.sections.filter((s) => s.draft).map((s) => s.name), ["What it does"]);
  assert.equal(note.sections.find((s) => s.name === "Use when")?.body.trim(), "- browser checks from a script");
});

// --- --domain: the user's domains (decision 0040) ---

test("a new note from a GitHub URL gets domains_suggested from its tags; --domain writes domains instead", async () => {
  const box = sandbox();
  await magpie(box, ["note", PLAYWRIGHT_URL], { fetch: playwright() });
  const suggested = readNote(readFileSync(box.note("github--microsoft--playwright-cli.md"), "utf8")).frontmatter;
  assert.deepEqual([suggested.domains, suggested.domains_suggested], [undefined, ["testing"]]);

  const other = sandbox();
  const r = await magpie(other, ["note", PLAYWRIGHT_URL, "--domain", "testing", "--domain", "tooling", "--json"], { fetch: playwright() });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(r.out).domains_added, ["testing", "tooling"]);
  const fm = readNote(readFileSync(other.note("github--microsoft--playwright-cli.md"), "utf8")).frontmatter;
  assert.deepEqual([fm.domains, fm.domains_suggested], [["testing", "tooling"], undefined]);
  assert.match(readFileSync(other.note("github--microsoft--playwright-cli.md"), "utf8"), /^tags: \[playwright\]\ndomains: \[testing, tooling\]\n/m);
  valid(other.note("github--microsoft--playwright-cli.md"));
});

test("--domain on an existing note confirms a suggestion: it moves from domains_suggested to domains; nothing else changes", async () => {
  const box = sandbox();
  await magpie(box, ["note", PLAYWRIGHT_URL], { fetch: playwright() });
  const path = box.note("github--microsoft--playwright-cli.md");
  const before = readFileSync(path, "utf8");
  const r = await magpie(box, ["note", "pkg:github/microsoft/playwright-cli", "--domain", "testing", "--json"], { fetch: playwright() });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(r.out).domains_added, ["testing"]);
  assert.equal(readFileSync(path, "utf8"), before.replace("domains_suggested: [testing]\n", "domains: [testing]\ndomains_suggested: []\n"));
  const again = await magpie(box, ["note", "pkg:github/microsoft/playwright-cli", "--domain", "testing", "--json"], { fetch: playwright() });
  assert.deepEqual(JSON.parse(again.out).domains_added, []);
});

test("--domain takes one of the 12 domains, at most 3: otherwise a usage error and nothing written", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const unknown = await magpie(box, ["note", "pdfkit", "--domain", "pdfs"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /--domain takes one of: .*security.* Not a domain: "pdfs"\./);
  const many = await magpie(box, ["note", "pdfkit", "--domain", "styling", "--domain", "api", "--domain", "tooling", "--domain", "testing"]);
  assert.equal(many.code, 2);
  assert.match(many.err, /at most 3 domains/);
  assert.equal(existsSync(box.note("npm--pdfkit.md")), false);
});

test("--domain on a note that already has 3 domains: refused with a warning, exit 1, the file unchanged", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["note", "pdfkit", "fine", "--domain", "styling", "--domain", "api", "--domain", "tooling"]);
  const before = readFileSync(box.note("npm--pdfkit.md"), "utf8");
  const r = await magpie(box, ["note", "pdfkit", "--domain", "testing"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /at most 3 domains/);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), before);
});
