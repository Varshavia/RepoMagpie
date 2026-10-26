import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { suggestJournalDomains } from "./domains-suggest.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Place } from "./journals.ts";

// repomagpie domains --suggest (decision 0040), on scratch journals only.

const note = (id: string, topics: string, tags: string, extra = "") =>
  `---\n# my comment\nid: ${id}\nname: x\ntopics: ${topics}\nkind: other\ntags: ${tags}\n${extra}tried: false\nstatus: inbox\n---\n\n## Verdict\n\n## My notes\nKept.\n`;

function setup(files: Record<string, string>) {
  const base = scratchBase("domains-suggest");
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

test("domains --suggest fills domains_suggested on notes that have neither field; never domains; a second run changes nothing", () => {
  const box = setup({
    "notes/github--a--orm.md": note("pkg:github/a/orm", "[orm, testing]", "[]"),
    "notes/github--a--mine.md": note("pkg:github/a/mine", "[orm]", "[]", "domains: [security]\n"),
    "notes/github--a--cleared.md": note("pkg:github/a/cleared", "[orm]", "[]", "domains_suggested: []\n"),
    "notes/github--a--none.md": note("pkg:github/a/none", "[react]", "[]"),
    "notes/npm--broken.md": "---\nid: [\n---\n",
  });
  const before = box.snapshot();
  const dry = suggestJournalDomains({ journal: "personal", dryRun: true }, box.place);
  assert.deepEqual(dry.document.notes.map((n) => [n.id, n.suggested]), [["pkg:github/a/orm", ["database", "testing"]]]);
  assert.deepEqual(dry.document.skipped.map((s) => s.path), [box.path("npm--broken.md")]);
  assert.deepEqual(box.snapshot(), before);

  const run = suggestJournalDomains({ journal: "personal", dryRun: false }, box.place);
  assert.equal(run.outcome, "ok");
  assert.equal(readFileSync(box.path("github--a--orm.md"), "utf8"), note("pkg:github/a/orm", "[orm, testing]", "[]", "domains_suggested: [database, testing]\n"));
  const after = box.snapshot();
  assert.deepEqual(suggestJournalDomains({ journal: "personal", dryRun: false }, box.place).document.notes, []);
  assert.deepEqual(box.snapshot(), after);
});

test("domains --suggest reads tags through the journal's aliases", () => {
  const box = setup({ "notes/github--a--k.md": note("pkg:github/a/k", "[]", "[orchestration]"), "tags.md": "- `kubernetes` (orchestration)\n" });
  // kubernetes maps to devops; orchestration only through the alias.
  assert.deepEqual(suggestJournalDomains({ journal: "personal", dryRun: true }, box.place).document.notes.map((n) => n.suggested), [["devops"]]);
});
