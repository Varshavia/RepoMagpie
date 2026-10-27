import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOMAIN_IDS, DOMAIN_MAP } from "./domains.ts";
import { APPROXIMATE_KINDS, buildQueries, discoverProblem, DOMAIN_TOPICS, runDiscover, type DiscoverInput } from "./discover.ts";
import { fakeFetch, recorded, type Call } from "./fixtures/fake-fetch.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Fetch, FetchProblem } from "./github.ts";
import type { Context } from "./save.ts";
import { renderNote } from "./write.ts";

const TODAY = "2026-10-26";
const path = (q: string, rest = "&sort=stars&order=desc&per_page=20&page=1") => `/search/repositories?q=${encodeURIComponent(q)}${rest}`;
const BASE = "archived:false fork:false stars:>=10 pushed:>=2024-10-26";

// A scratch journal (and a project journal beside it), and a context whose fetch answers `responses`.
function setup(responses: Record<string, unknown> = {}, over: { env?: Record<string, string>; fetch?: Fetch; journal?: boolean } = {}) {
  const root = scratchBase("discover");
  const journal = join(root, "journal");
  const project = join(root, "project");
  mkdirSync(join(project, ".git"), { recursive: true });
  if (over.journal !== false) mkdirSync(join(journal, "notes"), { recursive: true });
  const calls: Call[] = [];
  const context: Context = { home: join(root, "home"), env: { MAGPIE_HOME: journal, ...over.env }, cwd: project, fetch: over.fetch ?? fakeFetch(responses, calls), today: () => TODAY };
  return { root, journal, project, calls, context };
}

const item = (name: string, over: Record<string, unknown> = {}) => ({
  full_name: name,
  html_url: `https://github.com/${name}`,
  description: `${name} does things`,
  stargazers_count: 100,
  forks_count: 10,
  open_issues_count: 1,
  pushed_at: "2026-07-26T10:00:00Z",
  updated_at: "2026-07-26T10:00:00Z",
  license: { spdx_id: "MIT" },
  archived: false,
  language: "TypeScript",
  topics: [],
  score: 1,
  ...over,
});
const answer = (...items: unknown[]) => ({ total_count: items.length, incomplete_results: false, items });

// --- Building the query (decision 0045) ---

test("the words, where to look, the archived and fork filters, stars and the push date make the default query", () => {
  assert.deepEqual(buildQueries({ text: "  design   system " }, TODAY), { queries: [`design system in:name,description,topics ${BASE}`], postKind: null, leftOut: [] });
});

test("every flag has its qualifier; a language with a space is quoted; topics are ANDed, each once", () => {
  const input: DiscoverInput = { text: "charts", topics: ["react", "charts", "react"], language: "Jupyter Notebook", minStars: 1000, updatedWithin: 6, includeArchived: true };
  assert.deepEqual(buildQueries(input, TODAY).queries, ['charts in:name,description,topics fork:false stars:>=1000 pushed:>=2026-04-26 language:"Jupyter Notebook" topic:react topic:charts']);
  assert.deepEqual(buildQueries({ language: "Rust", updatedWithin: 0 }, TODAY).queries, ["archived:false fork:false stars:>=10 language:Rust"]);
});

test("updated within keeps the day, or takes the month's last day when it has fewer", () => {
  assert.match(buildQueries({ text: "x", updatedWithin: 1 }, "2026-03-31").queries[0], /pushed:>=2026-02-28/);
  assert.match(buildQueries({ text: "x", updatedWithin: 12 }, "2026-01-15").queries[0], /pushed:>=2025-01-15/);
});

test("a domain is one request per topic, since GitHub's search can't OR qualifiers", () => {
  assert.deepEqual(buildQueries({ domain: "styling" }, TODAY).queries, DOMAIN_TOPICS.styling.map((t) => `${BASE} topic:${t}`));
  assert.deepEqual(buildQueries({ text: "ui", domain: "styling", topics: ["css"] }, TODAY).queries.length, 3); // "css" once in its own query
});

test("at most maxRequests requests: the first topics, and leftOut names the rest", () => {
  assert.deepEqual(buildQueries({ domain: "styling" }, TODAY, 2), { queries: ["css", "tailwindcss"].map((t) => `${BASE} topic:${t}`), postKind: null, leftOut: ["design"] });
  assert.deepEqual(buildQueries({ kind: "template" }, TODAY, 2), { queries: ["template", "starter"].map((t) => `${BASE} topic:${t}`), postKind: null, leftOut: ["boilerplate"] });
  assert.deepEqual(buildQueries({ kind: "awesome-list", domain: "testing" }, TODAY, 2).queries, ["testing", "jest"].map((t) => `${BASE} topic:${t} topic:awesome-list`));
  assert.deepEqual(buildQueries({ text: "x" }, TODAY, 2).leftOut, []);
});

test("each domain's search topics map to that domain on their own: never the generic ai, nor playwright", () => {
  for (const domain of DOMAIN_IDS) {
    const topics = DOMAIN_TOPICS[domain];
    assert.ok(topics.length >= 2 && topics.length <= 4, domain);
    for (const topic of topics) {
      assert.equal(DOMAIN_MAP[topic], domain, `${topic} → ${domain}`);
      assert.ok(!["ai", "artificial-intelligence", "playwright"].includes(topic), topic);
    }
  }
});

