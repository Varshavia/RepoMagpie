import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { releaseCheck, serverVersions } from "./release-check.ts";

// The release workflow's checks before anything is staged (decision 0033): the tag names the
// package's version, server.json names it twice too, its commit is on main's history, and the
// dist-tag follows from the version. Git is replaced by a fake: the workflow runs the real one.

const onMain = () => true;
// server.json with both versions set to `version`.
const server = (version: string) => ({ name: "io.github.Varshavia/repomagpie", version, packages: [{ registryType: "npm", identifier: "repomagpie", version }] });
// The Claude Code plugin's manifest with its version set to `version`.
const plugin = (version: string) => ({ name: "repomagpie", version });

test("a prerelease tag that equals the version is staged under beta", () => {
  assert.deepEqual(releaseCheck({ tag: "v0.2.0-beta.3", version: "0.2.0-beta.3", server: server("0.2.0-beta.3"), plugin: plugin("0.2.0-beta.3"), isOnMain: onMain }), { ok: true, distTag: "beta" });
});

test("a final version is staged under latest", () => {
  assert.deepEqual(releaseCheck({ tag: "v1.0.0", version: "1.0.0", server: server("1.0.0"), plugin: plugin("1.0.0"), isOnMain: onMain }), { ok: true, distTag: "latest" });
});

test("a tag that doesn't equal v plus the version is refused, with both named", () => {
  for (const tag of ["v0.2.0", "0.2.0-beta.3", "v0.2.0-beta.3x", "release-0.2.0-beta.3", ""]) {
    const r = releaseCheck({ tag, version: "0.2.0-beta.3", server: server("0.2.0-beta.3"), plugin: plugin("0.2.0-beta.3"), isOnMain: onMain });
    assert.equal(r.ok, false, tag);
    if (!r.ok) assert.match(r.error, /doesn't match the version in package\.json \(0\.2\.0-beta\.3\)/);
  }
});

test("a tag whose commit isn't on main's history is refused", () => {
  const r = releaseCheck({ tag: "v0.2.0-beta.3", version: "0.2.0-beta.3", server: server("0.2.0-beta.3"), plugin: plugin("0.2.0-beta.3"), isOnMain: () => false });
  assert.deepEqual(r, { ok: false, error: "The tag v0.2.0-beta.3 points to a commit that isn't on main's history. Release tags are created on main only (decision 0012)." });
});

test("a shallow clone is refused before the history check, which would give a wrong answer", () => {
  const r = releaseCheck({ tag: "v0.2.0-beta.3", version: "0.2.0-beta.3", server: server("0.2.0-beta.3"), plugin: plugin("0.2.0-beta.3"), isOnMain: onMain, isShallow: () => true });
  assert.deepEqual(r, { ok: false, error: "The checkout is shallow, so main's history can't be checked. Check out with fetch-depth: 0." });
});

test("a version that isn't semver is refused", () => {
  const r = releaseCheck({ tag: "vlatest", version: "latest", server: server("latest"), plugin: plugin("latest"), isOnMain: onMain });
  assert.equal(r.ok, false);
});

// The MCP Registry lists the version server.json names, so a stale one would list the last release.
test("server.json's version or its package's version left behind is refused, with both named", () => {
  const stale = [
    { ...server("0.2.1"), version: "0.2.0" },
    { ...server("0.2.1"), packages: [{ registryType: "npm", identifier: "repomagpie", version: "0.2.0" }] },
    { ...server("0.2.1"), packages: [] },
    undefined, // missing, or not JSON
  ];
  for (const s of stale) {
    const r = releaseCheck({ tag: "v0.2.1", version: "0.2.1", server: s, plugin: plugin("0.2.1"), isOnMain: onMain });
    assert.equal(r.ok, false, JSON.stringify(s));
    if (!r.ok) assert.match(r.error, /^server\.json's versions \(.*\) must be package\.json's version \(0\.2\.1\): set its version and its npm package's version to 0\.2\.1\./);
  }
  assert.deepEqual(serverVersions({ ...server("0.2.1"), version: "0.2.0" }), ["0.2.0", "0.2.1"]);
  assert.deepEqual(serverVersions(undefined), [undefined]);
});

// Claude Code keeps an installed plugin at the version its manifest names (decision 0063).
test("a plugin manifest whose version is left behind, or missing, is refused, with both named", () => {
  for (const p of [plugin("0.2.0"), { name: "repomagpie" }, undefined]) {
    const r = releaseCheck({ tag: "v0.2.1", version: "0.2.1", server: server("0.2.1"), plugin: p, isOnMain: onMain });
    assert.equal(r.ok, false, JSON.stringify(p));
    if (!r.ok) assert.match(r.error, /^\.claude-plugin\/plugin\.json's version \((0\.2\.0|undefined)\) must be package\.json's version \(0\.2\.1\): set it to 0\.2\.1\./);
  }
});

// The repository's own server.json, so npm test fails on a release branch that forgot it, before the tag.
test("the repository's server.json: package.json's version twice, its mcpName, npx repomagpie mcp over stdio", () => {
  const read = (file: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8"));
  const pkg = read("package.json") as { name: string; version: string; mcpName: string };
  const s = read("server.json");
  assert.deepEqual(serverVersions(s), [pkg.version, pkg.version]);
  // The registry checks the npm package's mcpName against the name, case and all: the GitHub login is Varshavia.
  assert.equal(s.name, pkg.mcpName);
  assert.equal(s.name, "io.github.Varshavia/repomagpie");
  assert.ok(s.description.length >= 1 && s.description.length <= 100, `the registry's limit is 100 characters: ${s.description.length}`);
  assert.equal(s.repository.url, "https://github.com/Varshavia/RepoMagpie");
  assert.deepEqual(s.packages.map((p: Record<string, unknown>) => [p.registryType, p.identifier, p.runtimeHint, p.transport, p.packageArguments]),
    [["npm", pkg.name, "npx", { type: "stdio" }, [{ type: "positional", value: "mcp" }]]]);
});
