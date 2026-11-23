import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";
import type { Call } from "../core/fixtures/fake-fetch.ts";
import { fakeStars, starredItems } from "../core/fixtures/fake-stars.ts";
import { readNote, validate } from "../core/note.ts";
import { magpie, sandbox, type Box } from "./fixtures/sandbox.ts";

// repomagpie import --stars (decision 0068), in temporary journals with a fake starred list
// (fixtures/github/starred.json): no request leaves the machine.

const TOKEN = "ghp_fakeTokenNeverPrinted123";
const env = (box: Box, extra: Record<string, string> = {}) => ({ MAGPIE_HOME: box.journal, GITHUB_TOKEN: TOKEN, ...extra });
const stars = (box: Box, args: string[], over: Parameters<typeof magpie>[2] = {}) => magpie(box, ["import", "--stars", ...args], { env: env(box), fetch: fakeStars(), ...over });
const notes = (box: Box) => (existsSync(join(box.journal, "notes")) ? readdirSync(join(box.journal, "notes")).sort() : []);
const noToken = (r: { out: string; err: string }) => assert.ok(!`${r.out}${r.err}`.includes(TOKEN), "the token is never printed");

test("without --yes and without a terminal: the summary, the command to run, and nothing written", async () => {
  const box = sandbox();
  const r = await stars(box, []);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, [
    "Your GitHub stars: 6.",
    "  6 new, 0 already in your journal.",
    "  Top languages: TypeScript 2, Go 1, JavaScript 1, Rust 1",
    "  Top topics: automation 1, chromium 1, cli 1, e2e-testing 1, firefox 1",
    "Import all 6 of 6 new stars, starred 2026-03-01 to 2026-11-20:",
    "  microsoft/playwright · TypeScript",
    "  colinhacks/zod · TypeScript",
    "  request/request · JavaScript · archived",
    "  example-org/no-license-tool · Go",
    "  astral-sh/ruff · Rust",
    "  example-org/starter-template",
    "",
  ].join("\n"));
  assert.equal(r.err, "Reading your stars from GitHub…\nNothing was written. To import these 6, run:\n  repomagpie import --stars --yes\n");
  assert.deepEqual(notes(box), [], "nothing written");
  assert.ok(!existsSync(box.journal), "not even the journal");
  noToken(r);
});

