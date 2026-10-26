import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Place } from "./journals.ts";
import { mergeTags, runTagsMerge, withAlias } from "./tags-merge.ts";

// repomagpie tags --merge (decision 0041), on scratch journals only.

const note = (id: string, tags: string, extra = "") =>
  `---\n# my comment\nid: ${id}\nname: x\nkind: library\ntags: ${tags}\ntried: false\nstatus: inbox\n${extra}---\n\n## Verdict\n\n## My notes\nKept.\n`;

function setup(files: Record<string, string>) {
  const base = scratchBase("tags-merge");
  const journal = join(base, "journal");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(journal, path)), { recursive: true });
    writeFileSync(join(journal, path), text);
  }
  mkdirSync(join(journal, "notes"), { recursive: true });
  mkdirSync(join(base, "home"));
  mkdirSync(join(base, "project"));
  const place: Place = { home: join(base, "home"), env: { MAGPIE_HOME: journal }, cwd: join(base, "project") };
  const snapshot = () => Object.fromEntries(readdirSync(journal, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => [join(e.parentPath, e.name), readFileSync(join(e.parentPath, e.name), "utf8")]));
  return { journal, place, snapshot, path: (file: string) => join(journal, "notes", file) };
}

test("mergeTags: from becomes to at its place; a note that already has to keeps one; the order is kept", () => {
  assert.deepEqual(mergeTags(["db", "postgres", "orm"], "postgres", "postgresql"), ["db", "postgresql", "orm"]);
  assert.deepEqual(mergeTags(["postgresql", "orm", "postgres"], "postgres", "postgresql"), ["postgresql", "orm"]);
  assert.deepEqual(mergeTags(["postgres", "orm", "postgresql"], "postgres", "postgresql"), ["postgresql", "orm"]);
  assert.deepEqual(mergeTags(["orm"], "postgres", "postgresql"), ["orm"]);
});

test("withAlias: the alias goes into to's parentheses, made when missing; from's own line goes; other lines stay", () => {
  const md = "# Tags\n\n- `postgresql` — the database\n- `postgres`\n- `orm`\n";
  assert.deepEqual(withAlias(md, "postgres", "postgresql"), { text: "# Tags\n\n- `postgresql` (postgres) — the database\n- `orm`\n", aliasAdded: true, lineRemoved: true });
  assert.equal(withAlias("- `postgresql` (pg) — db\r\n", "postgres", "postgresql").text, "- `postgresql` (pg, postgres) — db\r\n");
  assert.deepEqual(withAlias("- `postgresql` (postgres)\n", "postgres", "postgresql"), { text: "- `postgresql` (postgres)\n", aliasAdded: false, lineRemoved: false });
  assert.equal(withAlias("# Tags\n\n- `orm`", "postgres", "postgresql").text, "# Tags\n\n- `orm`\n- `postgresql` (postgres)");
  assert.equal(withAlias(null, "postgres", "postgresql").text, "# Tags\n\n- `postgresql` (postgres)\n");
});

test("runTagsMerge rewrites every note's tags with the round-trip-safe edit, and tags.md; a second run changes nothing", () => {
  const box = setup({
    "tags.md": "# Tags\n\n- `postgres`\n- `postgresql` — the database\n",
    "notes/npm--a.md": note("pkg:npm/a", "[db, postgres, orm]"),
    "notes/npm--b.md": note("pkg:npm/b", "\n  - postgresql\n  - postgres\n"),
    "notes/npm--c.md": note("pkg:npm/c", "[orm]"),
  });
  const before = box.snapshot();
  const dry = runTagsMerge({ journal: "personal", from: "postgres", to: "postgresql", dryRun: true }, box.place);
  assert.equal(dry.outcome, "ok");
  assert.deepEqual(dry.document.notes.map((n) => [n.id, n.tags]), [["pkg:npm/a", ["db", "postgresql", "orm"]], ["pkg:npm/b", ["postgresql"]]]);
  assert.deepEqual(dry.document.tags_md, { alias_added: true, line_removed: true });
  assert.deepEqual(box.snapshot(), before);

  const run = runTagsMerge({ journal: "personal", from: "Postgres", to: "postgresql", dryRun: false }, box.place);
  assert.equal(run.document.notes.length, 2);
  assert.equal(readFileSync(box.path("npm--a.md"), "utf8"), note("pkg:npm/a", "[db, postgresql, orm]"));
  assert.equal(readFileSync(box.path("npm--b.md"), "utf8"), note("pkg:npm/b", "\n  - postgresql\n"));
  assert.equal(readFileSync(box.path("npm--c.md"), "utf8"), note("pkg:npm/c", "[orm]"));
  assert.equal(readFileSync(join(box.journal, "tags.md"), "utf8"), "# Tags\n\n- `postgresql` (postgres) — the database\n");

  const again = box.snapshot();
  const second = runTagsMerge({ journal: "personal", from: "postgres", to: "postgresql", dryRun: false }, box.place);
  assert.deepEqual([second.document.notes, second.document.tags_md], [[], { alias_added: false, line_removed: false }]);
  assert.deepEqual(box.snapshot(), again);
});

test("runTagsMerge: two tags in kebab-case, not the same; a note it can't read is skipped and left as it is", () => {
  const box = setup({ "notes/npm--broken.md": "---\nid: [\n---\n", "notes/npm--odd.md": note("pkg:npm/odd", "[postgres, 7]") });
  for (const [from, to] of [["Post gres", "postgresql"], ["postgres", "postgres"], ["", "x"]]) {
    assert.equal(runTagsMerge({ journal: "personal", from, to, dryRun: false }, box.place).outcome, "usage", `${from} ${to}`);
  }
  const run = runTagsMerge({ journal: "personal", from: "postgres", to: "postgresql", dryRun: false }, box.place);
  assert.deepEqual(run.document.skipped.map((s) => s.path), [box.path("npm--odd.md")]);
  assert.match(readFileSync(box.path("npm--odd.md"), "utf8"), /tags: \[postgres, 7\]/);
});
