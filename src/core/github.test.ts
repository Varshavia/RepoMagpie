import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { countSkillFolders, draftKind, fetchRepository, kindFromTopics, manifestKeywords, packageFromManifest, readmeOpening, readmeStart, rootFolders, SKILL_CAP, type Fetch, type FetchProblem } from "./github.ts";

// Recorded GET responses (src/core/fixtures/github/); no test touches the network.
function recorded(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`fixtures/github/${name}.json`, import.meta.url), "utf8")).responses;
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

// A fetch that answers from a map of "path?query" → body; anything else is a 404.
// `override` may answer a path differently (an error, a header, a hang).
function fakeFetch(responses: Record<string, unknown>, calls: Call[] = [], override?: (path: string, init: RequestInit) => Promise<Response> | undefined): Fetch {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    calls.push({ url: String(input), method: init.method ?? "GET", headers: { ...(init.headers as Record<string, string>) } });
    const answer = override?.(path, init);
    if (answer) return answer;
    if (!(path in responses)) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    const body = responses[path];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  }) as Fetch;
}

const PLAYWRIGHT = "pkg:github/microsoft/playwright-cli";
const KARPATHY = "pkg:github/multica-ai/andrej-karpathy-skills";
const AWESOME = "pkg:github/voltagent/awesome-design-md";

// --- GitHub fields are cleaned before they reach a note (decision 0032, rule 8) ---

test("a hostile repository's control, bidi and zero-width characters reach a note as markers; a URL that isn't https is replaced", async () => {
  const c = (...codes: number[]) => String.fromCodePoint(...codes);
  const ESC = c(0x1b);
  const responses = {
    "/repos/acme/widget": {
      full_name: `acme/wid${c(0x200b)}get`,
      html_url: "javascript:void(0)",
      description: `Charts ${ESC}]52;c;ZWNobyBwd25lZA==${c(0x07)}for ${c(0x202e)}apps${ESC}[31m`,
      language: `Type${c(0x7f)}Script`,
      license: { spdx_id: `MIT${c(0x9b)}` },
      topics: ["charts", `cl${c(0x200d)}i`],
      default_branch: "main",
    },
    "/repos/acme/widget/git/trees/main?recursive=1": { tree: [{ path: `skills/ev${ESC}[2Jil/SKILL.md`, type: "blob" }] },
  };
  const r = await fetchRepository("pkg:github/acme/widget", { fetch: fakeFetch(responses) });
  assert.ok(r.ok);
  const { name, url, description, language, license, topics, skills } = r.metadata;
  assert.deepEqual({ name, url, description, language, license, topics, skills }, {
    name: "acme/wid<U+200B>get", url: "https://github.com/acme/widget", description: "Charts <U+001B>]52;c;ZWNobyBwd25lZA==<U+0007>for <U+202E>apps<U+001B>[31m",
    language: "Type<U+007F>Script", license: "MIT<U+009B>", topics: ["charts", "cl<U+200D>i"], skills: ["ev<U+001B>[2Jil"],
  });
});

// --- metadata from recorded responses ---

// A repository's file list is the owner's: a note keeps at most SKILL_CAP skill names, so
// a note made or refreshed from GitHub stays far under the 256 KB the readers allow.
test("a file list with thousands of SKILL.md folders gives at most SKILL_CAP skill names, and a warning", async () => {
  const tree = Array.from({ length: 1100 }, (_, i) => ({ path: `skills/${String(i).padStart(5, "0")}-${"s".repeat(234)}/SKILL.md`, type: "blob" }));
  const responses = {
    "/repos/evil/thing": { full_name: "evil/thing", html_url: "https://github.com/evil/thing", description: "Agent skills", default_branch: "main", topics: [] },
    "/repos/evil/thing/git/trees/main?recursive=1": { truncated: false, tree },
  };
  const r = await fetchRepository("pkg:github/evil/thing", { fetch: fakeFetch(responses) });
  assert.ok(r.ok);
  assert.equal(r.metadata.skills?.length, SKILL_CAP);
  assert.equal(r.metadata.skillFolders, 1100); // the kind still sees them all
  assert.ok(r.warnings.includes(`evil/thing has 1,100 skills; the note lists the first ${SKILL_CAP}.`), r.warnings.join("\n"));
});

test("playwright-cli: metadata, skills by folder name, package and bin from the root package.json", async () => {
  const r = await fetchRepository(PLAYWRIGHT, { fetch: fakeFetch(recorded("microsoft--playwright-cli")) });
  assert.deepEqual(r, {
    ok: true,
    metadata: {
      name: "microsoft/playwright-cli",
      url: "https://github.com/microsoft/playwright-cli",
      description: "CLI for common Playwright actions. Record and generate Playwright code, inspect selectors and take screenshots.",
      language: "JavaScript",
      license: "Apache-2.0",
      topics: ["playwright"],
      skills: ["dev", "playwright-cli"],
      skillFolders: 1, // dev is in .claude/skills/
      template: false,
      packages: ["pkg:npm/%40playwright/cli"],
      plugin: false,
      bin: true,
      keywords: [],
      readme: "# playwright-cli\n\nPlaywright CLI with SKILLS\n\n### Playwright CLI vs Playwright MCP\n\nThis package provides CLI interface into Playwright. If you are using coding agents, that is the best fit.\n\n### Key Features\n\n- Token-efficient. Does not force page data into LLM.\n\n## Installation",
      action: false,
      rootFolders: ["scripts", "skills", "tests"], // .claude/ is hidden
    },
    warnings: [],
  });
});

