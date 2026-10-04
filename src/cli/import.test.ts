import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { fakeFetch, recorded } from "../core/fixtures/fake-fetch.ts";
import type { Fetch } from "../core/github.ts";
import { readNote, validate } from "../core/note.ts";
import { magpie, sandbox, type Box } from "./fixtures/sandbox.ts";

// magpie import <file> (spec §2), in temporary journals with recorded GitHub responses.

const playwright = () => fakeFetch(recorded("microsoft--playwright-cli"));
const valid = (path: string) => assert.deepEqual(validate(readNote(readFileSync(path, "utf8")), { fileName: parse(path).base }), []);

function importFile(box: Box, lines: string[]): string {
  const file = join(box.project, "import.md");
  writeFileSync(file, lines.join("\n"));
  return "import.md"; // relative to the working directory
}

const LIST = [
  "# Repositories I looked at", // 1: ignored
  "", // 2
  "- https://github.com/microsoft/playwright-cli — verdict: default for browser checks | use: agent-driven UI tests", // 3
  "- pdfkit -- avoid: large streamed reports | tried it in 2025", // 4
  "Some prose in between.", // 5
  "- pkg:cargo/ripgrep", // 6
];

test("every item becomes a note; --json reports each line and the counts exactly", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const r = await magpie(box, ["import", importFile(box, LIST), "--json"], { fetch: playwright() });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, "");
  assert.deepEqual(JSON.parse(r.out), {
    items: [
      { line: 3, id: "pkg:github/microsoft/playwright-cli", result: "created", error: null, warnings: [] },
      { line: 4, id: "pkg:npm/pdfkit", result: "created", error: null, warnings: [] },
      { line: 6, id: "pkg:cargo/ripgrep", result: "created", error: null, warnings: [] },
    ],
    created: 3,
    updated: 0,
    failed: 0,
  });
  for (const file of ["github--microsoft--playwright-cli.md", "npm--pdfkit.md", "cargo--ripgrep.md"]) valid(box.note(file));
});

test("verdict: is the Verdict; use: and avoid: are drafts; unlabelled text goes to My notes", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  await magpie(box, ["import", importFile(box, LIST)], { fetch: playwright() });
  const repo = readNote(readFileSync(box.note("github--microsoft--playwright-cli.md"), "utf8"));
  assert.equal(repo.verdict, "default for browser checks");
  assert.equal(repo.frontmatter.status, "reviewed");
  const useWhen = repo.sections.find((s) => s.name === "Use when");
  assert.equal(useWhen?.draft, true);
  assert.match(useWhen?.body ?? "", /- agent-driven UI tests/);

  const pdfkit = readNote(readFileSync(box.note("npm--pdfkit.md"), "utf8"));
  assert.equal(pdfkit.frontmatter.status, "inbox");
  assert.equal(pdfkit.sections.find((s) => s.name === "Avoid when")?.draft, true);
  assert.equal(pdfkit.sections.find((s) => s.name === "My notes")?.body.trim(), "tried it in 2025");
});

test("human output: one result line per item on stdout; errors, warnings and the summary on stderr", async () => {
  const box = sandbox();
  const file = importFile(box, ["- pkg:npm/pdfkit — verdict: ok", "- https://example.com/article", "- pkg:npm/chalk"]);
  const r = await magpie(box, ["import", file]);
  assert.equal(r.code, 1);
  assert.equal(r.out, "line 1: created pkg:npm/pdfkit\nline 2: failed https://example.com/article\nline 3: created pkg:npm/chalk\n");
  assert.match(r.err, /^line 2: Not a supported input/m);
  assert.match(r.err, /^2 created, 0 updated, 0 unchanged, 1 failed\.$/m);
});

test("one bad line never stops the rest: unparsable, unsupported, ambiguous and unknown repositories fail; others are saved", async () => {
  const box = sandbox(); // no manifest: a bare name is ambiguous
  const file = importFile(box, [
    "- — verdict: no target",
    "- https://example.com/article",
    "- requests — verdict: ok",
    "- https://github.com/nobody/nothing",
    "- pkg:npm/pdfkit — verdict: fine",
  ]);
  const r = await magpie(box, ["import", file, "--json"]);
  assert.equal(r.code, 1);
  const json = JSON.parse(r.out);
  assert.deepEqual(json.items.map((i: { result: string }) => i.result), ["failed", "failed", "failed", "failed", "created"]);
  assert.deepEqual([json.created, json.updated, json.failed], [1, 0, 4]);
  assert.equal(json.items[0].id, null);
  assert.match(json.items[0].error, /No package or URL/);
  assert.match(json.items[2].error, /requests could be npm, pypi, cargo; write a PURL instead, such as pkg:npm\/requests/);
  assert.equal(json.items[3].id, "pkg:github/nobody/nothing");
  assert.match(json.items[3].error, /GitHub has no repository/);
  assert.ok(existsSync(box.note("npm--pdfkit.md")));
});

