import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fakeFetch, type Call } from "../core/fixtures/fake-fetch.ts";
import { renderNote } from "../core/write.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// The sandbox's today is 2026-10-04.
const BASE = "archived:false fork:false stars:>=10 pushed:>=2024-10-04";
const path = (q: string) => `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20&page=1`;
const repo = (name: string, over: Record<string, unknown> = {}) => ({
  full_name: name, html_url: `https://github.com/${name}`, description: "A design system for React.", stargazers_count: 98_100, forks_count: 6512,
  open_issues_count: 3, pushed_at: "2026-07-04T00:00:00Z", license: { spdx_id: "MIT" }, archived: false, language: "TypeScript", topics: ["design-system", "react"], ...over,
});
const answer = (total: number, ...items: unknown[]) => ({ total_count: total, incomplete_results: false, items });
const KEYS = ["query", "searches", "approximate", "total", "next_page", "incomplete", "cached", "results", "warnings", "problem"];

test("discover --json: one document, the spec's keys, a result's fields", async () => {
  const box = sandbox();
  const { code, out, err } = await magpie(box, ["discover", "design system", "--json"], { fetch: fakeFetch({ [path(`design system in:name,description,topics ${BASE}`)]: answer(3, repo("acme/ui")) }) });
  assert.equal(code, 0);
  assert.equal(err, "");
  const doc = JSON.parse(out) as Record<string, unknown> & { results: Record<string, unknown>[]; query: Record<string, unknown> };
  assert.deepEqual(Object.keys(doc), KEYS);
  assert.deepEqual(doc.query, { text: "design system", domain: null, kind: null, topics: [], language: null, min_stars: 10, updated_within: 24, include_archived: false, sort: "stars", limit: 20, page: 1 });
  assert.deepEqual(Object.keys(doc.results[0]), ["name", "url", "description", "stars", "forks", "open_issues", "pushed_at", "license", "archived", "language", "topics", "updated", "estimated_kind", "suggested_domains", "in_journal"]);
  assert.equal(out.trim().split("\n").length, 1);
});

test("discover for people: a block per result, the description on one line, what a journal has, then how to add one", async () => {
  const box = sandbox();
  mkdirSync(join(box.journal, "notes"), { recursive: true });
  writeFileSync(box.note("github--acme--ui.md"), renderNote({ id: "pkg:github/acme/ui", name: "acme/ui", explored: "2026-10-01", kind: "library", tags: [], verdict: "our default UI kit" }));
  const fetch = fakeFetch({ [path(`ui in:name,description,topics ${BASE}`)]: answer(1234, repo("acme/ui"), repo("acme/old", { license: null, archived: true, topics: ["awesome-list"], description: `line one\nline two ${"x".repeat(200)}`, stargazers_count: 12 })) });
  const { code, out, err } = await magpie(box, ["discover", "ui"], { fetch, columns: 80 });
  assert.equal(code, 0);
  assert.deepEqual(out.split("\n"), [
    "acme/ui · ⭐ 98.1k · 6.5k forks · updated 3 months ago · MIT · styling",
    "  A design system for React.",
    "  in your personal journal, Verdict: our default UI kit",
    "acme/old · ⭐ 12 · 6.5k forks · updated 3 months ago · no licence · archived · awesome-list (estimated)",
    `  line one line two ${"x".repeat(59)}…`,
    "",
  ]);
  assert.equal(err, "2 of 1.2k on GitHub. More: the same command with --page 2.\nAdd one to your inbox: repomagpie note https://github.com/acme/ui\n");
});

test("what a journal has is one line of at most about 100 characters, cut at a word, and named: the Verdict, else What it does", async () => {
  const box = sandbox();
  mkdirSync(join(box.journal, "notes"), { recursive: true });
  const long = "use it for the invoice export at work, never for anything that streams large files, and pin the major version because\nthe API changed twice";
  writeFileSync(box.note("github--acme--ui.md"), renderNote({ id: "pkg:github/acme/ui", name: "acme/ui", explored: "2026-10-01", kind: "library", tags: [], verdict: long }));
  writeFileSync(box.note("github--acme--draft.md"), renderNote({ id: "pkg:github/acme/draft", name: "acme/draft", explored: "2026-10-01", kind: "library", tags: [], whatItDoes: "Renders PDF invoices\nfrom HTML templates." }));
  writeFileSync(box.note("github--acme--bare.md"), renderNote({ id: "pkg:github/acme/bare", name: "acme/bare", explored: "2026-10-01", kind: "library", tags: [] }));
  const fetch = fakeFetch({ [path(`ui in:name,description,topics ${BASE}`)]: answer(3, repo("acme/ui"), repo("acme/draft"), repo("acme/bare")) });
  const { code, out } = await magpie(box, ["discover", "ui"], { fetch, columns: 200 });
  assert.equal(code, 0);
  const lines = out.split("\n").filter((line) => line.startsWith("  in "));
  assert.deepEqual(lines, [
    "  in your personal journal, Verdict: use it for the invoice export at work, never for anything that streams large files, and pin the…",
    "  in your personal journal, What it does: Renders PDF invoices from HTML templates.",
    "  in your personal journal, in the inbox, no Verdict yet",
  ]);
  const doc = JSON.parse((await magpie(box, ["discover", "ui", "--json"], { fetch })).out) as { results: { in_journal: unknown[] }[] };
  assert.deepEqual(doc.results.map((r) => r.in_journal), [
    [{ journal: "personal", id: "pkg:github/acme/ui", verdict: long.replace("\n", " "), what_it_does: null }],
    [{ journal: "personal", id: "pkg:github/acme/draft", verdict: null, what_it_does: "Renders PDF invoices from HTML templates." }],
    [{ journal: "personal", id: "pkg:github/acme/bare", verdict: null, what_it_does: null }],
  ]);
});