test("andrej-karpathy-skills: no licence on GitHub is unknown; a root .claude-plugin makes it a plugin", async () => {
  const r = await fetchRepository(KARPATHY, { fetch: fakeFetch(recorded("multica-ai--andrej-karpathy-skills")) });
  assert.ok(r.ok);
  assert.equal(r.metadata.license, "unknown");
  assert.equal(r.metadata.language, null);
  assert.deepEqual(r.metadata.skills, ["karpathy-guidelines"]);
  assert.deepEqual(r.metadata.packages, []);
  assert.equal(r.metadata.plugin, true);
  assert.equal(r.metadata.bin, false);
});

test("awesome-design-md: GitHub's name keeps its case; no skills and no manifests", async () => {
  const r = await fetchRepository(AWESOME, { fetch: fakeFetch(recorded("voltagent--awesome-design-md")) });
  assert.ok(r.ok);
  assert.equal(r.metadata.name, "VoltAgent/awesome-design-md");
  assert.deepEqual(r.metadata.skills, []);
  assert.deepEqual(r.metadata.packages, []);
  assert.deepEqual(r.warnings, []);
});

test("a NOASSERTION licence is unknown", async () => {
  const responses = recorded("microsoft--playwright-cli");
  const repo = responses["/repos/microsoft/playwright-cli"] as Record<string, unknown>;
  responses["/repos/microsoft/playwright-cli"] = { ...repo, license: { key: "other", spdx_id: "NOASSERTION" } };
  const r = await fetchRepository(PLAYWRIGHT, { fetch: fakeFetch(responses) });
  assert.ok(r.ok);
  assert.equal(r.metadata.license, "unknown");
});

test("SKILL.md detection: exact file name, deduplicated and sorted; a root SKILL.md is named after the repository", async () => {
  const responses = recorded("multica-ai--andrej-karpathy-skills");
  responses["/repos/multica-ai/andrej-karpathy-skills/git/trees/main?recursive=1"] = {
    truncated: false,
    tree: [
      { path: "SKILL.md", type: "blob" },
      { path: "skills/zeta/SKILL.md", type: "blob" },
      { path: ".claude/skills/zeta/SKILL.md", type: "blob" },
      { path: "skills/alpha/SKILL.md", type: "blob" },
      { path: "skills/notes/MYSKILL.md", type: "blob" },
      { path: "skills/lower/skill.md", type: "blob" },
      { path: "SKILL.md.bak", type: "blob" },
    ],
  };
  const r = await fetchRepository(KARPATHY, { fetch: fakeFetch(responses) });
  assert.ok(r.ok);
  assert.deepEqual(r.metadata.skills, ["alpha", "andrej-karpathy-skills", "zeta"]);
  assert.equal(r.metadata.plugin, false);
});

test("a .claude-plugin folder below the root does not make it a plugin", async () => {
  const responses = recorded("multica-ai--andrej-karpathy-skills");
  responses["/repos/multica-ai/andrej-karpathy-skills/git/trees/main?recursive=1"] = {
    truncated: false,
    tree: [{ path: "sub/.claude-plugin/plugin.json", type: "blob" }],
  };
  const r = await fetchRepository(KARPATHY, { fetch: fakeFetch(responses) });
  assert.ok(r.ok);
  assert.equal(r.metadata.plugin, false);
});

// --- requests ---

test("only GET requests to api.github.com, with GitHub's headers and no token when none is set", async () => {
  const calls: Call[] = [];
  await fetchRepository(PLAYWRIGHT, { fetch: fakeFetch(recorded("microsoft--playwright-cli"), calls) });
  assert.deepEqual(calls.map((c) => c.url), [
    "https://api.github.com/repos/microsoft/playwright-cli",
    "https://api.github.com/repos/microsoft/playwright-cli/git/trees/main?recursive=1",
    "https://api.github.com/repos/microsoft/playwright-cli/contents/package.json?ref=main",
    "https://api.github.com/repos/microsoft/playwright-cli/readme",
  ]);
  for (const call of calls) {
    assert.equal(call.method, "GET");
    assert.equal(call.headers["X-GitHub-Api-Version"], "2022-11-28");
    assert.match(call.headers["User-Agent"], /^repomagpie/);
    assert.equal(call.headers.Authorization, undefined);
  }
  assert.equal(calls[0].headers.Accept, "application/vnd.github+json");
  assert.equal(calls[2].headers.Accept, "application/vnd.github.raw+json");
  assert.equal(calls[3].headers.Accept, "application/vnd.github.raw+json");
});

test("GITHUB_TOKEN is sent as a bearer token on every request", async () => {
  const calls: Call[] = [];
  await fetchRepository(PLAYWRIGHT, { fetch: fakeFetch(recorded("microsoft--playwright-cli"), calls), token: "t0k3n-secret" });
  assert.ok(calls.length > 0);
  for (const call of calls) assert.equal(call.headers.Authorization, "Bearer t0k3n-secret");
});