test("a kind topics name is searched by them; beside a domain, a kind with one topic joins each request", () => {
  assert.deepEqual(buildQueries({ kind: "template" }, TODAY).queries, ["template", "starter", "boilerplate"].map((t) => `${BASE} topic:${t}`));
  assert.deepEqual(buildQueries({ kind: "awesome-list", domain: "testing" }, TODAY).queries, DOMAIN_TOPICS.testing.map((t) => `${BASE} topic:${t} topic:awesome-list`));
  assert.equal(buildQueries({ kind: "awesome-list", domain: "testing" }, TODAY).postKind, null);
});

test("a kind with several topics beside a domain, and the kinds topics can't name, are chosen from the results", () => {
  assert.deepEqual(buildQueries({ kind: "template", domain: "testing" }, TODAY), { queries: DOMAIN_TOPICS.testing.map((t) => `${BASE} topic:${t}`), postKind: "template", leftOut: [] });
  for (const kind of APPROXIMATE_KINDS) assert.deepEqual(buildQueries({ text: "pdf", kind }, TODAY), { queries: [`pdf in:name,description,topics ${BASE}`], postKind: kind, leftOut: [] });
  assert.deepEqual([...APPROXIMATE_KINDS].sort(), ["app", "cli", "library", "other", "plugin"]);
});

test("an input that can't be searched says why", () => {
  const cases: [DiscoverInput, RegExp][] = [
    [{}, /Give words or a filter/],
    [{ text: "   ", minStars: 100 }, /Give words or a filter/],
    [{ text: "x".repeat(257) }, /over 256 characters/],
    [{ text: `a${String.fromCharCode(0x1b)}[2J` }, /control characters/],
    [{ domain: "web" }, /domain takes one of: architecture, security/],
    [{ kind: "tool" }, /kind takes one of: .*skill-pack/],
    [{ topics: ["Not A Topic"] }, /Not a GitHub topic/],
    [{ language: "rust; rm" }, /language takes/],
    [{ text: "x", limit: 51 }, /limit takes a whole number from 1 to 50/],
    [{ text: "x", page: 0 }, /page takes/],
    [{ text: "x", limit: 50, page: 21 }, /first 1000 results; with limit 50, the last page is 20/],
    [{ text: "x", sort: "name" as never }, /sort takes one of: stars, forks, updated, best/],
  ];
  for (const [input, message] of cases) assert.match(discoverProblem(input) ?? "", message, JSON.stringify(input));
  assert.equal(discoverProblem({ kind: "library" }), null);
});

// --- Searching ---

test("a result: GitHub's numbers, the age, the licence, the estimated kind and domains, and https://github.com/<name> as its link", async () => {
  const { context, calls } = setup({
    [path(`charts in:name,description,topics ${BASE}`)]: answer(
      item("acme/charts", { topics: ["charts", "react", "css"], license: { spdx_id: "Apache-2.0" }, html_url: "javascript:alert(1)" }),
      item("acme/awesome-charts", { topics: ["awesome-list"], license: null, archived: true }),
      item("acme/other", { license: { spdx_id: "NOASSERTION" }, pushed_at: null }),
    ),
  });
  const { outcome, document } = await runDiscover({ text: "charts" }, context);
  assert.equal(outcome, "ok");
  assert.equal(calls.length, 1);
  assert.deepEqual(document.searches, [`charts in:name,description,topics ${BASE}`]);
  assert.deepEqual(document.results[0], {
    name: "acme/charts", url: "https://github.com/acme/charts", description: "acme/charts does things", stars: 100, forks: 10, open_issues: 1,
    pushed_at: "2026-07-26T10:00:00Z", license: "Apache-2.0", archived: false, language: "TypeScript", topics: ["charts", "react", "css"],
    updated: "3 months ago", estimated_kind: null, suggested_domains: ["styling"], in_journal: [],
  });
  assert.deepEqual([document.results[1].license, document.results[1].estimated_kind, document.results[1].archived], ["none", "awesome-list", true]);
  assert.deepEqual([document.results[2].license, document.results[2].pushed_at, document.results[2].updated], ["unknown", null, null]);
  assert.deepEqual([document.total, document.next_page, document.cached, document.problem, document.approximate], [3, null, false, null, null]);
});

test("the GitHub request is a GET with the search's path, the token in the Authorization header only", async () => {
  const { context, calls } = setup({ [path(`x in:name,description,topics ${BASE}`, "&per_page=5&page=2")]: answer() }, { env: { GITHUB_TOKEN: "ghp_secret_value" } });
  await runDiscover({ text: "x", sort: "best", limit: 5, page: 2 }, context);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).origin, "https://api.github.com");
  assert.equal(calls[0].headers.Authorization, "Bearer ghp_secret_value");
});

