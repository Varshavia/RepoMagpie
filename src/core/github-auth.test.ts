import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { runCli } from "./agent-cli.ts";
import type { Platform } from "./agents.ts";
import { githubAuth, onceGitHubAuth, readGitHubAuth } from "./github-auth.ts";
import { ghLogin } from "./github-cli.ts";
import { scratchBase } from "./fixtures/scratch.ts";

// Where the GitHub token comes from (decision 0053): GITHUB_TOKEN, then GH_TOKEN, then gh's login.

const platform = process.platform as Platform;

function counted(answer: string | null) {
  let calls = 0;
  return { gh: () => (calls++, answer), calls: () => calls };
}

test("the order: GITHUB_TOKEN, then GH_TOKEN, then gh; gh isn't run when the environment has a token", () => {
  const gh = counted("gho_from_gh");
  assert.deepEqual(readGitHubAuth({ GITHUB_TOKEN: "a", GH_TOKEN: "b" }, gh.gh), { token: "a", source: "GITHUB_TOKEN" });
  assert.deepEqual(readGitHubAuth({ GH_TOKEN: "b" }, gh.gh), { token: "b", source: "GH_TOKEN" });
  assert.equal(gh.calls(), 0);
  assert.deepEqual(readGitHubAuth({}, gh.gh), { token: "gho_from_gh", source: "gh" });
  assert.equal(gh.calls(), 1);
});

test("blank variables are skipped, and the token is trimmed", () => {
  assert.deepEqual(readGitHubAuth({ GITHUB_TOKEN: "  ", GH_TOKEN: " b\n" }), { token: "b", source: "GH_TOKEN" });
  assert.deepEqual(readGitHubAuth({ GITHUB_TOKEN: "", GH_TOKEN: "" }, () => "gho_x\n"), { token: "gho_x", source: "gh" });
});

test("no token anywhere: not connected", () => {
  assert.deepEqual(readGitHubAuth({}), { source: null });
  assert.deepEqual(readGitHubAuth({}, () => null), { source: null });
});

test("gh's output that isn't one token is no token: a message, two lines, nothing", () => {
  for (const output of ["", "\n", "no oauth token found for github.com", "gho_a\ngho_b", "gho_a b"]) {
    assert.deepEqual(readGitHubAuth({}, () => output), { source: null }, JSON.stringify(output));
  }
});

test("read once per process: gh runs on the first call only", () => {
  const gh = counted("gho_once");
  const auth = onceGitHubAuth({}, gh.gh);
  assert.equal(gh.calls(), 0, "nothing runs before a request needs the token");
  assert.equal(auth().source, "gh");
  assert.equal(auth().source, "gh");
  assert.equal(gh.calls(), 1);
});

test("githubAuth: the context's lookup when it has one, else the environment alone", () => {
  assert.deepEqual(githubAuth({ env: { GH_TOKEN: "b" } }), { token: "b", source: "GH_TOKEN" });
  assert.deepEqual(githubAuth({ env: { GH_TOKEN: "b" }, github: () => ({ token: "c", source: "gh" }) }), { token: "c", source: "gh" });
});

test("ghLogin: no gh on PATH runs nothing; gh found runs `gh auth token` by its absolute path, with a short timeout", () => {
  const root = scratchBase("github-auth");
  const bin = join(root, "bin");
  mkdirSync(bin);
  const env = { PATH: bin };
  const calls: Parameters<typeof runCli>[] = [];
  const run = ((...args: Parameters<typeof runCli>) => (calls.push(args), { status: 0, stdout: "gho_fake\n", stderr: "" })) as typeof runCli;
  assert.equal(ghLogin({ home: root, env, platform }, run)(), null);
  assert.equal(calls.length, 0);

  const gh = join(bin, platform === "win32" ? "gh.exe" : "gh");
  writeFileSync(gh, "");
  chmodSync(gh, 0o755);
  assert.equal(ghLogin({ home: root, env, platform }, run)(), "gho_fake\n");
  assert.equal(calls.length, 1);
  const [file, args, options] = calls[0];
  assert.equal(file.toLowerCase(), gh.toLowerCase());
  assert.deepEqual(args, ["auth", "token"]);
  assert.equal(options.cwd, root);
  assert.ok(options.timeoutMs !== undefined && options.timeoutMs <= 5_000);

  const failed = (() => ({ status: 1, stdout: "", stderr: "not logged in" })) as typeof runCli;
  assert.equal(ghLogin({ home: root, env, platform }, failed)(), null);
});