// --- failures: a typed problem with a clear message, never the token ---

const TOKEN = "t0k3n-secret";
const failWith = (response: () => Response | Promise<Response>) => fakeFetch({}, [], () => Promise.resolve(response()));

test("a missing repository is not-found and names it", async () => {
  const r = await fetchRepository(PLAYWRIGHT, { fetch: fakeFetch({}) });
  assert.equal(r.ok, false);
  assert.ok(!r.ok);
  assert.equal(r.problem.kind, "not-found");
  assert.match(r.problem.message, /microsoft\/playwright-cli/);
});

test("a used-up rate limit says until when, and suggests GITHUB_TOKEN only when none is set", async () => {
  const reset = String(Date.UTC(2026, 9, 4, 14, 5) / 1000);
  const limited = () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset } });
  const now = () => Date.UTC(2026, 9, 4, 14, 1);
  const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(limited), now });
  assert.ok(!r.ok);
  assert.equal(r.problem.kind, "rate-limit");
  assert.match(r.problem.message, /until 14:05 UTC/);
  assert.match(r.problem.message, /GITHUB_TOKEN/);
  assert.equal(r.problem.reset, "2026-10-04T14:05:00.000Z");

  const withToken = await fetchRepository(PLAYWRIGHT, { fetch: failWith(limited), token: TOKEN, now });
  assert.ok(!withToken.ok);
  assert.doesNotMatch(withToken.problem.message, /GITHUB_TOKEN/);
});

test("a reset time already past is never shown: in a minute instead, and no reset", async () => {
  const reset = String(Date.UTC(2026, 9, 4, 14, 28) / 1000);
  const limited = () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset, "x-ratelimit-resource": "search" } });
  const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(limited), token: TOKEN, now: () => Date.UTC(2026, 9, 4, 14, 31) });
  assert.ok(!r.ok);
  assert.deepEqual(r.problem, { kind: "search-rate-limit", message: "GitHub's search limit is used up; try again in a minute." });
});

test("a primary limit with retry-after waits retry-after's seconds, not until x-ratelimit-reset", async () => {
  const limited = () => new Response("{}", { status: 429, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Date.UTC(2026, 9, 4, 15, 0) / 1000), "retry-after": "30" } });
  const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(limited), token: TOKEN, now: () => Date.UTC(2026, 9, 4, 14, 31) });
  assert.ok(!r.ok);
  assert.deepEqual(r.problem, { kind: "rate-limit", message: "GitHub's rate limit is used up; try again in 30 seconds.", reset: "2026-10-04T14:31:30.000Z" });
});

test("a secondary rate limit (403 or 429 without remaining 0) is its own problem, timed by retry-after, never by a stale x-ratelimit-reset", async () => {
  const now = () => Date.UTC(2026, 9, 4, 14, 31);
  // The Windows report: a reset 3 minutes past beside retry-after, with requests still remaining.
  const stale = String(Date.UTC(2026, 9, 4, 14, 28) / 1000);
  const cases: [() => Response, FetchProblem][] = [
    [() => new Response("{}", { status: 403, headers: { "retry-after": "60", "x-ratelimit-remaining": "7", "x-ratelimit-reset": stale, "x-ratelimit-resource": "search" } }),
      { kind: "secondary-rate-limit", message: "GitHub's secondary rate limit stopped the request (too many requests too fast); try again in 60 seconds.", reset: "2026-10-04T14:32:00.000Z" }],
    [() => new Response(JSON.stringify({ message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again." }), { status: 403 }),
      { kind: "secondary-rate-limit", message: "GitHub's secondary rate limit stopped the request (too many requests too fast); try again in a minute." }],
    [() => new Response("{}", { status: 429 }),
      { kind: "secondary-rate-limit", message: "GitHub's secondary rate limit stopped the request (too many requests too fast); try again in a minute." }],
    [() => new Response("{}", { status: 429, headers: { "retry-after": "600" } }),
      { kind: "secondary-rate-limit", message: "GitHub's secondary rate limit stopped the request (too many requests too fast); wait until 14:41 UTC.", reset: "2026-10-04T14:41:00.000Z" }],
  ];
  for (const [response, problem] of cases) {
    const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(response), now });
    assert.ok(!r.ok);
    assert.deepEqual(r.problem, problem);
  }
  // A 403 that isn't a rate limit stays an HTTP error.
  const forbidden = await fetchRepository(PLAYWRIGHT, { fetch: failWith(() => new Response(JSON.stringify({ message: "Resource not accessible" }), { status: 403 })), now });
  assert.ok(!forbidden.ok);
  assert.equal(forbidden.problem.kind, "http");
});

test("a rejected token is auth", async () => {
  const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(() => new Response("{}", { status: 401 })), token: TOKEN });
  assert.ok(!r.ok);
  assert.equal(r.problem.kind, "auth");
  assert.match(r.problem.message, /GitHub token may be invalid or expired\. Run gh auth login again, or check GITHUB_TOKEN and GH_TOKEN\.$/);
});

