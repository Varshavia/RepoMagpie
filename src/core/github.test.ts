import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { countSkillFolders, draftKind, fetchRepository, packageFromManifest, type Fetch } from "./github.ts";

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

// --- metadata from recorded responses ---

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
  ]);
  for (const call of calls) {
    assert.equal(call.method, "GET");
    assert.equal(call.headers["X-GitHub-Api-Version"], "2022-11-28");
    assert.match(call.headers["User-Agent"], /^repomagpie/);
    assert.equal(call.headers.Authorization, undefined);
  }
  assert.equal(calls[0].headers.Accept, "application/vnd.github+json");
  assert.equal(calls[2].headers.Accept, "application/vnd.github.raw+json");
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
  const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(limited) });
  assert.ok(!r.ok);
  assert.equal(r.problem.kind, "rate-limit");
  assert.match(r.problem.message, /14:05 UTC/);
  assert.match(r.problem.message, /GITHUB_TOKEN/);

  const withToken = await fetchRepository(PLAYWRIGHT, { fetch: failWith(limited), token: TOKEN });
  assert.ok(!withToken.ok);
  assert.doesNotMatch(withToken.problem.message, /GITHUB_TOKEN/);
});

test("429 and a secondary rate limit (403 with retry-after) are rate-limit", async () => {
  for (const response of [() => new Response("{}", { status: 429 }), () => new Response("{}", { status: 403, headers: { "retry-after": "60" } })]) {
    const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(response) });
    assert.ok(!r.ok);
    assert.equal(r.problem.kind, "rate-limit");
  }
});

test("a rejected token is auth", async () => {
  const r = await fetchRepository(PLAYWRIGHT, { fetch: failWith(() => new Response("{}", { status: 401 })), token: TOKEN });
  assert.ok(!r.ok);
  assert.equal(r.problem.kind, "auth");
  assert.match(r.problem.message, /GITHUB_TOKEN may be invalid or expired/);
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
  ["10 3 skill folders beat a plugin", { skillFolders: 3, plugin: true }, "skill-pack"],
  ["11 2 skill folders with a plugin manifest: plugin", { skillFolders: 2, plugin: true }, "plugin"],
  ["12 2 skill folders alone: other", { skillFolders: 2 }, "other"],
  ["12 unknown skill folders and packages count as none", { skillFolders: null, packages: null }, "other"],
];

for (const [title, over, kind] of KIND_CASES) {
  test(`draftKind: ${title}`, () => {
    assert.equal(draftKind({ ...BASE, ...over }), kind);
  });
}

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
