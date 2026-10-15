import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalogForAgent, compactForAgent, runCatalog } from "../core/catalog.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// repomagpie catalog (spec §2, §8) in temporary journals.

const note = (n: Partial<NewNote> & { id: string; name: string }) => renderNote({ explored: "2026-10-14", kind: "library", tags: [], ...n });

const FILES = {
  "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", name: "pdfkit", tags: ["pdf"], verdict: "avoid: async streams painful; use puppeteer" }),
  "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib", name: "pdf-lib", tags: ["pdf"], whatItDoes: "Create and modify PDF documents." }),
  "journal/notes/github--mattpocock--skills.md": note({ id: "pkg:github/mattpocock/skills", name: "mattpocock/skills", kind: "skill-pack", tags: ["workflow"] }),
  "project/.magpie/notes/npm--puppeteer.md": note({ id: "pkg:npm/puppeteer", name: "puppeteer", tags: ["pdf"], verdict: "default for PDF rendering in new projects" }),
};

test("--json prints core's compact document for an agent; --full --json every field; nothing on stderr", async () => {
  const box = sandbox(FILES);
  const place = { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project };
  const run = runCatalog({ limit: 100 }, place);
  const compact = await magpie(box, ["catalog", "--json"]);
  assert.equal(compact.code, 0);
  assert.equal(compact.err, "");
  assert.equal(compact.out, `${JSON.stringify(compactForAgent(run))}\n`);
  assert.deepEqual(JSON.parse(compact.out).rows.map((r: string[]) => r[0]), ["mattpocock/skills", "pdf-lib", "pdfkit", "puppeteer"]);
  const full = await magpie(box, ["catalog", "--full", "--json"]);
  assert.equal(full.err, "");
  assert.equal(full.out, `${JSON.stringify(catalogForAgent(run.document))}\n`);
  assert.equal(JSON.parse(full.out).total, 4);
});

test("--full changes nothing for people", async () => {
  const box = sandbox(FILES);
  assert.equal((await magpie(box, ["catalog", "--full"])).out, (await magpie(box, ["catalog"])).out);
});

test("people get one row per note, Verdict first, as search shows them", async () => {
  const box = sandbox(FILES);
  const r = await magpie(box, ["catalog"]);
  assert.equal(r.code, 0);
  assert.equal(r.err, "");
  assert.deepEqual(r.out.trimEnd().split("\n"), [
    "mattpocock/skills  skill-pack  personal  [inbox] no verdict yet",
    "pdf-lib            library     personal  [inbox] no verdict yet",
    "pdfkit             library     personal  Verdict: avoid: async streams painful; use puppeteer",
    "puppeteer          library     project   Verdict: default for PDF rendering in new projects",
  ]);
});

test("pages: the count and the next command on stderr; --cursor continues", async () => {
  const box = sandbox(FILES);
  const first = await magpie(box, ["catalog", "--limit", "3"]);
  assert.equal(first.out.trimEnd().split("\n").length, 3);
  const hint = first.err.match(/^3 of 4 notes\. Next page: repomagpie catalog --limit 3 --cursor (\S+)\n$/);
  assert.ok(hint, first.err);
  const next = await magpie(box, ["catalog", "--limit", "3", "--cursor", hint[1]]);
  assert.match(next.out, /^puppeteer\s+library\s+project\s+Verdict: /);
  assert.equal(next.err, "");
  const json = JSON.parse((await magpie(box, ["catalog", "--limit", "3", "--json"])).out);
  assert.equal(json.next_cursor, hint[1]);
});

test("filters: --tag (repeatable), --kind and --journal", async () => {
  const box = sandbox(FILES);
  const names = async (...flags: string[]) => JSON.parse((await magpie(box, ["catalog", ...flags, "--json"])).out).rows.map((r: string[]) => r[0]);
  assert.deepEqual(await names("--tag", "pdf"), ["pdf-lib", "pdfkit", "puppeteer"]);
  assert.deepEqual(await names("--tag", "pdf", "--tag", "workflow"), []);
  assert.deepEqual(await names("--kind", "skill-pack"), ["mattpocock/skills"]);
  assert.deepEqual(await names("--journal", "project"), ["puppeteer"]);
});

test("no notes: a short message on stderr, exit 0; --json gives an empty page", async () => {
  const box = sandbox();
  const r = await magpie(box, ["catalog"]);
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
  assert.equal(r.err, "No notes.\n");
  const filtered = await magpie(sandbox(FILES), ["catalog", "--tag", "nothing"]);
  assert.equal(filtered.err, "No notes match these filters.\n");
  assert.deepEqual(JSON.parse((await magpie(box, ["catalog", "--json"])).out), { columns: ["name", "kind", "journal", "avoid", "summary", "verdict"], rows: [], total: 0, next_cursor: null });
  assert.deepEqual(JSON.parse((await magpie(box, ["catalog", "--full", "--json"])).out), { notes: [], total: 0, next_cursor: null });
});

test("usage errors exit 2: a bad cursor (with --json: the document and its error), --limit out of 1–1000, an unknown --kind", async () => {
  const box = sandbox(FILES);
  const bad = await magpie(box, ["catalog", "--cursor", "nope"]);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /^repomagpie catalog: Not a cursor from repomagpie catalog\./);
  const json = await magpie(box, ["catalog", "--cursor", "nope", "--json"]);
  assert.equal(json.code, 2);
  assert.deepEqual({ ...JSON.parse(json.out), error: "…" }, { columns: ["name", "kind", "journal", "avoid", "summary", "verdict"], rows: [], total: 0, next_cursor: null, error: "…" });
  for (const argv of [["catalog", "--limit", "0"], ["catalog", "--limit", "1001"], ["catalog", "--limit", "many"], ["catalog", "--kind", "gadget"]]) {
    assert.equal((await magpie(box, argv)).code, 2, argv.join(" "));
  }
  assert.equal((await magpie(box, ["catalog", "--limit", "1000"])).code, 0);
});

test("a note's hidden characters show as markers for people too, never raw", async () => {
  const rtl = String.fromCharCode(0x202e);
  const box = sandbox({ "journal/notes/npm--evil.md": note({ id: "pkg:npm/evil", name: "evil", verdict: `txt${rtl}exe.` }) });
  const r = await magpie(box, ["catalog"]);
  assert.ok(r.out.includes("Verdict: txt<U+202E>exe."), r.out);
  assert.ok(!r.out.includes(rtl));
});

test("a skipped file is reported on stderr, once", async () => {
  const box = sandbox(FILES);
  writeFileSync(join(box.journal, "notes", "npm--huge.md"), note({ id: "pkg:npm/huge", name: "huge" }) + "x".repeat(300 * 1024));
  const r = await magpie(box, ["catalog"]);
  assert.equal(r.code, 0);
  assert.equal((r.err.match(/warning: skipped: .*npm--huge\.md/g) ?? []).length, 1, r.err);
});
