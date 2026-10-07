import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { installCommand, runAdopt } from "./adopt.ts";
import { fakeFetch } from "./fixtures/fake-fetch.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Context } from "./save.ts";
import { renderNote, type NewNote } from "./write.ts";

// magpie adopt (spec §2): copy a personal note into the project journal, print the install command,
// never install anything. Scratch folders only.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-03", kind: "library", tags: ["pdf"], ...n });

const PDFKIT = note({ id: "pkg:npm/pdfkit", verdict: "fine for invoices", avoidWhen: ["you need streamed output"] });
const PLAYWRIGHT = note({ id: "pkg:github/microsoft/playwright-cli", name: "microsoft/playwright-cli", kind: "cli", packages: ["pkg:npm/%40playwright/cli"] });

// A scratch folder with home/, journal/ (the personal journal) and project/ (a git root).
function place(files: Record<string, string | null> = {}) {
  const root = scratchBase("adopt");
  for (const [path, content] of Object.entries({ "home/": null, "project/.git/": null, ...files })) {
    const full = join(root, path);
    if (content === null) mkdirSync(full, { recursive: true });
    else {
      mkdirSync(parse(full).dir, { recursive: true });
      writeFileSync(full, content);
    }
  }
  const project = join(root, "project");
  const context: Context = { home: join(root, "home"), env: { MAGPIE_HOME: join(root, "journal") }, cwd: project, fetch: fakeFetch({}), today: () => "2026-10-06" };
  return { root, project, context, personal: (file: string) => join(root, "journal", "notes", file), copy: (file: string) => join(project, ".magpie", "notes", file) };
}

const adopted = (text: string, date = "2026-10-06") => text.replace(/\n---\n/, `\nadopted: ${date}\n---\n`);

test("copies the note unchanged except adopted: <today>, and creates the project journal", async () => {
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT, "project/package.json": "{}" });
  const run = await runAdopt({ target: "pdfkit" }, p.context);
  assert.equal(run.outcome, "ok");
  assert.deepEqual(run.document, { id: "pkg:npm/pdfkit", from: p.personal("npm--pdfkit.md"), to: p.copy("npm--pdfkit.md"), install: "npm install pdfkit", install_choices: [] });
  assert.equal(readFileSync(p.copy("npm--pdfkit.md"), "utf8"), adopted(PDFKIT));
  assert.equal(readFileSync(p.personal("npm--pdfkit.md"), "utf8"), PDFKIT, "the personal note is unchanged");
  assert.equal(readFileSync(join(p.project, ".magpie", ".gitignore"), "utf8"), ".cache/\n");
  assert.ok(existsSync(join(p.project, ".magpie", "tags.md")), "a new journal gets the starter tag list");
  assert.deepEqual(run.notices, [`Created the project journal: ${join(p.project, ".magpie")}`]);
  assert.equal(run.name, "pdfkit");
});

test("a note with comments and an unusual layout is copied byte for byte, apart from the new field", async () => {
  const text = "---\n# my note\nid: pkg:npm/pdfkit   # the id\nname: pdfkit\nexplored: 2026-10-03\nkind: library\ntags: [pdf]\ntried: true\nrating: 4\nstatus: reviewed\n---\n\n## Verdict\nfine\n\n## Benchmarks\n<!-- mine -->\nfast enough\n";
  const p = place({ "journal/notes/npm--pdfkit.md": text, "project/package.json": "{}" });
  await runAdopt({ target: "pkg:npm/pdfkit" }, p.context);
  assert.equal(readFileSync(p.copy("npm--pdfkit.md"), "utf8"), adopted(text));
});

test("an existing project journal is used as it is, and is not announced", async () => {
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT, "project/.magpie/notes/npm--chalk.md": note({ id: "pkg:npm/chalk" }), "project/package.json": "{}" });
  const run = await runAdopt({ target: "pdfkit" }, p.context);
  assert.equal(run.outcome, "ok");
  assert.deepEqual(run.notices, []);
  assert.equal(existsSync(join(p.project, ".magpie", "tags.md")), false, "an existing journal never gets a tags.md");
});

test("a name the note lists in packages finds the repository note; the install command is for that package", async () => {
  const p = place({ "journal/notes/github--microsoft--playwright-cli.md": PLAYWRIGHT, "project/package.json": "{}", "project/pnpm-lock.yaml": "" });
  const run = await runAdopt({ target: "@playwright/cli" }, p.context);
  assert.deepEqual(run.document, {
    id: "pkg:github/microsoft/playwright-cli",
    from: p.personal("github--microsoft--playwright-cli.md"),
    to: p.copy("github--microsoft--playwright-cli.md"),
    install: "pnpm add @playwright/cli",
    install_choices: [],
  });
});

