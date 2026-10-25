import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// magpie tags --from-topics (decision 0030), in temporary journals.

const DIFY = "---\nid: pkg:github/langgenius/dify\nname: langgenius/dify\ntopics: [agent, llm, workflow]\nkind: platform\ntags: [mine]\ntried: false\nstatus: inbox\n---\n\n## Verdict\n";
const files = { "journal/tags.md": "- `workflow`\n", "journal/notes/github--langgenius--dify.md": DIFY, "journal/notes/npm--broken.md": "---\nid: [\n---\n" };

test("--dry-run --json: the document, and nothing written", async () => {
  const box = sandbox(files);
  const r = await magpie(box, ["tags", "--from-topics", "--dry-run", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, "");
  assert.deepEqual(JSON.parse(r.out), {
    journal: "personal",
    notes: [{ id: "pkg:github/langgenius/dify", path: box.note("github--langgenius--dify.md"), added: ["workflow", "agent", "llm"] }],
    skipped: [{ path: box.note("npm--broken.md"), reason: "Its frontmatter can't be read, or has no id." }],
    tags_md_added: ["agent", "llm"],
  });
  assert.equal(readFileSync(box.note("github--langgenius--dify.md"), "utf8"), DIFY);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `workflow`\n");
});

test("human output: each note with its tags on stdout; skipped notes and a total on stderr; a second run adds nothing", async () => {
  const box = sandbox(files);
  const r = await magpie(box, ["tags", "--from-topics"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, "pkg:github/langgenius/dify: + workflow, agent, llm\n");
  assert.equal(r.err, `skipped ${box.note("npm--broken.md")}: Its frontmatter can't be read, or has no id.\nAdded 3 tags to 1 note, and 2 new tags to tags.md.\n`);
  assert.match(readFileSync(box.note("github--langgenius--dify.md"), "utf8"), /^tags: \[mine, workflow, agent, llm\]$/m);
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `workflow`\n- `agent`\n- `llm`\n");

  const again = await magpie(box, ["tags", "--from-topics"]);
  assert.equal(again.out, "");
  assert.match(again.err, /^No GitHub topics to add as tags\.$/m);
});

test("--dry-run says what it would do", async () => {
  const box = sandbox(files);
  const r = await magpie(box, ["tags", "--from-topics", "--dry-run"]);
  assert.equal(r.out, "pkg:github/langgenius/dify: + workflow, agent, llm\n");
  assert.match(r.err, /^Would add 3 tags to 1 note, and 2 new tags to tags\.md\.\nDry run: nothing was written\.\n$/m);
});

test("--journal project reads the project journal; without --from-topics it's a usage error", async () => {
  const box = sandbox({ ...files, "project/.magpie/notes/github--langgenius--dify.md": DIFY });
  const r = await magpie(box, ["tags", "--from-topics", "--journal", "project", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(r.out).journal, "project");
  assert.deepEqual(JSON.parse(r.out).tags_md_added, ["agent", "llm", "workflow"]);
  assert.equal(readFileSync(join(box.project, ".magpie", "tags.md"), "utf8"), "# Tags\n\n- `agent`\n- `llm`\n- `workflow`\n");

  const usage = await magpie(box, ["tags"]);
  assert.equal(usage.code, 2);
  assert.match(usage.err, /--from-topics/);
  assert.match(usage.err, /--merge <from> <to>/);
});

// magpie tags --merge (decision 0041).

const tagged = (id: string, tags: string) => `---\nid: ${id}\nname: x\nkind: library\ntags: ${tags}\ntried: false\nstatus: inbox\n---\n\n## Verdict\n`;
const mergeFiles = {
  "journal/tags.md": "- `postgres`\n- `postgresql` — the database\n",
  "journal/notes/npm--a.md": tagged("pkg:npm/a", "[db, postgres]"),
  "journal/notes/npm--b.md": tagged("pkg:npm/b", "[postgresql, postgres]"),
};

test("--merge: the plan on stdout, then the notes and tags.md are rewritten; --dry-run writes nothing", async () => {
  const box = sandbox(mergeFiles);
  const dry = await magpie(box, ["tags", "--merge", "postgres", "postgresql", "--dry-run"]);
  assert.equal(dry.code, 0, dry.err);
  assert.equal(dry.out, "pkg:npm/a: db, postgresql\npkg:npm/b: postgresql\n");
  assert.equal(dry.err, "2 notes have postgres; it becomes postgresql. tags.md lists postgres as an alias of postgresql, and postgres's own line goes.\nDry run: nothing was written.\n");
  assert.equal(readFileSync(box.note("npm--a.md"), "utf8"), mergeFiles["journal/notes/npm--a.md"]);

  const r = await magpie(box, ["tags", "--merge", "postgres", "postgresql"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /Merged postgres into postgresql in 2 notes\.\n$/);
  assert.equal(readFileSync(box.note("npm--b.md"), "utf8"), tagged("pkg:npm/b", "[postgresql]"));
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "- `postgresql` (postgres) — the database\n");
});

test("--merge in a terminal asks first; --json runs without asking; it needs exactly two tags", async () => {
  const box = sandbox(mergeFiles);
  const no = await magpie(box, ["tags", "--merge", "postgres", "postgresql"], { interactive: true, ask: async () => "n" });
  assert.match(no.err, /Nothing was written\.\n$/);
  assert.equal(readFileSync(box.note("npm--a.md"), "utf8"), mergeFiles["journal/notes/npm--a.md"]);
  const json = await magpie(box, ["tags", "--merge", "postgres", "postgresql", "--json"], { interactive: true });
  assert.equal(json.code, 0, json.err);
  assert.equal(JSON.parse(json.out).notes.length, 2);
  for (const argv of [["tags", "--merge", "postgres"], ["tags", "--merge", "a", "b", "c"]]) {
    const usage = await magpie(box, argv);
    assert.equal(usage.code, 2, argv.join(" "));
    assert.match(usage.err, /--merge takes two tags/);
  }
});