test("no results is exit 0 with a message; no words and no filter is exit 2", async () => {
  const box = sandbox();
  const none = await magpie(box, ["discover", "zzz"], { fetch: fakeFetch({ [path(`zzz in:name,description,topics ${BASE}`)]: answer(0) }) });
  assert.equal(none.code, 0);
  assert.match(none.err, /GitHub found no repositories for this search\. Loosen it/);
  const calls: Call[] = [];
  const empty = await magpie(box, ["discover"], { fetch: fakeFetch({}, calls) });
  assert.equal(empty.code, 2);
  assert.match(empty.err, /^repomagpie discover: Give words or a filter/);
  const json = await magpie(box, ["discover", "--json"], { fetch: fakeFetch({}, calls) });
  assert.equal(json.code, 2);
  assert.match((JSON.parse(json.out) as { error: string }).error, /Give words or a filter/);
  assert.equal(calls.length, 0);
});

test("--domain and --kind take their fixed lists, and the error names them", async () => {
  const box = sandbox();
  const domain = await magpie(box, ["discover", "--domain", "web"]);
  assert.equal(domain.code, 2);
  assert.match(domain.err, /Allowed choices are architecture, security, performance, styling, database, testing, auth, api, devops, observability, ai, tooling/);
  const kind = await magpie(box, ["discover", "--kind", "tool"]);
  assert.equal(kind.code, 2);
  assert.match(kind.err, /Allowed choices are .*skill-pack/);
  for (const args of [["--limit", "51"], ["--page", "0"], ["--min-stars", "-1"], ["--sort", "name"]]) assert.equal((await magpie(box, ["discover", "x", ...args])).code, 2, args.join(" "));
});

test("GitHub's search limit or no connection is exit 1, with problem in --json", async () => {
  const box = sandbox();
  const limited = fakeFetch({}, [], () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "4102444800", "x-ratelimit-resource": "search" } }));
  const json = await magpie(box, ["discover", "x", "--json"], { fetch: limited });
  assert.equal(json.code, 1);
  const doc = JSON.parse(json.out) as { problem: { kind: string; reset: string }; error: string; results: unknown[] };
  assert.equal(doc.problem.kind, "search-rate-limit");
  assert.match(doc.problem.reset, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(doc.error, /shared with every other program and device that uses it.*Set GITHUB_TOKEN for 30 a minute of your own\.$/);
  assert.deepEqual(doc.results, []);
  const offline = await magpie(box, ["discover", "x"], { fetch: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch });
  assert.equal(offline.code, 1);
  assert.equal(offline.err, "repomagpie discover: Can't reach GitHub. Check your connection.\n");
});