test("a repository note with exactly one package: the install command is for that package", async () => {
  const p = place({ "journal/notes/github--microsoft--playwright-cli.md": PLAYWRIGHT, "project/yarn.lock": "" });
  const run = await runAdopt({ target: "https://github.com/microsoft/playwright-cli" }, p.context);
  assert.equal(run.outcome, "ok");
  assert.equal(run.document.install, "yarn add @playwright/cli");
  assert.deepEqual(run.document.install_choices, []);
});

test("a repository note with several packages: no single command; one per package to choose from", async () => {
  const several = note({ id: "pkg:github/acme/tool", name: "acme/tool", packages: ["pkg:npm/acme-tool", "pkg:pypi/acme-tool", "pkg:cargo/acme-tool"] });
  const p = place({ "journal/notes/github--acme--tool.md": several, "project/pnpm-lock.yaml": "", "project/uv.lock": "" });
  const run = await runAdopt({ target: "pkg:github/acme/tool" }, p.context);
  assert.equal(run.outcome, "ok");
  assert.equal(run.document.install, null);
  assert.deepEqual(run.document.install_choices, ["pnpm add acme-tool", "uv add acme-tool", "cargo add acme-tool"]);
});

test("a repository note without packages has no install command; the run gives its URL instead", async () => {
  const bare = note({ id: "pkg:github/mattpocock/skills", name: "mattpocock/skills", kind: "skill-pack" });
  const p = place({ "journal/notes/github--mattpocock--skills.md": bare });
  const run = await runAdopt({ target: "pkg:github/mattpocock/skills" }, p.context);
  assert.equal(run.outcome, "ok");
  assert.equal(run.document.install, null);
  assert.deepEqual(run.document.install_choices, []);
  assert.equal(run.url, "https://github.com/mattpocock/skills");
});

test("a Verdict that says to avoid: the note is still copied, but no install command is named", async () => {
  const avoid = note({ id: "pkg:npm/pdfkit", verdict: "Avoid: async streams painful; use puppeteer" });
  const p = place({ "journal/notes/npm--pdfkit.md": avoid, "project/package.json": "{}" });
  const run = await runAdopt({ target: "pdfkit" }, p.context);
  assert.equal(run.outcome, "ok");
  assert.deepEqual(run.document, { id: "pkg:npm/pdfkit", from: p.personal("npm--pdfkit.md"), to: p.copy("npm--pdfkit.md"), install: null, install_choices: [] });
  assert.equal(run.avoid, true);
  assert.equal(readFileSync(p.copy("npm--pdfkit.md"), "utf8"), adopted(avoid));

  const several = note({ id: "pkg:github/acme/tool", name: "acme/tool", verdict: "avoid", packages: ["pkg:npm/acme-tool", "pkg:pypi/acme-tool"] });
  const q = place({ "journal/notes/github--acme--tool.md": several });
  const repository = await runAdopt({ target: "pkg:github/acme/tool" }, q.context);
  assert.deepEqual([repository.document.install, repository.document.install_choices, repository.avoid], [null, [], true]);
});

test("Avoid when text alone, or a Verdict that only mentions avoiding, still names the install command", async () => {
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT, "project/package.json": "{}" });
  const run = await runAdopt({ target: "pdfkit" }, p.context);
  assert.deepEqual([run.document.install, run.avoid], ["npm install pdfkit", false]);

  const q = place({ "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: "avoidable overhead, but fine" }), "project/package.json": "{}" });
  assert.equal((await runAdopt({ target: "pdfkit" }, q.context)).document.install, "npm install pdfkit");
});

test("a note already in the project journal: nothing changes, exit 1 with its path", async () => {
  const project = note({ id: "pkg:npm/pdfkit", verdict: "the team's verdict" });
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT, "project/.magpie/notes/npm--pdfkit.md": project, "project/package.json": "{}" });
  const run = await runAdopt({ target: "pdfkit" }, p.context);
  assert.equal(run.outcome, "failed");
  assert.deepEqual(run.document, { id: "pkg:npm/pdfkit", from: p.personal("npm--pdfkit.md"), to: p.copy("npm--pdfkit.md"), install: null, install_choices: [], error: `Already in this project: ${p.copy("npm--pdfkit.md")}` });
  assert.equal(readFileSync(p.copy("npm--pdfkit.md"), "utf8"), project);
});

test("a project note for one of the note's packages also counts as already there (schema rule 6)", async () => {
  const project = note({ id: "pkg:npm/%40playwright/cli", name: "@playwright/cli" });
  const p = place({ "journal/notes/github--microsoft--playwright-cli.md": PLAYWRIGHT, "project/.magpie/notes/npm--playwright--cli.md": project });
  const run = await runAdopt({ target: "pkg:github/microsoft/playwright-cli" }, p.context);
  assert.equal(run.outcome, "failed");
  assert.equal(run.document.error, `Already in this project: ${p.copy("npm--playwright--cli.md")}`);
  assert.equal(existsSync(p.copy("github--microsoft--playwright-cli.md")), false);
});

