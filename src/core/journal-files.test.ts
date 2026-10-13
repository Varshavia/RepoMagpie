import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { magpie, sandbox, type Box } from "../cli/fixtures/sandbox.ts";
import { noteDocument, patchNote } from "./documents.ts";
import { readNote } from "./note.ts";
import { NOTE_SIZE_LIMIT, takeSkipped } from "./note-cache.ts";
import { renderNote, type NewNote } from "./write.ts";

// The file rules of decision 0032 (rules 5 and 6): links inside a journal are never followed and
// never written through; files over 256 KB are skipped; YAML aliases are bounded. Hostile files are
// inert: the "secret" is a harmless string.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const SECRET = "SECRET-TOKEN-example-invalid";
const defaultJournal = { env: {} as Record<string, string> }; // no MAGPIE_HOME: the personal journal is <home>/.magpie

// A link, or a skip with the reason when this machine can't create one (Windows without Developer
// Mode can't create file links; junctions always work).
function link(t: TestContext, target: string, path: string, type: "file" | "dir"): boolean {
  try {
    symlinkSync(target, path, type === "dir" && process.platform === "win32" ? "junction" : type);
    return true;
  } catch (error) {
    t.skip(`can't create a ${type} link here: ${(error as NodeJS.ErrnoException).code}`);
    return false;
  }
}

function withSecretOutside(box: Box): string {
  const secret = join(box.root, "outside", "secret.md");
  mkdirSync(join(box.root, "outside"), { recursive: true });
  writeFileSync(secret, note({ id: "pkg:npm/pdfkit", verdict: `avoid: ${SECRET}` }));
  return secret;
}

