import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNote, type NewNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// magpie suggest (spec §2, §5, §8) in sandboxes.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-03", kind: "library", tags: [], ...n });

const FILES = {
  "journal/notes/npm--commander.md": note({ id: "pkg:npm/commander", verdict: "fine for small CLIs", tags: ["cli"] }),
  "journal/notes/npm--tsx.md": note({ id: "pkg:npm/tsx", whatItDoes: "Runs TypeScript files directly." }),
  "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful; use puppeteer" }),
  "project/.magpie/notes/npm--vitest.md": note({ id: "pkg:npm/vitest", verdict: "default test runner for new projects" }),
  "project/package.json": JSON.stringify({ description: "A TypeScript CLI with tests", dependencies: { pdfkit: "*" }, devDependencies: { vitest: "*" } }),
};

test("candidates on stdout, Verdict first, then the in-use avoid group; the count on stderr", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["suggest"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, [
    "1  commander  npm  personal  Verdict: fine for small CLIs",
    "2  tsx        npm  personal  [inbox] no verdict yet",
    "",
    "Already in use, you noted to avoid:",
    "  pdfkit  npm  personal  Verdict: avoid: async streams painful; use puppeteer",
    "",
  ].join("\n"));
  assert.equal(r.err, "2 candidates. Your coding agent picks the fit.\n");
});

test("a description replaces the manifests' words", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["suggest", "run TypeScript directly"]);
  assert.match(r.out, /^1  tsx\s+npm\s+personal\s+\[inbox\] no verdict yet\n/);
});

test("--json prints exactly core's document, and nothing on stderr", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["suggest", "--json"]);
  assert.equal(r.code, 0);
  assert.equal(r.err, "");
  const json = JSON.parse(r.out);
  assert.deepEqual(Object.keys(json), ["source", "keywords", "candidates", "in_use_avoid"]);
  assert.deepEqual(json.keywords, ["pdfkit", "vitest", "typescript", "cli", "tests"]);
  assert.deepEqual({ ...json.candidates[0], score: typeof json.candidates[0].score }, {
    id: "pkg:npm/commander", journal: "personal", name: "commander", verdict: "fine for small CLIs", status: "reviewed", tags: ["cli"], score: "number",
    path: box.note("npm--commander.md"),
  });
  assert.equal(json.in_use_avoid[0].id, "pkg:npm/pdfkit");
});

test("--limit: the first candidates, with how many there are and the hint", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["suggest", "--limit", "1"]);
  assert.equal(r.out.split("\n")[0], "1  commander  npm  personal  Verdict: fine for small CLIs");
  assert.equal(r.err, "1 of 2 candidates. Your coding agent picks the fit; use --limit to see more.\n");
});

test("--journal project reads the project journal only", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["suggest", "test runner", "--journal", "project", "--json"]);
  const json = JSON.parse(r.out);
  assert.ok(json.candidates.every((c: { journal: string }) => c.journal === "project"));
  assert.deepEqual(json.in_use_avoid, [], "the avoid note is in the personal journal");
});

test("nothing to go on is a usage error (exit 2); --json adds the error to the empty document", async () => {
  const box = sandbox({ "journal/notes/npm--tsx.md": FILES["journal/notes/npm--tsx.md"] });
  const r = await magpie(box, ["suggest"]);
  assert.equal(r.code, 2);
  assert.equal(r.out, "");
  assert.match(r.err, /^magpie suggest: Nothing to go on in .*Describe the project instead/);
  const json = await magpie(box, ["suggest", "--json"]);
  assert.equal(json.code, 2);
  assert.deepEqual(Object.keys(JSON.parse(json.out)), ["source", "keywords", "candidates", "in_use_avoid", "error"]);
});

test("no candidate: a short message on stderr, exit 0; the avoid group still shows", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["suggest", "kubernetes operators"]);
  assert.equal(r.code, 0);
  assert.equal(r.out, "Already in use, you noted to avoid:\n  pdfkit  npm  personal  Verdict: avoid: async streams painful; use puppeteer\n");
  assert.equal(r.err, "No notes match: kubernetes, operators.\n");
});

test("in a terminal, the Verdict wraps under the name", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["suggest"], { columns: 40, env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  assert.match(r.out, /^1  commander  npm  personal\n   Verdict: fine for small CLIs\n/);
});