test("no answer within the timeout is timeout", async () => {
  const hang: Fetch = ((_input: unknown, init: RequestInit = {}) =>
    new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as Fetch;
  const r = await fetchRepository(PLAYWRIGHT, { fetch: hang, timeoutMs: 20 });
  assert.ok(!r.ok);
  assert.equal(r.problem.kind, "timeout");
  assert.match(r.problem.message, /didn't answer/);
});

// The timeout must keep the process alive on its own: a fetch that never answers holds no
// handle, so an unref'd timer would let the event loop empty and the promise never settle.
// Run in a separate process, where nothing else keeps the loop alive.
test("the timeout fires even when nothing else keeps the process alive", () => {
  const script = `
    import { fetchRepository } from ${JSON.stringify(new URL("./github.ts", import.meta.url).href)};
    const hang = (_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    const r = await fetchRepository("pkg:github/a/b", { fetch: hang, timeoutMs: 50 });
    console.log(r.ok ? "ok" : r.problem.kind);`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "timeout");
});

test("a request that answers in time leaves no timer behind", () => {
  const script = `
    import { fetchRepository } from ${JSON.stringify(new URL("./github.ts", import.meta.url).href)};
    const started = Date.now();
    await fetchRepository("pkg:github/a/b", { fetch: () => Promise.resolve(new Response("{}", { status: 404 })), timeoutMs: 5_000 });
    process.on("exit", () => console.log(Date.now() - started < 2_000 ? "quick" : "waited for the timer"));`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "quick");
});

test("no connection is offline, with the system's error code", async () => {
  const offline: Fetch = (() => Promise.reject(new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.github.com"), { code: "ENOTFOUND" }) }))) as Fetch;
  const r = await fetchRepository(PLAYWRIGHT, { fetch: offline });
  assert.ok(!r.ok);
  assert.equal(r.problem.kind, "offline");
  assert.match(r.problem.message, /ENOTFOUND/);
});

test("any other status is http", async () => {
  const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(() => new Response("{}", { status: 502 })) });
  assert.ok(!r.ok);
  assert.equal(r.problem.kind, "http");
  assert.match(r.problem.message, /502/);
});

test("no problem message or warning ever contains the token", async () => {
  const responses = [401, 403, 404, 429, 500].map((status) => () => new Response("{}", { status }));
  for (const response of responses) {
    const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(response), token: TOKEN });
    assert.ok(!r.ok);
    assert.ok(!JSON.stringify(r).includes(TOKEN));
  }
  const partial = await fetchRepository(PLAYWRIGHT, {
    fetch: fakeFetch(recorded("microsoft--playwright-cli"), [], (path) => (path.includes("/git/trees/") ? Promise.resolve(new Response("{}", { status: 401 })) : undefined)),
    token: TOKEN,
  });
  assert.ok(!JSON.stringify(partial).includes(TOKEN));
});

// --- partial results: what couldn't be read is null, never an empty guess ---

test("a failed file list leaves skills and packages unknown (null) with a warning", async () => {
  const fetch = fakeFetch(recorded("microsoft--playwright-cli"), [], (path) => (path.includes("/git/trees/") ? Promise.resolve(new Response("{}", { status: 500 })) : undefined));
  const r = await fetchRepository(PLAYWRIGHT, { fetch });
  assert.ok(r.ok);
  assert.equal(r.metadata.skills, null);
  assert.equal(r.metadata.packages, null);
  assert.equal(r.metadata.license, "Apache-2.0");
  assert.equal(r.warnings.length, 1);
});

test("a truncated file list still gives the skills found, with a warning", async () => {
  const responses = recorded("microsoft--playwright-cli");
  const key = "/repos/microsoft/playwright-cli/git/trees/main?recursive=1";
  responses[key] = { ...(responses[key] as object), truncated: true };
  const r = await fetchRepository(PLAYWRIGHT, { fetch: fakeFetch(responses) });
  assert.ok(r.ok);
  assert.deepEqual(r.metadata.skills, ["dev", "playwright-cli"]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /cut short/);
});

test("a manifest that can't be fetched leaves packages unknown (null) with a warning", async () => {
  const fetch = fakeFetch(recorded("microsoft--playwright-cli"), [], (path) => (path.includes("/contents/") ? Promise.resolve(new Response("{}", { status: 500 })) : undefined));
  const r = await fetchRepository(PLAYWRIGHT, { fetch });
  assert.ok(r.ok);
  assert.equal(r.metadata.packages, null);
  assert.deepEqual(r.metadata.skills, ["dev", "playwright-cli"]);
  assert.equal(r.warnings.length, 1);
});

// --- manifests: the name line only, repository root only ---