test("a note that is a link to a file outside the journal is skipped on read, reported once, and refused on write", async (t) => {
  const box = sandbox({ "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }) });
  const secret = withSecretOutside(box);
  if (!link(t, secret, box.note("npm--pdfkit.md"), "file")) return;
  takeSkipped();

  const recall = await magpie(box, ["recall", "pdfkit", "--json"]);
  assert.deepEqual(JSON.parse(recall.out).matches, []);
  assert.ok(!recall.out.includes(SECRET));
  assert.match(recall.err, /warning: skipped: .*npm--pdfkit\.md is a link \(a symbolic link or junction\); RepoMagpie never follows a link inside a journal\./);
  const search = await magpie(box, ["search", "pdfkit", "--json"]);
  assert.ok(!search.out.includes(SECRET));
  assert.doesNotMatch(search.err, /skipped/, "reported once per process");

  const write = await magpie(box, ["note", "pdfkit", "--type", "npm", "fine after all", "--json"]);
  assert.equal(write.code, 1);
  assert.match(JSON.parse(write.out).error, /Won't write .*npm--pdfkit\.md: .*is a link/);
  assert.ok(readFileSync(secret, "utf8").includes(SECRET), "the file outside is unchanged");
});

test("a notes/ folder that is a link is never read and never written through", async (t) => {
  const box = sandbox();
  const elsewhere = join(box.root, "elsewhere");
  mkdirSync(elsewhere, { recursive: true });
  writeFileSync(join(elsewhere, "npm--pdfkit.md"), note({ id: "pkg:npm/pdfkit", verdict: `avoid: ${SECRET}` }));
  mkdirSync(box.journal, { recursive: true });
  if (!link(t, elsewhere, join(box.journal, "notes"), "dir")) return;
  takeSkipped();

  const recall = await magpie(box, ["recall", "pdfkit", "--json"]);
  assert.deepEqual(JSON.parse(recall.out).matches, []);
  assert.match(recall.err, /warning: skipped: .*notes is a link/);
  const write = await magpie(box, ["note", "pkg:npm/chalk", "colours"]);
  assert.equal(write.code, 1);
  assert.match(write.err, /Won't write .*npm--chalk\.md: .*notes is a link/);
  assert.deepEqual(readdirSync(elsewhere), ["npm--pdfkit.md"], "nothing written through the link");
});

test("the app's API: a linked note can't be opened by file name, and a write through a link is refused", async (t) => {
  const box = sandbox({ "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }) });
  const secret = withSecretOutside(box);
  if (!link(t, secret, box.note("npm--pdfkit.md"), "file")) return;
  const place = { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project };
  const opened = noteDocument("personal", { file: "npm--pdfkit.md" }, place);
  assert.equal(opened.outcome, "not-found");
  assert.ok(!JSON.stringify(opened.document).includes(SECRET));
  const byId = noteDocument("personal", { id: "pkg:npm/pdfkit" }, place);
  assert.equal(byId.outcome, "not-found");
  const patched = patchNote({ journal: "personal", id: "pkg:npm/pdfkit", version: "sha256:0", verdict: "fine" }, place);
  assert.equal(patched.outcome, "not-found");
  assert.ok(readFileSync(secret, "utf8").includes(SECRET));
});

test("tags.md that is a link is not read, and tags are never appended through it", async (t) => {
  const box = sandbox({ "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }) });
  const outside = join(box.root, "outside-tags.md");
  writeFileSync(outside, "# Tags\n\n- `secret-tag`\n");
  if (!link(t, outside, join(box.journal, "tags.md"), "file")) return;
  const r = await magpie(box, ["tags", "--from-topics", "--json"]);
  assert.equal(readFileSync(outside, "utf8"), "# Tags\n\n- `secret-tag`\n");
  assert.match(r.err, /tags\.md is a link/);
});

test("a .cache folder that is a link is neither read nor written; recall still works", async (t) => {
  const box = sandbox({ "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }) });
  const elsewhere = join(box.root, "cache-elsewhere");
  mkdirSync(elsewhere);
  if (!link(t, elsewhere, join(box.journal, ".cache"), "dir")) return;
  const r = await magpie(box, ["recall", "chalk", "--json"]);
  assert.equal(JSON.parse(r.out).matches[0].verdict, "colours");
  assert.deepEqual(readdirSync(elsewhere), [], "no cache written through the link");
});

test("a project journal (.magpie) that is a link is skipped, and --to project refuses to write into it", async (t) => {
  const box = sandbox();
  const elsewhere = join(box.root, "team-notes");
  mkdirSync(join(elsewhere, "notes"), { recursive: true });
  writeFileSync(join(elsewhere, "notes", "npm--pdfkit.md"), note({ id: "pkg:npm/pdfkit", verdict: `avoid: ${SECRET}` }));
  if (!link(t, elsewhere, join(box.project, ".magpie"), "dir")) return;
  const recall = await magpie(box, ["recall", "pdfkit", "--type", "npm", "--json"]);
  assert.deepEqual(JSON.parse(recall.out).matches, []);
  const write = await magpie(box, ["note", "pkg:npm/chalk", "colours", "--to", "project"]);
  assert.equal(write.code, 1);
  assert.match(write.err, /\.magpie is a link/);
  assert.deepEqual(readdirSync(join(elsewhere, "notes")), ["npm--pdfkit.md"]);
});

test("a note over 256 KB is skipped by every read and reported; a write to it is refused", async () => {
  const big = note({ id: "pkg:npm/pdfkit", verdict: "avoid: huge" }) + "x".repeat(NOTE_SIZE_LIMIT);
  const box = sandbox({ "journal/notes/npm--pdfkit.md": big, "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }) });
  takeSkipped();
  const recall = await magpie(box, ["recall", "pdfkit", "chalk", "--json"]);
  assert.deepEqual(JSON.parse(recall.out).matches.map((m: { id: string }) => m.id), ["pkg:npm/chalk"]);
  assert.match(recall.err, /warning: skipped: .*npm--pdfkit\.md is over 256 KB\./);
  const write = await magpie(box, ["note", "pkg:npm/pdfkit", "fine", "--json"]);
  assert.equal(write.code, 1);
  assert.match(JSON.parse(write.out).error, /Won't write .*npm--pdfkit\.md: .*is over 256 KB/);
  assert.equal(readFileSync(box.note("npm--pdfkit.md"), "utf8"), big);
});

test("a YAML alias bomb in the frontmatter is refused fast; the note reads as unreadable frontmatter", () => {
  const levels = ["a: &a [x, x, x, x, x, x, x, x, x]"];
  for (let i = 1; i < 10; i++) levels.push(`${"abcdefghij"[i]}: &${"abcdefghij"[i]} [${Array(9).fill(`*${"abcdefghij"[i - 1]}`).join(", ")}]`);
  const text = `---\nid: pkg:npm/bomb\n${levels.join("\n")}\n---\n\n## Verdict\n\nfine\n`;
  const started = performance.now();
  const read = readNote(text);
  assert.ok(performance.now() - started < 1000, "bounded");
  assert.deepEqual(read.frontmatter, {});
  assert.ok(read.warnings.length > 0);
});

test("the maintainer's setup: a home folder that is a git repository never makes ~/.magpie the project journal", async () => {
  const box = sandbox({
    "home/.git/": null,
    "home/.magpie/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }),
    "home/code/app/package.json": "{}",
  });
  const r = await magpie(box, ["recall", "chalk", "--json"], { ...defaultJournal, cwd: join(box.home, "code", "app") });
  const matches = JSON.parse(r.out).matches;
  assert.deepEqual(matches.map((m: { journal: string }) => m.journal), ["personal"], "read once, as the personal journal");
  const write = await magpie(box, ["note", "pkg:npm/zod", "ok", "--to", "project"], { ...defaultJournal, cwd: join(box.home, "code", "app") });
  assert.equal(write.code, 0);
  assert.ok(existsSync(join(box.home, "code", "app", ".magpie", "notes", "npm--zod.md")), "the project root is the working directory, not home");
  assert.ok(!existsSync(join(box.home, ".magpie", "notes", "npm--zod.md")));
});
