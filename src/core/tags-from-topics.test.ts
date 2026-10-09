import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Place } from "./journals.ts";
import { tagsFromTopics } from "./tags-from-topics.ts";

// "Add GitHub topics as tags" (decision 0030), on scratch journals only.

const note = (id: string, topics: string, tags: string, extra = "") =>
  `---\n# my comment\nid: ${id}\nname: x\ntopics: ${topics}\nkind: other\ntags: ${tags}\ntried: false\nstatus: inbox\n${extra}---\n\n## Verdict\n\n## My notes\nKept.\n`;

const DIFY = note("pkg:github/langgenius/dify", "[agent, ai, dify, hacktoberfest, llm, low-code, workflow]", "[]");
const SIX = note("pkg:github/a/six", "[zeta, llm, alpha, beta]", "\n  - t1\n  - t2\n  - t3\n  - t4\n  - t5\n  - t6\n");
const FULL = note("pkg:github/a/full", "[llm, more]", "[t1, t2, t3, t4, t5, t6, t7, t8]");
const PDFKIT = note("pkg:npm/pdfkit", "[]", "[pdf]");
const BROKEN = "---\nid: [\n---\n\n## Verdict\n";
const BAD_TAGS = note("pkg:github/a/bad", "[llm]", "llm");

function setup(files: Record<string, string>) {
  const base = scratchBase("from-topics");
  const journal = join(base, "journal");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(journal, path)), { recursive: true });
    writeFileSync(join(journal, path), text);
  }
  mkdirSync(join(base, "home"));
  mkdirSync(join(base, "project"));
  const place: Place = { home: join(base, "home"), env: { MAGPIE_HOME: journal }, cwd: join(base, "project") };
  const snapshot = () => Object.fromEntries(readdirSync(journal, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => [join(e.parentPath, e.name), readFileSync(join(e.parentPath, e.name), "utf8")]));
  return { journal, place, snapshot, path: (file: string) => join(journal, "notes", file) };
}

const JOURNAL = {
  "tags.md": "# Tags\n\n- `workflow` — engineering workflow\n",
  "notes/github--langgenius--dify.md": DIFY,
  "notes/github--a--six.md": SIX,
  "notes/github--a--full.md": FULL,
  "notes/npm--pdfkit.md": PDFKIT,
};

test("a dry run reports what the action would do and writes nothing; applying it gives the same document", () => {
  const s = setup(JOURNAL);
  const before = s.snapshot();
  const dry = tagsFromTopics({ journal: "personal", dryRun: true }, s.place);
  assert.equal(dry.outcome, "ok");
  assert.deepEqual(s.snapshot(), before);
  const applied = tagsFromTopics({ journal: "personal", dryRun: false }, s.place);
  assert.deepEqual(applied, dry);
  assert.deepEqual(applied.document, {
    journal: "personal",
    notes: [
      { id: "pkg:github/a/six", path: s.path("github--a--six.md"), added: ["llm", "zeta"] },
      { id: "pkg:github/langgenius/dify", path: s.path("github--langgenius--dify.md"), added: ["workflow", "llm", "agent", "ai", "low-code"] },
    ],
    skipped: [],
    tags_md_added: ["llm", "zeta", "agent", "ai", "low-code"],
  });
});

test("ranking across the journal: tags.md, then topics another note carries (not the note itself), then the rest; the cap counts the existing tags", () => {
  const s = setup(JOURNAL);
  const { document } = tagsFromTopics({ journal: "personal", dryRun: false }, s.place);
  // six has 6 tags, so 2 places: llm (dify and full carry it) first, then zeta, alpha and beta, which
  // no other note carries, in GitHub's order.
  assert.deepEqual(document.notes.find((n) => n.id === "pkg:github/a/six")?.added, ["llm", "zeta"]);
  // dify: workflow is in tags.md; llm is carried by six and full; agent, ai and low-code only by dify itself.
  assert.deepEqual(document.notes.find((n) => n.id === "pkg:github/langgenius/dify")?.added, ["workflow", "llm", "agent", "ai", "low-code"]);
  // full already has 8 tags: nothing added, and it isn't listed.
  assert.equal(document.notes.some((n) => n.id === "pkg:github/a/full"), false);
  assert.equal(readFileSync(s.path("github--a--full.md"), "utf8"), FULL);
});

test("existing tags are never removed or reordered; the new ones follow, and the rest of each file stays byte for byte", () => {
  const s = setup(JOURNAL);
  tagsFromTopics({ journal: "personal", dryRun: false }, s.place);
  assert.equal(readFileSync(s.path("github--a--six.md"), "utf8"), SIX.replace("  - t6\n", "  - t6\n  - llm\n  - zeta\n"));
  assert.equal(readFileSync(s.path("github--langgenius--dify.md"), "utf8"), DIFY.replace("tags: []", "tags: [workflow, llm, agent, ai, low-code]"));
  assert.equal(readFileSync(s.path("npm--pdfkit.md"), "utf8"), PDFKIT); // a registry package has no topics
  assert.equal(readFileSync(join(s.journal, "tags.md"), "utf8"), "# Tags\n\n- `workflow` — engineering workflow\n- `llm`\n- `zeta`\n- `agent`\n- `ai`\n- `low-code`\n");
});

test("a second run adds nothing", () => {
  const s = setup(JOURNAL);
  tagsFromTopics({ journal: "personal", dryRun: false }, s.place);
  const after = s.snapshot();
  const again = tagsFromTopics({ journal: "personal", dryRun: false }, s.place);
  assert.deepEqual(again.document, { journal: "personal", notes: [], skipped: [], tags_md_added: [] });
  assert.deepEqual(s.snapshot(), after);
});

test("a note whose frontmatter can't be read, or whose tags aren't a list, is skipped and reported, never written", () => {
  const s = setup({ ...JOURNAL, "notes/npm--broken.md": BROKEN, "notes/github--a--bad.md": BAD_TAGS });
  const { outcome, document } = tagsFromTopics({ journal: "personal", dryRun: false }, s.place);
  assert.equal(outcome, "ok");
  assert.deepEqual(document.skipped.map((n) => n.path), [s.path("github--a--bad.md"), s.path("npm--broken.md")]);
  for (const skipped of document.skipped) assert.ok(skipped.reason.length > 0);
  assert.equal(readFileSync(s.path("npm--broken.md"), "utf8"), BROKEN);
  assert.equal(readFileSync(s.path("github--a--bad.md"), "utf8"), BAD_TAGS);
});

test("a journal without tags.md gets one holding just the new tags; an empty journal changes nothing", () => {
  const s = setup({ "notes/github--langgenius--dify.md": DIFY });
  const { document } = tagsFromTopics({ journal: "personal", dryRun: false }, s.place);
  assert.deepEqual(document.tags_md_added, ["agent", "ai", "llm", "low-code", "workflow"]);
  assert.equal(readFileSync(join(s.journal, "tags.md"), "utf8"), "# Tags\n\n- `agent`\n- `ai`\n- `llm`\n- `low-code`\n- `workflow`\n");

  const empty = setup({});
  assert.deepEqual(tagsFromTopics({ journal: "project", dryRun: false }, empty.place).document, { journal: "project", notes: [], skipped: [], tags_md_added: [] });
  assert.equal(existsSync(join(empty.place.cwd, ".magpie")), false);
  assert.equal(existsSync(join(dirname(empty.place.cwd), ".magpie")), false);
});