const MANIFESTS: [string, "package.json" | "pyproject.toml" | "Cargo.toml", string, string | null][] = [
  ["package.json name", "package.json", `{"name": "pdfkit", "version": "1.0.0"}`, "pkg:npm/pdfkit"],
  ["package.json scoped name", "package.json", `{"name": "@playwright/cli"}`, "pkg:npm/%40playwright/cli"],
  ["package.json private", "package.json", `{"name": "my-app", "private": true}`, null],
  ["package.json without name", "package.json", `{"version": "1.0.0"}`, null],
  ["package.json that isn't JSON", "package.json", `{"name": `, null],
  ["pyproject [project] name", "pyproject.toml", `[build-system]\nrequires = ["poetry"]\n\n[project]\nname = "open-lakehouse"\nversion = "0.1.0"\n`, "pkg:pypi/open-lakehouse"],
  ["pyproject name normalised", "pyproject.toml", `[project]\nname = 'Open_Lakehouse'  # comment\n`, "pkg:pypi/open-lakehouse"],
  ["pyproject name only under [tool.poetry]", "pyproject.toml", `[tool.poetry]\nname = "legacy"\n`, null],
  ["pyproject name in a later section is not [project]'s", "pyproject.toml", `[project]\nversion = "1"\n\n[tool.x]\nname = "other"\n`, null],
  ["Cargo [package] name", "Cargo.toml", `[package]\nname = "ripgrep"\nversion = "14.1.0"\n`, "pkg:cargo/ripgrep"],
  ["Cargo workspace only", "Cargo.toml", `[workspace]\nmembers = ["crates/*"]\n`, null],
  ["Cargo name inherited from the workspace", "Cargo.toml", `[package]\nname.workspace = true\n`, null],
  ["CRLF line endings", "Cargo.toml", `[package]\r\nname = "ripgrep"\r\n`, "pkg:cargo/ripgrep"],
];

for (const [title, file, text, purl] of MANIFESTS) {
  test(`manifest: ${title}`, () => {
    assert.equal(packageFromManifest(file, text), purl);
  });
}

// --- drafts: kind (decision 0030: the first rule that matches) ---

type KindInput = Parameters<typeof draftKind>[0];
const BASE: KindInput = { name: "acme/widget", topics: [], template: false, skillFolders: 0, packages: [], plugin: false, bin: false };
const KIND_CASES: [string, Partial<KindInput>, string][] = [
  ["1 awesome-list beats template and app", { topics: ["awesome-list", "template", "self-hosted"], template: true }, "awesome-list"],
  ["2 GitHub's template flag beats app", { template: true, topics: ["docker"] }, "template"],
  ["2 template from the topic starter", { topics: ["starter"] }, "template"],
  ["2 template from the topic boilerplate", { topics: ["boilerplate"], bin: true }, "template"],
  ["3 a name with skill beats platform, ignoring case", { name: "Leonxlnx/Taste-Skill", topics: ["no-code"] }, "skill-pack"],
  ["3 the owner's name doesn't count", { name: "skillful/widget" }, "other"],
  ["4 platform beats app", { topics: ["self-hosted", "paas"] }, "platform"],
  ["4 platform from nocode", { topics: ["nocode"] }, "platform"],
  ["5 app beats the topic skills", { topics: ["skills", "docker"], skillFolders: 7 }, "app"],
  ["5 app beats a command and a package", { topics: ["self-hosted"], bin: true, packages: ["pkg:pypi/widget"] }, "app"],
  ["6 the topic skills beats framework and a command", { topics: ["framework", "agent-skills"], bin: true }, "skill-pack"],
  ["7 framework beats a command and a package", { topics: ["framework"], bin: true, packages: ["pkg:npm/widget"] }, "framework"],
  ["8 a command beats a package", { bin: true, packages: ["pkg:npm/widget"] }, "cli"],
  ["9 a package beats skill folders and a plugin", { packages: ["pkg:pypi/widget"], skillFolders: 6, plugin: true }, "library"],
  ["10 3 skill folders in a root skills/ beat a plugin", { skillFolders: 3, plugin: true, rootFolders: ["docs", "skills"] }, "skill-pack"],
  ["10 skill folders next to code don't make a skill pack", { skillFolders: 21, rootFolders: ["packages", "skills"] }, "other"],
  ["10 apps/ counts as code", { skillFolders: 5, rootFolders: ["apps", "skills"] }, "other"],
  ["10 skill folders outside a root skills/ don't", { skillFolders: 3, rootFolders: ["docs", "packages"] }, "other"],
  ["10 an unknown layout doesn't", { skillFolders: 3, rootFolders: null }, "other"],
  ["11 2 skill folders with a plugin manifest: plugin", { skillFolders: 2, plugin: true }, "plugin"],
  ["12 2 skill folders alone: other", { skillFolders: 2 }, "other"],
  ["12 unknown skill folders and packages count as none", { skillFolders: null, packages: null }, "other"],
];

for (const [title, over, kind] of KIND_CASES) {
  test(`draftKind: ${title}`, () => {
    assert.equal(draftKind({ ...BASE, ...over }), kind);
  });
}

// --- decision 0046: keywords, the README, a GitHub Action ---