test("a reset time already past is never printed, on the search limit's own path: in a minute instead", async () => {
  const box = sandbox();
  const past = String(Math.floor(Date.now() / 1000) - 7 * 60);
  const limited = fakeFetch({}, [], () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": past, "x-ratelimit-resource": "search" } }));
  const human = await magpie(box, ["discover", "design system", "--domain", "styling"], { fetch: limited });
  assert.equal(human.code, 1);
  assert.match(human.err, /^repomagpie discover: GitHub's search limit is used up; try again in a minute\. Without a token/m);
  assert.doesNotMatch(human.err, /UTC/);
  const json = JSON.parse((await magpie(box, ["discover", "x", "--json"], { fetch: limited })).out) as { problem: Record<string, unknown> };
  assert.equal(json.problem.kind, "search-rate-limit");
  assert.ok(!("reset" in json.problem));
});

test("a limit that ends within a minute is waited out once: one line says so first, and --json stays one document", async () => {
  const box = sandbox();
  // GitHub's secondary limit asks for 1 second: the CLI waits 2 (a second more), then asks again.
  let n = 0;
  const fetch = fakeFetch({}, [], () =>
    ++n % 2 === 1
      ? new Response(JSON.stringify({ message: "You have exceeded a secondary rate limit." }), { status: 403, headers: { "retry-after": "1" } })
      : new Response(JSON.stringify(answer(1, repo("acme/ui")))),
  );
  const human = await magpie(box, ["discover", "ui"], { fetch });
  assert.equal(human.code, 0);
  assert.equal(human.err.split("\n")[0], "GitHub's secondary rate limit stopped the request; waiting 2 seconds, then trying once more.");
  assert.match(human.out, /^acme\/ui · /);
  const json = await magpie(box, ["discover", "other", "--json"], { fetch });
  assert.equal(json.code, 0);
  assert.equal(json.err, "");
  assert.equal((JSON.parse(json.out) as { results: unknown[] }).results.length, 1);
  assert.equal(n, 4);
});

test("an answer from the cache: one quiet line says so, and --json has cached: true", async () => {
  const box = sandbox();
  mkdirSync(join(box.journal, "notes"), { recursive: true });
  const calls: Call[] = [];
  const fetch = fakeFetch({ [path(`ui in:name,description,topics ${BASE}`)]: answer(1, repo("acme/ui")) }, calls);
  const first = await magpie(box, ["discover", "ui"], { fetch });
  assert.doesNotMatch(first.err, /cache/i);
  const second = await magpie(box, ["discover", "ui"], { fetch });
  assert.equal(second.code, 0);
  assert.equal(second.out, first.out);
  assert.equal(second.err.split("\n")[0], "From the cache: GitHub answered this search in the last 10 minutes.");
  assert.equal(second.err.split("\n").filter((line) => /cache/i.test(line)).length, 1);
  const json = JSON.parse((await magpie(box, ["discover", "ui", "--json"], { fetch })).out) as { cached: boolean };
  assert.equal(json.cached, true);
  assert.equal(calls.length, 1);
});

test("REPOMAGPIE_DEBUG_HTTP=1: each request's path and query, status, GitHub's rate-limit headers and a failing body's start on stderr; never Authorization or the token", async () => {
  const box = sandbox();
  const calls: Call[] = [];
  const fetch = fakeFetch({}, calls, () => new Response(JSON.stringify({ message: `API rate limit exceeded ${"x".repeat(300)}` }), {
    status: 403,
    headers: { date: "Tue, 27 Oct 2026 15:01:02 GMT", "x-ratelimit-limit": "10", "x-ratelimit-remaining": "0", "x-ratelimit-used": "10", "x-ratelimit-reset": "4102444800", "x-ratelimit-resource": "search", "x-github-request-id": "ABCD:1234" },
  }));
  const env = { MAGPIE_HOME: box.journal, GITHUB_TOKEN: "ghp_never_shown", REPOMAGPIE_DEBUG_HTTP: "1" };
  for (const args of [["discover", "x"], ["discover", "x", "--json"]]) {
    const r = await magpie(box, args, { fetch, env });
    const lines = r.err.split("\n").filter((line) => line.startsWith("debug http: "));
    assert.equal(lines.length, 1, r.err);
    assert.match(lines[0], /^debug http: \d{4}-\d\d-\d\dT[\d:.]+Z GET \/search\/repositories\?q=x%20in%3Aname/);
    assert.match(lines[0], / -> 403; date: Tue, 27 Oct 2026 15:01:02 GMT; x-ratelimit-limit: 10; x-ratelimit-remaining: 0; x-ratelimit-used: 10; x-ratelimit-reset: 4102444800; x-ratelimit-resource: search body: \{"message":"API rate limit exceeded x+$/);
    assert.equal(lines[0].split(" body: ")[1].length, 200);
    assert.doesNotMatch(r.out + r.err, /ghp_never_shown|authorization|bearer|x-github-request-id/i);
  }
  assert.equal(calls[0].headers.Authorization, "Bearer ghp_never_shown"); // sent, never printed
  const quiet = await magpie(box, ["discover", "x"], { fetch, env: { MAGPIE_HOME: box.journal } });
  assert.doesNotMatch(quiet.err, /debug http/);
});

test("the token is never printed, in either output", async () => {
  const box = sandbox();
  const fetch = fakeFetch({}, [], () => new Response("{}", { status: 401 }));
  for (const args of [["discover", "x"], ["discover", "x", "--json"]]) {
    const r = await magpie(box, args, { fetch, env: { MAGPIE_HOME: box.journal, GITHUB_TOKEN: "ghp_never_shown" } });
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.out + r.err, /ghp_never_shown/);
  }
});