test("several requests are merged: each repository once, in the sort's order, cut to the limit; totals add up", async () => {
  const [a, b, c] = DOMAIN_TOPICS.styling.map((t) => path(`${BASE} topic:${t}`, "&sort=stars&order=desc&per_page=3&page=1"));
  const { context, calls } = setup({
    [a]: { total_count: 40, incomplete_results: false, items: [item("x/one", { stargazers_count: 50 }), item("x/two", { stargazers_count: 10 })] },
    [b]: { total_count: 2, incomplete_results: true, items: [item("X/One", { stargazers_count: 50 }), item("x/three", { stargazers_count: 90 })] },
    [c]: { total_count: 1, incomplete_results: false, items: [item("x/four", { stargazers_count: 30 })] },
  }, { env: { GITHUB_TOKEN: "t" } });
  const { document } = await runDiscover({ domain: "styling", limit: 3 }, context);
  assert.equal(calls.length, 3);
  assert.deepEqual(document.results.map((r) => r.name), ["x/three", "x/one", "x/four"]);
  assert.deepEqual([document.total, document.next_page, document.incomplete], [43, 2, true]);
  assert.deepEqual(document.warnings, []);
});

test("without a token a domain search sends 2 requests, and a warning names the topic left out", async () => {
  const [a, b] = DOMAIN_TOPICS.styling.map((t) => path(`${BASE} topic:${t}`));
  const { context, calls } = setup({ [a]: answer(item("x/one")), [b]: answer(item("x/two")) });
  const { outcome, document } = await runDiscover({ domain: "styling" }, context);
  assert.equal(outcome, "ok");
  assert.equal(calls.length, 2);
  assert.deepEqual(document.results.map((r) => r.name), ["x/one", "x/two"]);
  assert.deepEqual(document.warnings, [
    "Without GITHUB_TOKEN, only 2 of the domain styling's 3 topics were searched (css, tailwindcss; not design), to stay within GitHub's 10 searches a minute. Set GITHUB_TOKEN to search them all.",
  ]);
  const kind = setup({}, { fetch: fakeFetch({}, [], () => new Response(JSON.stringify(answer()))) });
  assert.match((await runDiscover({ kind: "template" }, kind.context)).document.warnings[0], /only 2 of the kind template's 3 topics were searched \(template, starter; not boilerplate\)/);
});

test("a search's requests go one after another, never at once", async () => {
  let open = 0;
  let most = 0;
  let sent = 0;
  const fetch = (async () => {
    most = Math.max(most, ++open);
    const n = ++sent;
    await new Promise((resolve) => setTimeout(resolve, 5));
    open--;
    return new Response(JSON.stringify(answer(item(`x/r${n}`))));
  }) as Fetch;
  const { context } = setup({}, { env: { GITHUB_TOKEN: "t" }, fetch });
  const { document } = await runDiscover({ domain: "testing" }, context);
  assert.equal(document.results.length, 3);
  assert.equal(most, 1);
});

test("a kind topics can't name keeps the results whose topics say nothing of their kind, and says the filter is approximate", async () => {
  const { context } = setup({ [path(`pdf in:name,description,topics ${BASE}`)]: answer(item("a/lib"), item("a/app", { topics: ["self-hosted"] }), item("a/list", { topics: ["awesome-list"] }), item("a/orm", { topics: ["orm"] })) });
  const library = await runDiscover({ text: "pdf", kind: "library" }, context);
  assert.deepEqual(library.document.results.map((r) => r.name), ["a/lib", "a/orm"]); // orm names a library (decision 0047)
  assert.deepEqual(library.document.results.map((r) => r.estimated_kind), [null, "library"]);
  assert.match(library.document.approximate ?? "", /can't search by the kind library/);
  const app = await runDiscover({ text: "pdf", kind: "app" }, context);
  assert.deepEqual(app.document.results.map((r) => r.name), ["a/app"]);
});

test("in_journal: the note with that PURL in either journal, ignoring case, with its Verdict", async () => {
  const { context, journal, project } = setup({ [path(`x in:name,description,topics ${BASE}`)]: answer(item("Acme/Widget"), item("acme/other"), item("acme/none")) });
  writeFileSync(join(journal, "notes", "github--acme--widget.md"), renderNote({ id: "pkg:github/acme/widget", name: "acme/widget", explored: TODAY, kind: "library", tags: [], verdict: "fine for small charts" }));
  writeFileSync(join(journal, "notes", "github--acme--other.md"), renderNote({ id: "pkg:github/acme/other", name: "acme/other", explored: TODAY, kind: "library", tags: [] }));
  mkdirSync(join(project, ".magpie", "notes"), { recursive: true });
  writeFileSync(join(project, ".magpie", "notes", "github--acme--widget.md"), renderNote({ id: "pkg:github/acme/widget", name: "acme/widget", explored: TODAY, kind: "library", tags: [], verdict: `team ${String.fromCharCode(0x202e)}says yes` }));
  const { document } = await runDiscover({ text: "x" }, context);
  assert.deepEqual(document.results.map((r) => r.in_journal), [
    [{ journal: "personal", id: "pkg:github/acme/widget", verdict: "fine for small charts", what_it_does: null }, { journal: "project", id: "pkg:github/acme/widget", verdict: "team <U+202E>says yes", what_it_does: null }],
    [{ journal: "personal", id: "pkg:github/acme/other", verdict: null, what_it_does: null }],
    [],
  ]);
});

test("in_journal: What it does for a note with no Verdict, without its comments, cleaned", async () => {
  const { context, journal } = setup({ [path(`x in:name,description,topics ${BASE}`)]: answer(item("acme/widget")) });
  const whatItDoes = `<!-- draft from GitHub -->Draws ${String.fromCharCode(0x202e)}charts.`;
  writeFileSync(join(journal, "notes", "github--acme--widget.md"), renderNote({ id: "pkg:github/acme/widget", name: "acme/widget", explored: TODAY, kind: "library", tags: [], whatItDoes }));
  const { document } = await runDiscover({ text: "x" }, context);
  assert.deepEqual(document.results[0].in_journal, [{ journal: "personal", id: "pkg:github/acme/widget", verdict: null, what_it_does: "Draws <U+202E>charts." }]);
});

test("hostile GitHub text: control, bidi and zero-width characters become markers, long text is cut and named, a name that isn't owner/repo is dropped", async () => {
  const c = (code: number) => String.fromCharCode(code);
  const { context } = setup({
    [path(`x in:name,description,topics ${BASE}`)]: answer(
      item("acme/widget", { description: `Charts ${c(0x1b)}]52;c;ZWNobw==${c(0x07)} for ${c(0x202e)}apps ${"long ".repeat(400)}`, topics: [`cl${c(0x200d)}i`, "x".repeat(80)], language: `Type${c(0x7f)}Script` }),
      item("acme/../../etc"),
      item(`acme/wid${c(0x200b)}get`),
      item("acme"),
    ),
  });
  const { document } = await runDiscover({ text: "x" }, context);
  assert.equal(document.results.length, 1);
  const [r] = document.results;
  assert.match(r.description ?? "", /^Charts <U\+001B>\]52;c;ZWNobw==<U\+0007> for <U\+202E>apps long/);
  assert.equal(r.description?.length, 1000);
  assert.ok(r.description?.endsWith("…"));
  assert.deepEqual(r.topics, ["cl<U+200D>i", `${"x".repeat(63)}…`]);
  assert.equal(r.language, "Type<U+007F>Script");
  assert.deepEqual(r.truncated, ["description", "topics"]);
  assert.doesNotMatch(JSON.stringify(document), new RegExp(`[${c(0x1b)}${c(0x202e)}${c(0x200d)}${c(0x200b)}]`));
});

// --- Problems ---

const searchLimit = (token: boolean) => () =>
  new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
    status: 403,
    headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Date.UTC(2026, 9, 26, 14, 5) / 1000), "x-ratelimit-resource": "search", ...(token ? {} : {}) },
  });