test("a file at the copy's name that holds another note, or no readable id, is never overwritten", async () => {
  const unreadable = "no frontmatter here\n";
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT, "project/.magpie/notes/npm--pdfkit.md": unreadable, "project/package.json": "{}" });
  const run = await runAdopt({ target: "pdfkit" }, p.context);
  assert.equal(run.outcome, "failed");
  assert.match(run.document.error ?? "", /has no readable id/);
  assert.equal(readFileSync(p.copy("npm--pdfkit.md"), "utf8"), unreadable);

  const crate = note({ id: "pkg:cargo/Inflector", name: "Inflector" });
  const q = place({ "journal/notes/cargo--inflector.md": crate, "project/.magpie/notes/cargo--inflector.md": note({ id: "pkg:cargo/inflector" }) });
  const clash = await runAdopt({ target: "pkg:cargo/Inflector" }, q.context);
  assert.equal(clash.outcome, "failed");
  assert.match(clash.document.error ?? "", /pkg:cargo\/Inflector and pkg:cargo\/inflector map to the same file/);
});

test("no note in the personal journal: exit 1, nothing written", async () => {
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT, "project/package.json": "{}" });
  const run = await runAdopt({ target: "chalk" }, p.context);
  assert.equal(run.outcome, "failed");
  assert.deepEqual(run.document, { id: null, from: null, to: null, install: null, install_choices: [], error: "Your personal journal has no note for pkg:npm/chalk. Write one first with magpie note pkg:npm/chalk." });
  assert.equal(existsSync(join(p.project, ".magpie")), false);
});

test("a bare name the manifests don't settle needs --type (exit 2); with it, the note is found", async () => {
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const run = await runAdopt({ target: "pdfkit" }, p.context);
  assert.equal(run.outcome, "usage");
  assert.match(run.document.error ?? "", /--type/);
  assert.equal((await runAdopt({ target: "pdfkit", type: "npm" }, p.context)).outcome, "ok");
});

test("the project journal's guards: never the personal journal, never the home directory's .magpie", async () => {
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const intoPersonal = await runAdopt({ target: "pkg:npm/pdfkit" }, { ...p.context, projectFlag: join(p.root, "journal") });
  assert.equal(intoPersonal.outcome, "failed");
  assert.match(intoPersonal.document.error ?? "", /is your personal journal/);

  const atHome = await runAdopt({ target: "pkg:npm/pdfkit" }, { ...p.context, cwd: p.context.home });
  assert.equal(atHome.outcome, "failed");
  assert.match(atHome.document.error ?? "", /is reserved for the default personal journal/);
  assert.equal(existsSync(join(p.context.home, ".magpie")), false);
});

test("never installs anything: only .magpie/ appears in the project", async () => {
  const p = place({ "journal/notes/npm--pdfkit.md": PDFKIT, "project/package.json": "{}" });
  const before = readdirSync(p.project).sort();
  await runAdopt({ target: "pdfkit" }, p.context);
  assert.deepEqual(readdirSync(p.project).sort(), [...before, ".magpie"].sort());
  assert.equal(readFileSync(join(p.project, "package.json"), "utf8"), "{}");
});

test("the install command follows the PURL type and the project's lockfile", () => {
  const cases: [string, string[], string | null][] = [
    ["pkg:npm/commander", [], "npm install commander"],
    ["pkg:npm/commander", ["package-lock.json"], "npm install commander"],
    ["pkg:npm/commander", ["pnpm-lock.yaml"], "pnpm add commander"],
    ["pkg:npm/commander", ["yarn.lock"], "yarn add commander"],
    ["pkg:npm/commander", ["bun.lock"], "bun add commander"],
    ["pkg:npm/commander", ["bun.lockb"], "bun add commander"],
    ["pkg:npm/commander", ["yarn.lock", "pnpm-lock.yaml"], "pnpm add commander"],
    ["pkg:npm/%40playwright/cli", [], "npm install @playwright/cli"],
    ["pkg:pypi/requests", [], "pip install requests"],
    ["pkg:pypi/requests", ["uv.lock"], "uv add requests"],
    ["pkg:cargo/serde", ["Cargo.lock"], "cargo add serde"],
    ["pkg:github/microsoft/playwright-cli", ["pnpm-lock.yaml"], null],
  ];
  for (const [purl, lockfiles, expected] of cases) {
    const root = scratchBase("lock");
    for (const file of lockfiles) writeFileSync(join(root, file), "");
    assert.equal(installCommand(purl, root), expected, `${purl} with ${lockfiles.join(", ") || "no lockfile"}`);
  }
});
