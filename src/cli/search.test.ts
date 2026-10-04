import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_FILE } from "../core/search-index.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// magpie search (spec §2, §5, §8) in temporary journals.

const note = (n: Partial<NewNote> & { id: string; name: string }) => renderNote({ explored: "2026-10-04", kind: "library", tags: [], ...n });

const FILES = {
  "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", name: "pdfkit", tags: ["pdf"], verdict: "avoid: async streams painful; use puppeteer" }),
  "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib", name: "pdf-lib", tags: ["pdf"] }),
  "journal/notes/github--mattpocock--skills.md": note({ id: "pkg:github/mattpocock/skills", name: "mattpocock/skills", kind: "skill-pack", tags: ["workflow"], skills: ["tdd"] })
    .replace("- `tdd` —", "- `tdd` — red-green-refactor with an agent"),
  "project/.magpie/notes/npm--puppeteer.md": note({ id: "pkg:npm/puppeteer", name: "puppeteer", tags: ["pdf"], verdict: "default for PDF rendering in new projects" }),
};

test("results go to stdout, one line each, Verdict first; nothing on stderr", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["search", "pdf"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, "");
  const lines = r.out.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^1  (pdfkit|puppeteer)\s+npm\s+(personal|project)\s+Verdict: /);
  assert.match(lines[2], /^3  pdf-lib\s+npm\s+personal\s+\[inbox\] no verdict yet$/);
  assert.ok(lines.some((line) => /puppeteer\s+npm\s+project\s+Verdict: default for PDF rendering in new projects$/.test(line)));
});

test("a skill result shows its note, the skill and the skill line's text", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["search", "refactor"]);
  assert.match(r.out, /^1  mattpocock\/skills › tdd\s+github\s+personal\s+Skill: red-green-refactor with an agent$/m);
});

test("--json prints exactly the spec's document", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["search", "refactor", "--json"]);
  assert.equal(r.err, "");
  const json = JSON.parse(r.out);
  assert.deepEqual(Object.keys(json), ["query", "results"]);
  assert.equal(json.query, "refactor");
  assert.deepEqual({ ...json.results[0], score: typeof json.results[0].score }, {
    id: "pkg:github/mattpocock/skills",
    journal: "personal",
    type: "skill",
    skill: "tdd",
    name: "mattpocock/skills",
    verdict: "red-green-refactor with an agent",
    status: "inbox",
    score: "number",
    path: join(box.journal, "notes", "github--mattpocock--skills.md"),
  });
});

test("no matches: a short message on stderr, nothing on stdout, exit 0; --json gives an empty list", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["search", "zzzzzzzz"]);
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
  assert.equal(r.err, 'No matches for "zzzzzzzz".\n');
  const json = await magpie(box, ["search", "zzzzzzzz", "--json"]);
  assert.deepEqual(JSON.parse(json.out), { query: "zzzzzzzz", results: [] });
});

test("no journal at all: no matches, and nothing is created", async () => {
  const box = sandbox();
  const r = await magpie(box, ["search", "pdf"]);
  assert.equal(r.code, 0);
  assert.match(r.err, /No matches/);
  assert.equal(existsSync(box.journal), false);
});

test("--journal limits the search to one journal", async () => {
  const box = sandbox(FILES);
  const personal = JSON.parse((await magpie(box, ["search", "pdf", "--journal", "personal", "--json"])).out);
  assert.ok(personal.results.every((r: { journal: string }) => r.journal === "personal"));
  const project = JSON.parse((await magpie(box, ["search", "pdf", "--journal", "project", "--json"])).out);
  assert.deepEqual(project.results.map((r: { name: string }) => r.name), ["puppeteer"]);
});

test("--tag (every tag), --kind and --limit; a capped list says so on stderr", async () => {
  const box = sandbox(FILES);
  const names = async (...flags: string[]) => JSON.parse((await magpie(box, ["search", "pdf", ...flags, "--json"])).out).results.map((r: { name: string }) => r.name);
  assert.deepEqual((await names("--tag", "pdf")).length, 3);
  assert.deepEqual(await names("--tag", "pdf", "--tag", "workflow"), []);
  assert.deepEqual(await names("--kind", "skill-pack"), []);
  const capped = await magpie(box, ["search", "pdf", "--limit", "1"]);
  assert.equal(capped.out.trimEnd().split("\n").length, 1);
  assert.equal(capped.err, "1 of 3 results. Use --limit to see more.\n");
});

test("usage errors exit 2: an empty query, a bad --limit, an unknown --kind", async () => {
  const box = sandbox(FILES);
  for (const argv of [["search", " "], ["search", "pdf", "--limit", "0"], ["search", "pdf", "--limit", "many"], ["search", "pdf", "--kind", "gadget"]]) {
    assert.equal((await magpie(box, argv)).code, 2, argv.join(" "));
  }
});

test("colour only in a terminal, only for [inbox], and never with NO_COLOR or --json", async () => {
  const box = sandbox(FILES);
  const terminal = await magpie(box, ["search", "pdf"], { columns: 200 });
  assert.match(terminal.out, /\u001b\[33m\[inbox\]\u001b\[39m no verdict yet/);
  assert.equal((terminal.out.match(/\u001b\[/g) ?? []).length, 2);
  const noColor = await magpie(box, ["search", "pdf"], { columns: 200, env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  assert.ok(!noColor.out.includes("\u001b"));
  const json = await magpie(box, ["search", "pdf", "--json"], { columns: 200 });
  assert.ok(!json.out.includes("\u001b"));
});

test("in a terminal, long lines are cut to its width with …; piped, nothing is cut", async () => {
  const box = sandbox(FILES);
  const terminal = await magpie(box, ["search", "pdf"], { columns: 40, env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  const lines = terminal.out.trimEnd().split("\n");
  assert.ok(lines.every((line) => line.length <= 40), lines.join("\n"));
  assert.ok(lines.some((line) => line.endsWith("…")));
  const piped = await magpie(box, ["search", "pdf"]);
  assert.ok(piped.out.includes("default for PDF rendering in new projects"));
});

test("the index is cached in each journal's .cache/ and follows edits", async () => {
  const box = sandbox(FILES);
  await magpie(box, ["search", "pdf"]);
  assert.ok(existsSync(join(box.journal, ".cache", CACHE_FILE)));
  assert.ok(existsSync(join(box.project, ".magpie", ".cache", CACHE_FILE)));
  writeFileSync(join(box.journal, "notes", "npm--pdf-lib.md"), note({ id: "pkg:npm/pdf-lib", name: "pdf-lib", tags: ["pdf"], verdict: "good for editing existing PDFs" }));
  const r = await magpie(box, ["search", "editing"]);
  assert.match(r.out, /pdf-lib\s+npm\s+personal\s+Verdict: good for editing existing PDFs/);
});