const SHARED = " Without a token, GitHub counts 10 searches a minute for your public IP address, shared with every other program and device that uses it, so other searches can use them up. Set GITHUB_TOKEN for 30 a minute of your own.";

// GitHub's real answer to the first search of a minute, recorded with REPOMAGPIE_DEBUG_HTTP=1 on
// 2026-10-27 (Windows, no token), while /rate_limit showed the search limit with none used: the
// header values copied; the address in the message replaced by a documentation one.
const LIVE_403 = () =>
  new Response(JSON.stringify({ message: "API rate limit exceeded for 203.0.113.7. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)" }), {
    status: 403,
    headers: { date: "Tue, 27 Oct 2026 15:33:36 GMT", "x-ratelimit-limit": "10", "x-ratelimit-remaining": "0", "x-ratelimit-used": "10", "x-ratelimit-reset": "1793115248", "x-ratelimit-resource": "search" },
  });

// A clock for a search that may wait: the waits pass its time and are kept.
const clock = (start: string) => {
  let t = Date.parse(start);
  const waits: number[] = [];
  const told: [number, string][] = [];
  return {
    waits,
    told,
    options: { now: () => t, wait: async (ms: number) => void (waits.push(ms), (t += ms)), onWait: (seconds: number, problem: FetchProblem) => void told.push([seconds, problem.kind]) },
  };
};