test("existing notes: a second verdict fails; use:, avoid: and unlabelled text are ignored with a warning", async () => {
  const box = sandbox();
  await magpie(box, ["note", "pkg:npm/pdfkit", "first"]);
  await magpie(box, ["note", "pkg:npm/chalk"]);
  const before = readFileSync(box.note("npm--pdfkit.md"), "utf8");
  const file = importFile(box, ["- pkg:npm/pdfkit — verdict: second", "- pkg:npm/chalk — use: colours | my words", "- pkg:npm/chalk — verdict: colours in the terminal"]);
  const r = await magpie(box, ["import", file]);
  assert.equal(r.code, 1);
  assert.equal(r.out, "line 1: failed pkg:npm/pdfkit\nline 2: unchanged pkg:npm/chalk\nline 3: updated pkg:npm/chalk\n");
  assert.match(r.err, /^line 1: This note already has a Verdict/m);
  assert.match(r.err, /^line 2: warning: .*use:, avoid: and unlabelled text were ignored/m);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), before);
  assert.equal(readNote(readFileSync(box.note("npm--chalk.md"), "utf8")).verdict, "colours in the terminal");
});

test("--json carries each line's warnings: ignored text for an existing note, a failed fetch", async () => {
  const box = sandbox();
  await magpie(box, ["note", "pkg:npm/chalk"]);
  const offline: Fetch = (() => Promise.reject(new TypeError("fetch failed"))) as Fetch;
  const file = importFile(box, ["- pkg:npm/chalk — use: colours", "- https://github.com/microsoft/playwright-cli"]);
  const r = await magpie(box, ["import", file, "--json"], { fetch: offline });
  assert.equal(r.code, 0);
  const [chalk, repo] = JSON.parse(r.out).items;
  assert.equal(chalk.result, "unchanged");
  assert.match(chalk.warnings[0], /use:, avoid: and unlabelled text were ignored/);
  assert.equal(repo.result, "created");
  assert.match(repo.warnings[0], /Couldn't fetch GitHub metadata/);
});

test("a later line finds the note an earlier line created", async () => {
  const box = sandbox();
  const r = await magpie(box, ["import", importFile(box, ["- pkg:npm/pdfkit", "- pkg:npm/pdfkit — verdict: ok"]), "--json"]);
  assert.deepEqual(JSON.parse(r.out).items.map((i: { result: string }) => i.result), ["created", "updated"]);
});

test("--dry-run reports what would happen and writes nothing", async () => {
  const box = sandbox({ "project/package.json": "{}" });
  const r = await magpie(box, ["import", importFile(box, LIST), "--dry-run"], { fetch: playwright() });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^line 3: created pkg:github\/microsoft\/playwright-cli$/m);
  assert.match(r.err, /^Dry run: nothing was written\.$/m);
  assert.equal(existsSync(box.journal), false); // no notes, no tags.md
});

test("--dry-run gives the same results as a real run when lines repeat a subject", async () => {
  const box = sandbox();
  const lines = ["- pkg:npm/pdfkit", "- pkg:npm/pdfkit — verdict: first", "- pkg:npm/pdfkit — verdict: second"];
  const dry = await magpie(box, ["import", importFile(box, lines), "--dry-run", "--json"]);
  const real = await magpie(box, ["import", importFile(box, lines), "--json"]);
  assert.deepEqual(JSON.parse(dry.out), JSON.parse(real.out));
  assert.deepEqual(JSON.parse(real.out).items.map((i: { result: string }) => i.result), ["created", "updated", "failed"]);
});

test("a GitHub line while offline is saved without metadata, with a warning; exit 0", async () => {
  const box = sandbox();
  const offline: Fetch = (() => Promise.reject(new TypeError("fetch failed"))) as Fetch;
  const r = await magpie(box, ["import", importFile(box, ["- https://github.com/microsoft/playwright-cli — verdict: ok"])], { fetch: offline });
  assert.equal(r.code, 0);
  assert.match(r.err, /^line 1: warning: Couldn't fetch GitHub metadata/m);
  valid(box.note("github--microsoft--playwright-cli.md"));
});

test("--to project writes to the project journal and says it created it", async () => {
  const box = sandbox();
  const r = await magpie(box, ["import", importFile(box, ["- pkg:npm/pdfkit"]), "--to", "project"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /^Created the project journal: /m);
  assert.ok(existsSync(join(box.project, ".magpie", "notes", "npm--pdfkit.md")));
});

test("a file that can't be read: exit 1; --json gives empty items, zero counts and the error", async () => {
  const box = sandbox();
  const r = await magpie(box, ["import", "missing.md", "--json"]);
  assert.equal(r.code, 1);
  const json = JSON.parse(r.out);
  assert.deepEqual({ ...json, error: typeof json.error }, { items: [], created: 0, updated: 0, failed: 0, error: "string" });
  assert.match(json.error, /missing\.md/);
  const human = await magpie(box, ["import", "missing.md"]);
  assert.match(human.err, /^magpie import: Can't read /m);
});

test("the personal-journal guard applies to import --to project", async () => {
  const box = sandbox({ "home/.git/": null });
  const r = await magpie(box, ["import", join(box.root, "list.md"), "--to", "project"], { cwd: box.home, env: {} });
  assert.equal(r.code, 1);
  assert.match(r.err, /is your personal journal/);
});

test("a file without items: a hint on stderr, exit 0", async () => {
  const box = sandbox();
  const r = await magpie(box, ["import", importFile(box, ["# nothing here", "* not an item"])]);
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
  assert.match(r.err, /No items found/);
});