test("draftKind: a manifest keyword counts where a topic does; the README decides only what would be other", () => {
  assert.equal(draftKind({ ...BASE, keywords: ["framework"], packages: ["pkg:npm/widget"] }), "framework");
  assert.equal(draftKind({ ...BASE, readme: "# Widget\n\nA curated awesome list of charts." }), "awesome-list");
  assert.equal(draftKind({ ...BASE, readme: "# Widget\n\nA starter template for Vite apps." }), "template");
  assert.equal(draftKind({ ...BASE, readme: "# Widget CLI\n\nCharts in your terminal." }), "cli");
  assert.equal(draftKind({ ...BASE, readme: "# Widget\n\nA command-line tool for charts." }), "cli");
  assert.equal(draftKind({ ...BASE, packages: ["pkg:npm/widget"], readme: "# Widget CLI" }), "library"); // a package beats the README
  assert.equal(draftKind({ ...BASE, readme: "# Widget\n\nCharts for apps.\n\n## Use the CLI" }), "other"); // only the first heading and sentence
  assert.equal(draftKind({ ...BASE, readme: "# Widget\n\nPublic client library." }), "other"); // a whole word: not "public"
});

// --- decision 0047: kind rules, measured ---

test("draftKind: a GitHub Action is other, before platform and app topics, after a template", () => {
  assert.equal(draftKind({ ...BASE, action: true, topics: ["docker"], packages: ["pkg:npm/widget"] }), "other"); // docker/build-push-action
  assert.equal(draftKind({ ...BASE, action: true, topics: ["self-hosted", "framework"] }), "other");
  assert.equal(draftKind({ ...BASE, action: true, template: true }), "template");
  assert.equal(draftKind({ ...BASE, action: true, name: "acme/skills-action" }), "skill-pack");
});

test("draftKind: the README's phrases decide before a package, after a command", () => {
  const cases: [string, string][] = [
    ["# Langflow\n\nLangflow is a powerful platform for building and deploying AI agents.", "platform"],
    ["# Supabase\n\nSupabase is the Postgres development platform.", "platform"],
    ["# Playwright\n\nPlaywright is a framework for Web Testing and Automation.", "framework"],
    ["# Vitest\n\nNext generation testing framework powered by Vite.", "framework"],
    ["# Tailwind CSS\n\nA utility-first CSS framework for rapidly building custom user interfaces.", "framework"],
    ["# Puppeteer\n\nPuppeteer is a JavaScript library which provides a high-level API.", "library"],
    ["# Radix Primitives\n\nAn open-source UI component library for building design systems.", "library"],
  ];
  for (const [readme, kind] of cases) assert.equal(draftKind({ ...BASE, packages: ["pkg:npm/widget"], readme }), kind, readme);
  assert.equal(draftKind({ ...BASE, bin: true, readme: cases[0][0] }), "cli"); // a command still comes first
  assert.equal(draftKind({ ...BASE, packages: ["pkg:npm/widget"], readme: "# Widget\n\nWidget draws charts for apps.\n\nA framework for charts." }), "library"); // only the opening
  assert.equal(draftKind({ ...BASE, packages: ["pkg:npm/widget"], readme: "# Grafana\n\nThe open-source platform for monitoring." }), "library"); // dropped: open-source platform
});

test("draftKind: the topics testing-framework, ui-library and orm, after the framework topic", () => {
  assert.equal(draftKind({ ...BASE, topics: ["testing-framework"], bin: true }), "framework"); // cypress
  assert.equal(draftKind({ ...BASE, topics: ["ui-library"] }), "library"); // chakra
  assert.equal(draftKind({ ...BASE, topics: ["orm"], bin: true }), "library"); // prisma, drizzle
  assert.equal(draftKind({ ...BASE, topics: ["orm", "self-hosted"] }), "app");
  assert.equal(draftKind({ ...BASE, keywords: ["testing-framework"] }), "framework"); // a keyword counts as a topic
});

test("draftKind: the skill packs stay; a library or a platform that ships skills doesn't become one", () => {
  const packs: [string, string[], number][] = [
    ["mattpocock/skills", ["docs", "scripts", "skills"], 14],
    ["vercel-labs/agent-skills", ["packages", "scripts", "skills"], 7], // packages/ holds its build tool, but the name says skill
    ["anthropics/skills", ["skills", "spec", "template"], 20], // also a plugin: .claude-plugin/
    ["acme/agent-pack", ["skills", "spec", "template"], 20], // the same layout without skill in the name
    ["Leonxlnx/taste-skill", ["assets", "examples", "skills", "tests"], 9],
  ];
  for (const [name, rootFolders, skillFolders] of packs) assert.equal(draftKind({ ...BASE, name, rootFolders, skillFolders }), "skill-pack", name);
  assert.equal(draftKind({ ...BASE, name: "trpc/trpc", rootFolders: ["examples", "packages", "www"], skillFolders: 21 }), "other");
  assert.equal(draftKind({ ...BASE, name: "acme/charts", rootFolders: ["skills", "src"], skillFolders: 4, packages: ["pkg:npm/charts"] }), "library");
  assert.equal(draftKind({ ...BASE, name: "acme/cloud", topics: ["paas"], rootFolders: ["apps", "skills"], skillFolders: 5, packages: ["pkg:npm/cloud"] }), "platform");
});

