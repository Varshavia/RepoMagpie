import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// repomagpie domains --suggest (decision 0040), in temporary journals.

const note = (id: string, topics: string, extra = "") =>
  `---\nid: ${id}\nname: x\ntopics: ${topics}\nkind: other\ntags: []\n${extra}tried: false\nstatus: inbox\n---\n\n## Verdict\n`;
const files = {
  "journal/notes/github--a--orm.md": note("pkg:github/a/orm", "[orm]"),
  "journal/notes/github--a--mine.md": note("pkg:github/a/mine", "[orm]", "domains: [security]\n"),
  "journal/notes/npm--broken.md": "---\nid: [\n---\n",
};

test("--json: the document; --dry-run writes nothing", async () => {
  const box = sandbox(files);
  const r = await magpie(box, ["domains", "--suggest", "--dry-run", "--json"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, "");
  assert.deepEqual(JSON.parse(r.out), {
    journal: "personal",
    dry_run: true,
    notes: [{ id: "pkg:github/a/orm", path: box.note("github--a--orm.md"), suggested: ["database"] }],
    skipped: [{ path: box.note("npm--broken.md"), reason: "Its frontmatter can't be read, or has no id." }],
  });
  assert.equal(readFileSync(box.note("github--a--orm.md"), "utf8"), files["journal/notes/github--a--orm.md"]);
});

test("human output: the plan on stdout; without a terminal it writes, says so, and a second run finds nothing", async () => {
  const box = sandbox(files);
  const r = await magpie(box, ["domains", "--suggest"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, "pkg:github/a/orm: database\n");
  assert.match(r.err, /Suggested domains for 1 note\. They stay marked as suggested until you confirm them\.\n$/);
  assert.match(readFileSync(box.note("github--a--orm.md"), "utf8"), /^domains_suggested: \[database\]$/m);
  assert.equal(readFileSync(box.note("github--a--mine.md"), "utf8"), files["journal/notes/github--a--mine.md"]);
  const again = await magpie(box, ["domains", "--suggest"]);
  assert.equal(again.out, "");
  assert.match(again.err, /No domains to suggest/);
});

test("in a terminal it asks first; no answer writes nothing", async () => {
  const box = sandbox(files);
  let asked = "";
  const r = await magpie(box, ["domains", "--suggest"], { interactive: true, ask: async (q) => { asked = q; return ""; } });
  assert.equal(r.code, 0, r.err);
  assert.equal(asked, "Write these suggestions to 1 note? (y/N) ");
  assert.match(r.err, /Nothing was written\.\n$/);
  assert.equal(readFileSync(box.note("github--a--orm.md"), "utf8"), files["journal/notes/github--a--orm.md"]);
  await magpie(box, ["domains", "--suggest"], { interactive: true, ask: async () => "y" });
  assert.match(readFileSync(box.note("github--a--orm.md"), "utf8"), /^domains_suggested: \[database\]$/m);
});

test("--dry-run says what it would do; without --suggest it's a usage error", async () => {
  const box = sandbox(files);
  const r = await magpie(box, ["domains", "--suggest", "--dry-run"]);
  assert.equal(r.out, "pkg:github/a/orm: database\n");
  assert.match(r.err, /Would suggest domains for 1 note\. Dry run: nothing was written\.\n$/);
  const usage = await magpie(box, ["domains"]);
  assert.equal(usage.code, 2);
  assert.match(usage.err, /--suggest/);
});