test("--yes: each star becomes a valid inbox note marked starred, from the list alone (no request per repository)", async () => {
  const box = sandbox();
  const calls: Call[] = [];
  const r = await stars(box, ["--yes"], { fetch: fakeStars({ calls }) });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(calls.map((c) => new URL(c.url).pathname + new URL(c.url).search), ["/user/starred?per_page=100&page=1"]);
  assert.equal(calls[0].headers.Accept, "application/vnd.github.star+json");
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.match(r.out, /^created pkg:github\/microsoft\/playwright$/m);
  assert.match(r.err, /6 starred notes in your personal journal's inbox\. They stay out of recall and the hook until you write a Verdict\.\n$/);
  assert.equal(notes(box).length, 6);
  for (const file of notes(box)) {
    const text = readFileSync(join(box.journal, "notes", file), "utf8");
    assert.deepEqual(validate(readNote(text), { fileName: parse(file).base }), [], file);
    assert.equal(readNote(text).status, "inbox");
  }
  const playwright = readNote(readFileSync(box.note("github--microsoft--playwright.md"), "utf8")).frontmatter;
  assert.equal(playwright.starred, "2026-11-20");
  assert.equal(playwright.explored, "2026-10-04");
  assert.equal(playwright.license, "Apache-2.0");
  assert.deepEqual(playwright.topics, ["e2e-testing", "testing", "automation", "chromium", "firefox", "webkit"]);
  assert.deepEqual(playwright.packages, [], "the list has no manifests");
  assert.equal(readNote(readFileSync(box.note("github--example-org--no-license-tool.md"), "utf8")).frontmatter.license, "unknown", "a missing licence");
  assert.equal(readNote(readFileSync(box.note("github--example-org--starter-template.md"), "utf8")).frontmatter.kind, "template", "the template flag");
  assert.match(readFileSync(box.note("github--colinhacks--zod.md"), "utf8"), /## What it does\n<!-- magpie:draft -->\nTypeScript-first schema validation/);
  noToken(r);
});

test("a re-run imports only new stars and says how many are already in the journal; a deleted star's note stays", async () => {
  const box = sandbox();
  await stars(box, ["--yes"]);
  const again = await stars(box, []);
  assert.match(again.out, /^ {2}0 new, 6 already in your journal\.$/m);
  assert.match(again.out, /^Every star is already in your journal\. Nothing to import\.$/m);
  const more = await stars(box, ["--yes"], { fetch: fakeStars({ items: starredItems(8) }) });
  assert.match(more.out, /^ {2}2 new, 6 already in your journal\.$/m);
  assert.equal(notes(box).length, 8);
  // Unstarring never deletes a note: a list without zod leaves its note.
  await stars(box, ["--yes"], { fetch: fakeStars({ items: starredItems(8).filter((s) => s.repo.full_name !== "colinhacks/zod") }) });
  assert.ok(existsSync(box.note("github--colinhacks--zod.md")));
});

test("delete finds a starred note; a re-run then skips its star because the note is in the trash, and says so", async () => {
  const box = sandbox();
  await stars(box, ["--yes"]);
  const deleted = await magpie(box, ["delete", "https://github.com/colinhacks/zod", "--yes"], { env: env(box) });
  assert.equal(deleted.code, 0, deleted.err);
  assert.ok(!existsSync(box.note("github--colinhacks--zod.md")), deleted.out + deleted.err);
  const again = await stars(box, []);
  assert.match(again.out, /^ {2}0 new, 5 already in your journal, 1 skipped because they're in the trash\.$/m);
  assert.match(again.out, /^Every star is already in your journal or its trash\. Nothing to import\.$/m);
  const forced = JSON.parse((await stars(box, ["--yes", "--all", "--json"])).out);
  assert.deepEqual([forced.in_trash, forced.new, forced.created, forced.selected], [1, 0, 0, []]);
  assert.ok(!existsSync(box.note("github--colinhacks--zod.md")), "the deleted note doesn't come back");
  assert.deepEqual(JSON.parse((await stars(box, ["--json"])).out).in_trash, 1);
  // A new star is still imported next to the trashed one.
  const more = await stars(box, ["--yes"], { fetch: fakeStars({ items: starredItems(7) }) });
  assert.match(more.out, /^ {2}1 new, 5 already in your journal, 1 skipped because they're in the trash\.$/m);
  assert.equal(notes(box).length, 6);
});

test("the filters: --limit, --language, --topic, --since and --all, each as the summary and the import say", async () => {
  const box = sandbox();
  const selected = async (args: string[], items = starredItems()) => {
    const r = await stars(box, [...args, "--json"], { fetch: fakeStars({ items }) });
    assert.equal(r.code, 0, r.err);
    return (JSON.parse(r.out).selected as { name: string }[]).map((s) => s.name);
  };
  assert.deepEqual(await selected(["--limit", "2"]), ["microsoft/playwright", "colinhacks/zod"]);
  assert.deepEqual(await selected(["--language", "rust"]), ["astral-sh/ruff"], "any case");
  assert.deepEqual(await selected(["--language", "Go", "--language", "Rust"]), ["example-org/no-license-tool", "astral-sh/ruff"]);
  assert.deepEqual(await selected(["--topic", "cli"]), ["example-org/no-license-tool"]);
  assert.deepEqual(await selected(["--language", "TypeScript", "--topic", "schema"]), ["colinhacks/zod"], "both");
  assert.deepEqual(await selected(["--since", "2026-10-02"]), ["microsoft/playwright", "colinhacks/zod", "request/request"]);
  assert.equal((await selected([], starredItems(150))).length, 100, "the default: the 100 most recent");
  assert.equal((await selected(["--all"], starredItems(150))).length, 150);
  const summary = await stars(box, ["--topic", "cli"]);
  assert.match(summary.out, /^Import all 1 of 1 new stars these filters keep, starred 2026-08-30 to 2026-08-30:$/m);
  assert.match(summary.err, /\n {2}repomagpie import --stars --topic cli --yes\n$/);
});

test("usage: a bad flag value, --all with --limit, the star flags without --stars, a file with --stars: exit 2, nothing read", async () => {
  const box = sandbox();
  const calls: Call[] = [];
  const fetch = fakeStars({ calls });
  for (const [args, message] of [
    [["import", "--stars", "--all", "--limit", "5"], "--all and --limit can't be used together."],
    [["import", "--stars", "--since", "yesterday"], "--since takes a date written YYYY-MM-DD."],
    [["import", "--stars", "--user", "not a login"], "--user takes a GitHub login"],
    [["import", "list.md", "--limit", "5"], "--limit goes with --stars."],
    [["import", "list.md", "--stars"], "Pass a file or --stars, not both."],
    [["import"], "Name a file to import, or pass --stars for your GitHub stars."],
  ] as const) {
    const r = await magpie(box, [...args], { env: env(box), fetch });
    assert.equal(r.code, 2, `${args.join(" ")}: ${r.err}`);
    assert.ok(r.err.includes(message), `${args.join(" ")}: ${r.err}`);
  }
  assert.deepEqual(calls, []);
});

test("your own stars need a token; --user reads someone's public stars without one", async () => {
  const box = sandbox();
  const calls: Call[] = [];
  const mine = await magpie(box, ["import", "--stars"], { fetch: fakeStars({ calls }) });
  assert.equal(mine.code, 1);
  assert.match(mine.err, /Reading your own stars needs a GitHub token\. Run gh auth login, or set GITHUB_TOKEN; or pass --user <login>/);
  assert.equal(calls.length, 0, "no request without a token");
  const theirs = await magpie(box, ["import", "--stars", "--user", "octocat", "--yes"], { fetch: fakeStars({ calls }) });
  assert.equal(theirs.code, 0, theirs.err);
  assert.equal(new URL(calls[0].url).pathname, "/users/octocat/starred");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.match(theirs.out, /^octocat's public GitHub stars: 6\.$/m);
  assert.equal(notes(box).length, 6);
});

test("a rate limit stops the list cleanly: what was read is imported, and the same command resumes", async () => {
  const box = sandbox();
  const items = starredItems(250);
  const first = await stars(box, ["--all", "--yes"], { fetch: fakeStars({ items, limitAfter: 2 }) });
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /^Your GitHub stars: 200 read \(not all\)\.$/m);
  assert.match(first.err, /warning: GitHub's rate limit stopped the list after 200 stars, the newest: GitHub's rate limit is used up/);
  assert.match(first.err, /The list was cut short\. Run the same command again later to import the rest; stars already noted are skipped:\n {2}repomagpie import --stars --all --yes\n$/);
  assert.equal(notes(box).length, 200);
  const resumed = await stars(box, ["--all", "--yes"], { fetch: fakeStars({ items }) });
  assert.match(resumed.out, /^ {2}50 new, 200 already in your journal\.$/m);
  assert.equal(notes(box).length, 250);
  noToken(first);
});

test("a rate limit or a rejected token before any page: exit 1, nothing written, the token never printed", async () => {
  const box = sandbox();
  const limited = await stars(box, ["--yes"], { fetch: fakeStars({ limitAfter: 0 }) });
  assert.equal(limited.code, 1);
  assert.match(limited.err, /repomagpie import: GitHub's rate limit is used up/);
  const rejected = await stars(box, ["--yes", "--json"], { fetch: fakeStars({ status: 401 }) });
  assert.equal(rejected.code, 1);
  const doc = JSON.parse(rejected.out);
  assert.match(doc.error, /GitHub rejected the request \(401\): the GitHub token may be invalid or expired/);
  assert.equal(doc.problem.kind, "auth");
  assert.deepEqual(notes(box), []);
  noToken(limited);
  noToken(rejected);
});

test("--json: the preview without --yes (written false), the import with it", async () => {
  const box = sandbox();
  const preview = await stars(box, ["--json", "--limit", "1"]);
  assert.equal(preview.code, 0);
  assert.equal(preview.err, "");
  const doc = JSON.parse(preview.out);
  assert.deepEqual(Object.keys(doc), ["user", "journal", "total", "complete", "languages", "topics", "in_journal", "in_trash", "new", "filters", "matching", "selected", "written", "created", "failed", "items", "tags_md_added", "problem", "warnings"]);
  assert.deepEqual({ total: doc.total, new: doc.new, matching: doc.matching, written: doc.written, filters: doc.filters }, { total: 6, new: 6, matching: 6, written: false, filters: { limit: 1, languages: [], topics: [], since: null } });
  assert.deepEqual(doc.selected[0], {
    name: "microsoft/playwright", id: "pkg:github/microsoft/playwright", url: "https://github.com/microsoft/playwright", description: "Playwright is a framework for Web Testing and Automation.",
    language: "TypeScript", license: "Apache-2.0", topics: ["e2e-testing", "testing", "automation", "chromium", "firefox", "webkit"], archived: false, pushed_at: "2026-11-19T22:01:12Z", starred: "2026-11-20", in_journal: [], in_trash: [],
  });
  assert.deepEqual(notes(box), []);
  const done = JSON.parse((await stars(box, ["--json", "--limit", "1", "--yes"])).out);
  assert.deepEqual([done.written, done.created, done.items], [true, 1, [{ id: "pkg:github/microsoft/playwright", result: "created", error: null, warnings: [] }]]);
});

test("after an import: catalog leaves starred notes out unless --include-starred; recall and search say starred", async () => {
  const box = sandbox();
  await stars(box, ["--yes"]);
  const plain = await magpie(box, ["catalog"]);
  assert.deepEqual([plain.code, plain.out, plain.err], [0, "", "No notes.\n"]);
  const all = await magpie(box, ["catalog", "--include-starred"]);
  assert.match(all.out, /^colinhacks\/zod\s+other\s+personal\s+\[inbox\] starred on GitHub, not reviewed$/m);
  assert.equal(JSON.parse((await magpie(box, ["catalog", "--include-starred", "--json"])).out).total, 6);
  const recalled = await magpie(box, ["recall", "zod"]);
  assert.deepEqual([recalled.code, recalled.out, recalled.err], [0, "", "You starred zod on GitHub; no note yet.\n"]);
  const found = await magpie(box, ["search", "zod"]);
  assert.match(found.out, /^1\s+colinhacks\/zod\s+github\s+personal\s+\[inbox\] starred on GitHub, not reviewed$/m);
});

test("in a terminal: asks once; yes imports, anything else writes nothing", async () => {
  const box = sandbox();
  const asked: string[] = [];
  const no = await stars(box, ["--limit", "2"], { interactive: true, ask: async (q) => { asked.push(q); return "n"; } });
  assert.equal(no.code, 0);
  assert.deepEqual(asked, ["Import these 2 into your personal journal's inbox? [y/N] "]);
  assert.match(no.err, /Cancelled\. Nothing was written\.\n$/);
  assert.deepEqual(notes(box), []);
  const yes = await stars(box, ["--limit", "2"], { interactive: true, ask: async () => "y" });
  assert.equal(yes.code, 0, yes.err);
  assert.deepEqual(notes(box), ["github--colinhacks--zod.md", "github--microsoft--playwright.md"]);
});