test("kindFromTopics: an Action is other; the new topics count; Discover, which knows no Action, gets null", () => {
  assert.equal(kindFromTopics({ name: "a/b", topics: [], template: false, action: true }), "other");
  assert.equal(kindFromTopics({ name: "a/b", topics: ["orm"], template: false }), "library");
  assert.equal(kindFromTopics({ name: "a/b", topics: ["orm"], template: false, action: true }), "other");
  assert.equal(kindFromTopics({ name: "a/b", topics: ["docker"], template: false }), "app");
  assert.equal(kindFromTopics({ name: "a/b", topics: ["pdf"], template: false }), null);
});

test("rootFolders: the first segment of each path in a folder, once, sorted, not hidden", () => {
  assert.deepEqual(rootFolders(["README.md", "skills/a/SKILL.md", "skills/b/SKILL.md", ".claude/x", "docs/a.md", "src/index.ts"]), ["docs", "skills", "src"]);
  assert.deepEqual(rootFolders(["README.md"]), []);
});

test("fetchRepository reads the root folders from the file list; none when the list fails", async () => {
  const noTree = fakeFetch(recorded("microsoft--playwright-cli"), [], (path) => (path.includes("/git/trees/") ? Promise.resolve(new Response("{}", { status: 500 })) : undefined));
  const r = await fetchRepository(PLAYWRIGHT, { fetch: noTree });
  assert.ok(r.ok);
  assert.equal(r.metadata.rootFolders, null);
});

test("manifestKeywords: package.json keywords, pyproject [project] keywords, Cargo keywords and categories, spelled as topics", () => {
  assert.deepEqual(manifestKeywords("package.json", JSON.stringify({ keywords: ["Testing", "web scraping", "e2e_tests", 3, "x".repeat(51), "testing"] })), ["testing", "web-scraping", "e2e-tests"]);
  assert.deepEqual(manifestKeywords("package.json", "not json"), []);
  assert.deepEqual(manifestKeywords("pyproject.toml", `[tool.x]\nkeywords = ["no"]\n[project]\nname = "w"\nkeywords = [\n  "LLM",\n  'agents', # a comment\n]\n`), ["llm", "agents"]);
  assert.deepEqual(manifestKeywords("Cargo.toml", `[package]\nname = "w"\nkeywords = ["cli", "search"]\ncategories = ["command-line-utilities", "development-tools::testing"]\n`), ["cli", "search", "command-line-utilities", "development-tools", "testing"]);
  assert.deepEqual(manifestKeywords("Cargo.toml", `[package]\nname = "w"\n`), []);
});

test("readmeStart: badges, images, HTML, comments, code blocks and link targets go; text, headings and markers stay; 3,000 characters", () => {
  const md = [
    "<p align=\"center\"><img src=\"logo.png\"></p>",
    "[![CI](https://x/badge.svg)](https://x) ![npm](https://y.svg)",
    "<!-- a hidden comment -->",
    "# Widget",
    "",
    "Widget draws **charts** with [D3](https://d3js.org) and `canvas`. See [docs][1].",
    "",
    "```bash",
    "npm install widget",
    "```",
    "",
    "| a | b |",
    "|---|---|",
    "[1]: https://docs",
    `Hidden ${String.fromCharCode(0x202e)}text.`,
  ].join("\r\n");
  assert.equal(readmeStart(md), `# Widget\n\nWidget draws charts with D3 and canvas. See docs.\n\n| a | b |\n\nHidden <U+202E>text.`);
  assert.equal(readmeStart(`# A\n\n${"word ".repeat(1000)}`).length, 3000);
  assert.equal(readmeStart("```\nnever closed\ncode"), "");
});

test("readmeStart: entities are decoded once, in one pass: an escaped entity stays an entity", () => {
  assert.equal(readmeStart("Tom &amp; Jerry &lt;3 &quot;cats&quot; &#39;n&#39;&nbsp;mice &gt; dogs"), `Tom & Jerry <3 "cats" 'n' mice > dogs`);
  assert.equal(readmeStart("Write &amp;lt;b&amp;gt; for bold."), "Write &lt;b&gt; for bold.");
  assert.equal(readmeStart("&amp;amp; and &copy; stay"), "&amp; and &copy; stay");
});

test("readmeOpening: the first heading, and the first sentence of the first line of prose", () => {
  assert.deepEqual(readmeOpening("# Widget #\n\nDiscord\nDocs | Discord | Blog post here\n[!IMPORTANT] Moved to a new home now\n- Draws charts for apps. Fast too.\n"), { heading: "Widget", sentence: "Draws charts for apps." });
  assert.deepEqual(readmeOpening("Widget, version 2 of it\n"), { heading: null, sentence: "Widget, version 2 of it" });
  assert.deepEqual(readmeOpening(""), { heading: null, sentence: null });
});

test("readmeKind: an awesome list's title starts with Awesome", () => {
  assert.equal(draftKind({ ...BASE, readme: "# Awesome MCP Servers\n\nServers, by category." }), "awesome-list");
  assert.equal(draftKind({ ...BASE, readme: "# Awesomeness\n\nServers, by category." }), "other");
});

