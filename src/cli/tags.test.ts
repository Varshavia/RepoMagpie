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
});