test("the live 403 on a search's first request: the wait in seconds from x-ratelimit-reset, waited out once, then the request again", async () => {
  const live = "2026-10-27T15:33:35.395Z";
  // GitHub limits it again: the search fails with the second answer, read after the wait.
  const calls: Call[] = [];
  const { context, journal } = setup({}, { fetch: fakeFetch({}, calls, LIVE_403) });
  const again = clock(live);
  const run = await runDiscover({ text: "design system", domain: "styling", limit: 5 }, context, again.options);
  assert.equal(run.outcome, "failed");
  assert.deepEqual(again.waits, [33_605]); // to 15:34:08, and a second more
  assert.deepEqual(again.told, [[34, "search-rate-limit"]]);
  assert.deepEqual(calls.map((c) => c.url), [calls[0].url, calls[0].url]);
  assert.deepEqual(run.document.problem, { kind: "search-rate-limit", message: `GitHub's search limit is used up; try again in a minute.${SHARED}` });
  assert.ok(!existsSync(CACHE(journal)));

  // Without the wait (a fixed clock that never passes the reset), the first answer's message.
  const first = await runDiscover({ text: "design system", domain: "styling", limit: 5 }, context, { now: () => Date.parse(live), wait: async () => {} });
  assert.equal(first.document.problem?.message, `GitHub's search limit is used up; try again in 33 seconds.${SHARED}`);
  assert.equal(first.document.problem?.reset, "2026-10-27T15:34:08.000Z");

  // The limit is over after the wait: the search answers, and is cached.
  let n = 0;
  const later = setup({}, { fetch: fakeFetch({}, [], () => (++n === 1 ? LIVE_403() : new Response(JSON.stringify(answer(item(n === 2 ? "x/one" : "x/two")))))) });
  const waited = clock(live);
  const ok = await runDiscover({ text: "design system", domain: "styling", limit: 5 }, later.context, waited.options);
  assert.equal(ok.outcome, "ok");
  assert.deepEqual(waited.waits, [33_605]);
  assert.deepEqual(ok.document.results.map((r) => r.name).sort(), ["x/one", "x/two"]);
  assert.ok(existsSync(CACHE(later.journal)));

  // A reset further away than 2 minutes is a clock time, and isn't waited for.
  const far = await runDiscover({ text: "design system", domain: "styling", limit: 5 }, context, { now: () => Date.parse("2026-10-27T15:30:00Z"), wait: async () => assert.fail("no wait") });
  assert.match(far.document.error ?? "", /^GitHub's search limit is used up until 15:34 UTC\./);
});

test("waiting out a rate limit: only when it ends within 60 seconds, and once a search", async () => {
  const start = "2026-10-26T14:04:00Z";
  const limitAt = (ms: number) => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(ms / 1000)), "x-ratelimit-resource": "search" } });
  const limitIn = (seconds: number) => () => limitAt(Date.parse(start) + seconds * 1000);
  // 61 seconds away: not waited.
  const long = clock(start);
  const tooFar = await runDiscover({ text: "x" }, setup({}, { fetch: fakeFetch({}, [], limitIn(61)) }).context, long.options);
  assert.deepEqual([tooFar.outcome, long.waits], ["failed", []]);
  // Exactly 60: waited, a second more.
  const edge = clock(start);
  await runDiscover({ text: "x" }, setup({}, { fetch: fakeFetch({}, [], limitIn(60)) }).context, edge.options);
  assert.deepEqual(edge.waits, [61_000]);
  // No known end ("try again in a minute"): not waited.
  const unknown = clock(start);
  await runDiscover({ text: "x" }, setup({}, { fetch: fakeFetch({}, [], limitIn(-30)) }).context, unknown.options);
  assert.deepEqual(unknown.waits, []);
  // A secondary limit's retry-after counts the same way.
  const secondary = clock(start);
  const fetch = fakeFetch({}, [], () => new Response(JSON.stringify({ message: "You have exceeded a secondary rate limit." }), { status: 403, headers: { "retry-after": "20" } }));
  const run = await runDiscover({ text: "x" }, setup({}, { fetch }).context, secondary.options);
  assert.deepEqual([secondary.waits, secondary.told], [[21_000], [[21, "secondary-rate-limit"]]]);
  assert.equal(run.document.problem?.kind, "secondary-rate-limit");
  // Once a search: a limit on the first request is waited out; one on the second, 10 seconds from
  // then, not. The first's results stay, with the warning.
  const calls: Call[] = [];
  let n = 0;
  const once = clock(start);
  const twice = fakeFetch({}, calls, () => (++n === 2 ? new Response(JSON.stringify(answer(item("x/one")))) : limitAt(once.options.now() + 10_000)));
  const partial = await runDiscover({ domain: "styling" }, setup({}, { fetch: twice }).context, once.options);
  assert.deepEqual(once.waits, [11_000]);
  assert.equal(calls.length, 3);
  assert.deepEqual(partial.document.results.map((r) => r.name), ["x/one"]);
  assert.match(partial.document.warnings.at(-1) ?? "", /^Only 1 of 2 searches ran/);
});