test("the README: read raw; none (404) is no warning; one that can't be read is a warning and no README", async () => {
  const none = await fetchRepository(KARPATHY, { fetch: fakeFetch(recorded("multica-ai--andrej-karpathy-skills")) });
  assert.ok(none.ok);
  assert.equal(none.metadata.readme, null);
  assert.deepEqual(none.warnings, []);
  const fetch = fakeFetch(recorded("microsoft--playwright-cli"), [], (path) => (path.endsWith("/readme") ? Promise.resolve(new Response("{}", { status: 500 })) : undefined));
  const failed = await fetchRepository(PLAYWRIGHT, { fetch });
  assert.ok(failed.ok);
  assert.equal(failed.metadata.readme, null);
  assert.deepEqual(failed.warnings, ["Couldn't read the README: GitHub answered 500. The kind and domains come from the topics and files only."]);
  // read even when the file list fails
  const noTree = fakeFetch(recorded("microsoft--playwright-cli"), [], (path) => (path.includes("/git/trees/") ? Promise.resolve(new Response("{}", { status: 500 })) : undefined));
  const r = await fetchRepository(PLAYWRIGHT, { fetch: noTree });
  assert.ok(r.ok);
  assert.match(r.metadata.readme ?? "", /^# playwright-cli/);
});

test("a root action.yml or action.yaml is a GitHub Action; one in a folder isn't", async () => {
  for (const [path, action] of [["action.yml", true], ["action.yaml", true], ["sub/action.yml", false]] as const) {
    const responses = recorded("multica-ai--andrej-karpathy-skills");
    responses["/repos/multica-ai/andrej-karpathy-skills/git/trees/main?recursive=1"] = { tree: [{ path, type: "blob" }] };
    const r = await fetchRepository(KARPATHY, { fetch: fakeFetch(responses) });
    assert.ok(r.ok);
    assert.equal(r.metadata.action, action, path);
  }
});

test("manifest keywords come from every root manifest, each once", async () => {
  const responses = recorded("microsoft--playwright-cli");
  const key = "/repos/microsoft/playwright-cli/contents/package.json?ref=main";
  responses[key] = JSON.stringify({ name: "@playwright/cli", keywords: ["playwright", "Testing", "testing"] });
  const r = await fetchRepository(PLAYWRIGHT, { fetch: fakeFetch(responses) });
  assert.ok(r.ok);
  assert.deepEqual(r.metadata.keywords, ["playwright", "testing"]);
});

test("countSkillFolders: one per folder holding a SKILL.md, the root included; not inside a hidden folder", () => {
  assert.equal(countSkillFolders(["SKILL.md", "skills/a/SKILL.md", "skills/b/SKILL.md", "skills/b/SKILL.md", "README.md"]), 3);
  assert.equal(countSkillFolders([".agents/skills/a/SKILL.md", ".claude/skills/a/SKILL.md", "apps/studio/.claude/skills/x/SKILL.md", "docs/.hidden/SKILL.md"]), 0);
  assert.equal(countSkillFolders(["skills/notaskill.md", "skills/a/skill.md"]), 0);
});

// The maintainer's first ten repositories and three skill packs, recorded with gh api GET
// (fixtures/kinds.json). The guesses decision 0030 accepts, debatable ones included.
test("draftKind on the maintainer's repositories", () => {
  const fixture = JSON.parse(readFileSync(new URL("fixtures/kinds.json", import.meta.url), "utf8")) as {
    repositories: { full_name: string; topics: string[]; is_template: boolean; skill_md: string[]; packages: string[]; bin: boolean; plugin: boolean }[];
  };
  const guesses = Object.fromEntries(fixture.repositories.map((r) => [
    r.full_name,
    draftKind({ name: r.full_name, topics: r.topics, template: r.is_template, skillFolders: countSkillFolders(r.skill_md), packages: r.packages, bin: r.bin, plugin: r.plugin }),
  ]));
  assert.deepEqual(guesses, {
    "coollabsio/coolify": "app", // a PaaS, but no platform topic; self-hosted and docker
    "OpenHands/OpenHands": "cli", // its root package.json has bin (debatable: an app)
    "getmaxun/maxun": "platform",
    "open-webui/open-webui": "app",
    "browser-use/browser-use": "library", // 7 SKILL.md folders, but it publishes a package
    "langflow-ai/langflow": "library", // publishes a package; no app or platform topic (debatable)
    "supabase/supabase": "other", // no platform topic, private package.json (accepted)
    "Stirling-Tools/Stirling-PDF": "app",
    "unclecode/crawl4ai": "library",
    "langgenius/dify": "platform", // low-code and no-code, before its topic skills
    "mattpocock/skills": "skill-pack",
    "vercel-labs/agent-skills": "skill-pack",
    "Leonxlnx/taste-skill": "skill-pack",
  });
});

test("draftKind on the recorded repositories", async () => {
  const kinds: string[] = [];
  for (const [purl, name] of [[KARPATHY, "multica-ai--andrej-karpathy-skills"], [PLAYWRIGHT, "microsoft--playwright-cli"], [AWESOME, "voltagent--awesome-design-md"]]) {
    const r = await fetchRepository(purl, { fetch: fakeFetch(recorded(name)) });
    assert.ok(r.ok);
    kinds.push(draftKind(r.metadata));
  }
  assert.deepEqual(kinds, ["skill-pack", "cli", "awesome-list"]);
});
