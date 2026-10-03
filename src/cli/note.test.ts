import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { fakeFetch, recorded, type Call } from "../core/fixtures/fake-fetch.ts";
import type { Fetch } from "../core/github.ts";
import { readNote, validate } from "../core/note.ts";
import { run, type Io } from "./program.ts";

// Every test gets its own temporary home, journal and project; the real home is never used,
// and fetch answers from recorded responses only.
const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function sandbox(files: Record<string, string | null> = {}) {
  const root = mkdtempSync(join(tmpdir(), "magpie-note-"));
  roots.push(root);
  for (const [path, content] of Object.entries({ "home/": null, "project/.git/": null, ...files })) {
    const full = join(root, path);
    if (content === null) mkdirSync(full, { recursive: true });
    else {
      mkdirSync(parse(full).dir, { recursive: true });
      writeFileSync(full, content);
    }
  }
  return {
    root,
    journal: join(root, "journal"),
    home: join(root, "home"),
    project: join(root, "project"),
    note: (name: string) => join(root, "journal", "notes", name),
  };
}

type Box = ReturnType<typeof sandbox>;

async function magpie(box: Box, argv: string[], over: Partial<Io> = {}) {
  let out = "";
  let err = "";
  const io: Io = {
    out: (s) => { out += s; },
    err: (s) => { err += s; },
    env: { MAGPIE_HOME: box.journal },
    cwd: box.project,
    home: box.home,
    fetch: fakeFetch({}),
    today: () => "2026-10-04",
    interactive: false,
    ask: () => Promise.reject(new Error("no prompt expected")),
    ...over,
  };
  const code = await run(argv, io);
  return { code, out, err };
}

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