test("GitHub's search limit: its reset time, and without a token that GITHUB_TOKEN raises it; nothing is cached", async () => {
  const now = () => Date.UTC(2026, 9, 26, 14, 1);
  const without = setup({}, { fetch: fakeFetch({}, [], searchLimit(false)) });
  const run = await runDiscover({ text: "x" }, without.context, { now });
  assert.equal(run.outcome, "failed");
  assert.deepEqual(run.document.problem, {
    kind: "search-rate-limit",
    message: `GitHub's search limit is used up until 14:05 UTC.${SHARED}`,
    reset: "2026-10-26T14:05:00.000Z",
  });
  assert.equal(run.document.error, run.document.problem?.message);
  assert.ok(!existsSync(join(without.journal, ".cache", "discover.json")));
  const withToken = setup({}, { env: { GITHUB_TOKEN: "t" }, fetch: fakeFetch({}, [], searchLimit(true)) });
  assert.equal((await runDiscover({ text: "x" }, withToken.context, { now })).document.problem?.message, "GitHub's search limit is used up until 14:05 UTC.");
  // The same answer read after its reset time: never a time in the past.
  const later = setup({}, { fetch: fakeFetch({}, [], searchLimit(false)) });
  const late = await runDiscover({ text: "x" }, later.context, { now: () => Date.UTC(2026, 9, 26, 14, 8) });
  assert.match(late.document.error ?? "", /^GitHub's search limit is used up; try again in a minute\./);
  assert.equal(late.document.problem?.reset, undefined);
});

test("a rate limit after some requests answered: their results, with a warning, outcome ok, and nothing cached", async () => {
  const now = () => Date.UTC(2026, 9, 26, 14, 1);
  const [a, b] = DOMAIN_TOPICS.styling.map((t) => path(`${BASE} topic:${t}`));
  const calls: Call[] = [];
  const fetch = fakeFetch({ [a]: answer(item("x/one")) }, calls, (p) => (p === b ? searchLimit(false)() : undefined));
  const { context, journal } = setup({}, { fetch });
  const run = await runDiscover({ domain: "styling" }, context, { now });
  assert.equal(run.outcome, "ok");
  assert.deepEqual(run.document.results.map((r) => r.name), ["x/one"]);
  assert.deepEqual([run.document.problem, run.document.error], [null, undefined]);
  assert.deepEqual(run.document.searches, [`${BASE} topic:css`]);
  assert.equal(run.document.warnings.length, 2); // the topic left out without a token, then this
  assert.equal(run.document.warnings[1], `Only 1 of 2 searches ran: GitHub's search limit is used up until 14:05 UTC.${SHARED} The results are from the first; search again later for the rest.`);
  assert.ok(!existsSync(CACHE(journal)));
  // Asked again, it goes to GitHub again.
  await runDiscover({ domain: "styling" }, context, { now });
  assert.equal(calls.length, 4);
});

test("a rate limit on the first request, or any other failure, fails the search; a secondary limit is named as such", async () => {
  const now = () => Date.UTC(2026, 9, 26, 14, 1);
  const secondary = () => new Response(JSON.stringify({ message: "You have exceeded a secondary rate limit." }), { status: 403, headers: { "retry-after": "60" } });
  const first = setup({}, { fetch: fakeFetch({}, [], secondary) });
  const run = await runDiscover({ domain: "styling" }, first.context, { now, wait: async () => {} }); // waited once, limited again
  assert.equal(run.outcome, "failed");
  assert.deepEqual(run.document.problem, { kind: "secondary-rate-limit", message: "GitHub's secondary rate limit stopped the request (too many requests too fast); try again in 60 seconds.", reset: "2026-10-26T14:02:00.000Z" });
  assert.ok(!existsSync(CACHE(first.journal)));

  const [a, b] = DOMAIN_TOPICS.styling.map((t) => path(`${BASE} topic:${t}`));
  const broken = setup({}, { fetch: fakeFetch({ [a]: answer(item("x/one")) }, [], (p) => (p === b ? new Response("{}", { status: 502 }) : undefined)) });
  const failed = await runDiscover({ domain: "styling" }, broken.context, { now });
  assert.equal(failed.outcome, "failed");
  assert.equal(failed.document.problem?.kind, "http");
});

test("the Windows report, on a fake GitHub that allows 10 searches a minute without a token: a domain search never loses the answers it has", async () => {
  // Before: 3 requests a domain search, and a limit on the 3rd dropped all 3 answers. Now: 2 each;
  // a limit on the 2nd that ends within a minute is waited out, and one that doesn't keeps the 1st's
  // results.
  let used = 0;
  const calls: Call[] = [];
  const minute = Date.UTC(2026, 9, 26, 14, 5);
  const searchAt = (start: number) => {
    const time = clock(new Date(start).toISOString());
    const fetch = fakeFetch({}, calls, () => {
      if (time.options.now() >= minute) used = 0; // the next minute
      return ++used > 10 ? searchLimit(false)() : new Response(JSON.stringify(answer(item(`x/r${calls.length}`))));
    });
    return { time, context: setup({}, { fetch }).context };
  };
  // 30 seconds before the minute's end: the 11th request waits 31 seconds, and the next minute answers it.
  const soon = searchAt(minute - 30_000);
  assert.equal((await runDiscover({ text: "browser automation" }, soon.context, soon.time.options)).outcome, "ok"); // 1
  for (const domain of ["styling", "testing", "api", "database"]) assert.equal((await runDiscover({ domain }, soon.context, soon.time.options)).document.searches.length, 2); // 9
  const fifth = await runDiscover({ domain: "auth" }, soon.context, soon.time.options); // the 10th, then the limit
  assert.deepEqual([fifth.outcome, fifth.document.warnings.length, soon.time.waits], ["ok", 1, [31_000]]); // only the topic left out
  assert.deepEqual(fifth.document.results.map((r) => r.name), ["x/r10", "x/r12"]);
  assert.equal(calls.length, 12);
  // 2 minutes before it: no wait, and the 10th's results with a warning.
  used = 0;
  calls.length = 0;
  const later = searchAt(minute - 120_000);
  for (const words of ["a", "b", "c", "d", "e", "f", "g", "h", "i"]) await runDiscover({ text: words }, later.context, later.time.options); // 9
  const tenth = await runDiscover({ domain: "auth" }, later.context, later.time.options);
  assert.deepEqual([tenth.outcome, later.time.waits], ["ok", []]);
  assert.deepEqual(tenth.document.results.map((r) => r.name), ["x/r10"]);
  assert.match(tenth.document.warnings.at(-1) ?? "", /^Only 1 of 2 searches ran/);
  assert.equal(calls.length, 11);
});

test("offline, a timeout and a query GitHub refuses (422) are problems, with GitHub's reason cleaned", async () => {
  const offline = setup({}, { fetch: (async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); }) as Fetch });
  assert.deepEqual((await runDiscover({ text: "x" }, offline.context)).document.problem, { kind: "offline", message: "Can't reach GitHub (ENOTFOUND). Check your connection." });

  const hang = ((_: unknown, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as Fetch;
  const slow = setup({}, { fetch: hang });
  assert.equal((await runDiscover({ text: "x" }, slow.context, { timeoutMs: 20 })).document.problem?.kind, "timeout");

  const refused = setup({}, {
    fetch: fakeFetch({}, [], () => new Response(JSON.stringify({ message: "Validation Failed", errors: [{ message: `The search contains only logical operators${String.fromCharCode(0x1b)}[2J.` }] }), { status: 422 })),
  });
  const run = await runDiscover({ text: "OR" }, refused.context);
  assert.equal(run.outcome, "failed");
  assert.deepEqual(run.document.problem, { kind: "invalid-query", message: "GitHub refused the query (422): The search contains only logical operators<U+001B>[2J." });
});

// --- The cache ---

const CACHE = (journal: string) => join(journal, ".cache", "discover.json");

test("the cache: the same search within 10 minutes isn't sent again; after 10 minutes it is", async () => {
  const { context, calls, journal } = setup({ [path(`x in:name,description,topics ${BASE}`)]: answer(item("a/b")) });
  let now = 1_000_000;
  const first = await runDiscover({ text: "x" }, context, { now: () => now });
  now += 9 * 60 * 1000;
  const second = await runDiscover({ text: " x " }, context, { now: () => now });
  assert.equal(calls.length, 1);
  assert.deepEqual([first.document.cached, second.document.cached], [false, true]);
  assert.deepEqual(second.document.results, first.document.results);
  now += 2 * 60 * 1000;
  assert.equal((await runDiscover({ text: "x" }, context, { now: () => now })).document.cached, false);
  assert.equal(calls.length, 2);
  assert.ok(existsSync(CACHE(journal)));
});

test("the cache holds at most 50 searches, the oldest dropped; the token is neither in it nor in its key", async () => {
  const { context, journal } = setup({}, { env: { GITHUB_TOKEN: "ghp_secret_value" }, fetch: fakeFetch({}, [], () => new Response(JSON.stringify(answer(item("a/b"))))) });
  let now = 1_000_000;
  for (let i = 0; i < 51; i++) await runDiscover({ text: `word${i}` }, context, { now: () => (now += 1000) });
  const text = readFileSync(CACHE(journal), "utf8");
  const entries = (JSON.parse(text) as { data: { entries: { key: string }[] } }).data.entries;
  assert.equal(entries.length, 50);
  assert.doesNotMatch(text, /ghp_secret_value/);
  // The oldest (word0) was dropped: asked again, it goes to GitHub; word50 doesn't, also without the token.
  const counted: Call[] = [];
  const again = { ...context, env: { MAGPIE_HOME: journal }, fetch: fakeFetch({}, counted, () => new Response(JSON.stringify(answer()))) };
  assert.equal((await runDiscover({ text: "word50" }, again, { now: () => now })).document.cached, true);
  assert.equal((await runDiscover({ text: "word0" }, again, { now: () => now })).document.cached, false);
  assert.equal(counted.length, 1);
});

test("a cache that can't be read is ignored and replaced; a search never creates the journal", async () => {
  const { context, journal, calls } = setup({ [path(`x in:name,description,topics ${BASE}`)]: answer(item("a/b")) });
  mkdirSync(join(journal, ".cache"));
  writeFileSync(CACHE(journal), "{not json");
  assert.equal((await runDiscover({ text: "x" }, context)).document.results.length, 1);
  assert.equal(calls.length, 1);
  assert.doesNotThrow(() => JSON.parse(readFileSync(CACHE(journal), "utf8")));

  const none = setup({ [path(`x in:name,description,topics ${BASE}`)]: answer(item("a/b")) }, { journal: false });
  assert.equal((await runDiscover({ text: "x" }, none.context)).outcome, "ok");
  assert.ok(!existsSync(none.journal));
});

// The shape of the maintainer's discover.json from the Windows retest (2026-10-27): version 1, no
// files, two successful entries of 5 results, one incomplete. The values here are made up.
type CacheFile = { version: number; files: Record<string, never>; data: { entries: { key: string; at: number; data: Record<string, unknown> }[] } };
const readCacheFile = (journal: string) => JSON.parse(readFileSync(CACHE(journal), "utf8")) as CacheFile;

test("a cache file from the builds before (version 1, the Windows file's shape) starts empty: GitHub is asked, and the file is rewritten as version 2", async () => {
  const { context, calls, journal } = setup({ [path(`x in:name,description,topics ${BASE}`)]: answer(item("a/b")) });
  let now = Date.UTC(2026, 9, 27, 14, 31, 22);
  await runDiscover({ text: "x" }, context, { now: () => now });
  const file = readCacheFile(journal);
  assert.equal(file.version, 2);
  const [entry] = file.data.entries;
  const old: CacheFile = { version: 1, files: {}, data: { entries: [
    { ...entry, data: { ...entry.data, items: Array(5).fill((entry.data.items as unknown[])[0]), total: 257, nextPage: 2, incomplete: true } },
    { key: "f".repeat(64), at: now + 45_000, data: { items: Array(5).fill((entry.data.items as unknown[])[0]), total: 2288, nextPage: 2, incomplete: false } },
  ] } };
  writeFileSync(CACHE(journal), JSON.stringify(old));
  now += 60_000; // fresh by age, and its key matches: only the version keeps it out
  const run = await runDiscover({ text: "x" }, context, { now: () => now });
  assert.deepEqual([run.outcome, run.document.cached, run.document.problem, calls.length], ["ok", false, null, 2]);
  assert.equal(readCacheFile(journal).version, 2);
});

test("an entry not of the current shape is dropped, never used and never a failure: GitHub is asked instead, and the file keeps only good entries", async () => {
  const { context, calls, journal } = setup({ [path(`x in:name,description,topics ${BASE}`)]: answer(item("a/b")) });
  const now = Date.UTC(2026, 9, 27, 15, 0);
  await runDiscover({ text: "x" }, context, { now: () => now });
  const good = readCacheFile(journal).data.entries[0];
  const [first] = good.data.items as Record<string, unknown>[];
  const bad = [
    { ...good, data: { ...good.data, problem: { kind: "search-rate-limit", message: "GitHub's search limit is used up until 14:54 UTC.", reset: "2026-10-27T14:54:00Z" } } },
    { ...good, limited_until: "2026-10-27T15:30:00Z" },
    { ...good, at: String(good.at) },
    { ...good, data: { ...good.data, items: [{ ...first, name: 5 }] } },
    { ...good, data: { ...good.data, items: [{ ...first, topics: undefined }] } },
    { ...good, data: { ...good.data, items: [{ ...first, url: "javascript:alert(1)" }] } },
    { ...good, data: { ...good.data, nextPage: 1 } },
    { ...good, key: "not a hash" },
    null,
  ];
  writeFileSync(CACHE(journal), JSON.stringify({ version: 2, files: {}, data: { entries: bad } }));
  const run = await runDiscover({ text: "x" }, context, { now: () => now + 1000 });
  assert.deepEqual([run.outcome, run.document.cached, run.document.problem, run.document.results.map((r) => r.name), calls.length], ["ok", false, null, ["a/b"], 2]);
  const after = readFileSync(CACHE(journal), "utf8");
  assert.doesNotMatch(after, /search-rate-limit|limited_until|javascript:/);
  assert.equal(readCacheFile(journal).data.entries.length, 1);
  // A good entry, then, answers from the cache.
  assert.equal((await runDiscover({ text: "x" }, context, { now: () => now + 2000 })).document.cached, true);
  assert.equal(calls.length, 2);
});

test("the cache keeps successful answers only: a rate-limited search writes nothing, and the next search asks GitHub", async () => {
  const limited = fakeFetch({}, [], searchLimit(false));
  const { context, journal } = setup({}, { fetch: limited });
  const now = () => Date.UTC(2026, 9, 26, 14, 1);
  assert.equal((await runDiscover({ text: "x" }, context, { now })).outcome, "failed");
  assert.ok(!existsSync(CACHE(journal)));
  const calls: Call[] = [];
  const ok = { ...context, fetch: fakeFetch({ [path(`x in:name,description,topics ${BASE}`)]: answer(item("a/b")) }, calls) };
  const run = await runDiscover({ text: "x" }, ok, { now });
  assert.deepEqual([run.outcome, run.document.cached, calls.length], ["ok", false, 1]);
});

test("recorded answers from GitHub's search (src/core/fixtures/github/search.json) read as results", async () => {
  const responses = recorded("search");
  const { context } = setup(responses);
  const { outcome, document } = await runDiscover({ text: "design system" }, context);
  assert.equal(outcome, "ok");
  assert.ok(document.results.length >= 5);
  for (const r of document.results) {
    assert.match(r.name, /^[^/]+\/[^/]+$/);
    assert.equal(r.url, `https://github.com/${r.name}`);
    assert.ok(r.stars >= 10 && r.updated !== null);
  }
  assert.ok(document.total > document.results.length && document.next_page === 2);
});
