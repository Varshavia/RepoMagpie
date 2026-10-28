import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { scratchBase } from "../src/core/fixtures/scratch.ts";
import { tagRelease, type Io } from "./tag-release.ts";

// npm run release:tag (docs/release.md, section 3): its decisions against a fake git, a table of
// answers, so no test touches a real repository's tags or the network. Then one run against a
// throwaway repository with a bare "origin", both in .scratch/tests/.

const VERSION = "0.2.0-beta.15";
const TAG = `v${VERSION}`;
const HEAD = "a".repeat(40);
const MERGE = `Merge pull request #64 from Varshavia/release/${TAG}`;

type Answer = string | Error | ((input?: string) => string);
const HAPPY: Record<string, Answer> = {
  "rev-parse --show-toplevel": "/repo",
  "rev-parse --abbrev-ref HEAD": "main",
  "status --porcelain": "",
  "fetch origin main --tags": "",
  "rev-parse HEAD": HEAD,
  "rev-parse origin/main": HEAD,
  "show HEAD:package.json": JSON.stringify({ name: "repomagpie", version: VERSION }),
  [`tag --list ${TAG}`]: "",
  [`ls-remote --tags origin refs/tags/${TAG}`]: "",
  "log -1 --format=%s HEAD": MERGE,
  "rev-list --parents -n 1 HEAD": `${HEAD} ${"b".repeat(40)} ${"c".repeat(40)}`,
  "merge-base --is-ancestor HEAD origin/main": "",
  "rev-parse --is-shallow-repository": "false",
  [`tag -a ${TAG} -m ${TAG}`]: "",
  [`push origin ${TAG}`]: "",
  [`ls-files --others --ignored --exclude-standard -- .scratch/release-notes-${VERSION}.md`]: `.scratch/release-notes-${VERSION}.md`,
};

// Runs tagRelease against the table (HAPPY with `changes`); every git call is recorded, and one the
// table doesn't answer fails the test.
async function run(changes: Record<string, Answer | undefined> = {}, over: Partial<Io> = {}, argv: string[] = []) {
  const table = { ...HAPPY, ...changes };
  const calls: string[] = [];
  const unexpected: string[] = [];
  let out = "";
  const io: Io = {
    cwd: "/repo",
    git: (args, input) => {
      const key = args.join(" ");
      calls.push(key);
      const answer = table[key];
      if (answer === undefined) {
        unexpected.push(key);
        throw new Error(`unexpected git call: git ${key}`);
      }
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(input) : answer;
    },
    gh: () => null,
    isTTY: true,
    ask: async () => TAG,
    out: (text) => { out += text; },
    ...over,
  };
  const code = await tagRelease(argv, io);
  assert.deepEqual(unexpected, [], "every git call is in the table");
  return { code, out, calls, tagged: calls.some((call) => call.startsWith("tag -a") || call.startsWith("push")) };
}

const stopped = (out: string) => /\nStopped: ([\s\S]*)$/.exec(out)?.[1].trim() ?? "";

test("the merged release on main: every check passes, the typed tag tags and pushes, then the next steps, filled in", async () => {
  const runs = JSON.stringify([{ databaseId: 987654, headSha: HEAD, url: "https://github.com/Varshavia/RepoMagpie/actions/runs/987654" }]);
  const r = await run({}, { gh: (args) => (args[0] === "run" ? runs : null) });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.calls.slice(-1), [`ls-files --others --ignored --exclude-standard -- .scratch/release-notes-${VERSION}.md`]);
  assert.ok(r.calls.indexOf(`tag -a ${TAG} -m ${TAG}`) < r.calls.indexOf(`push origin ${TAG}`));
  for (const line of [
    `ok  HEAD is the merge of release/${TAG}: ${MERGE}`,
    "ok  the release workflow's check (scripts/release-check.ts): dist-tag beta",
    `Tagged aaaaaaa as ${TAG} and pushed it.`,
    "https://github.com/Varshavia/RepoMagpie/actions/runs/987654",
    "npx -y npm@11.21.0 stage list repomagpie",
    "If approve fails with E409, npm's automated review is still running (stage list shows validating).",
    `npm view repomagpie@${VERSION} version dist.tarball --prefer-online`,
    `npm pack repomagpie@${VERSION} --prefer-online --pack-destination .scratch`,
    `$h = (Get-FileHash .\\.scratch\\repomagpie-${VERSION}.tgz -Algorithm SHA256).Hash.Substring(0,8).ToLower()`,
    "gh run view 987654 --log | Select-String $h",
    `h=$(shasum -a 256 .scratch/repomagpie-${VERSION}.tgz | cut -c1-8)`,
    "gh run view 987654 --log | grep $h",
    `npm dist-tag add repomagpie@${VERSION} latest`,
    "npm view repomagpie dist-tags --prefer-online shows beta and latest",
    `gh release create ${TAG} --prerelease --title "${VERSION}" --notes-file .scratch/release-notes-${VERSION}.md`,
    `npm install -g repomagpie@${VERSION}`,
    "repomagpie setup --yes",
    "repomagpie doctor",
  ]) assert.ok(r.out.includes(line), line);
  // The tarball can be fetched only once approved, and latest moved first: approve, dist-tag, then the SHA.
  const at = (text: string) => r.out.indexOf(text);
  assert.ok(at("stage approve") < at("npm dist-tag add") && at("npm dist-tag add") < at("npm pack repomagpie@"), "approve, then dist-tag, then the SHA check");
  assert.ok(!/npm view(?![^\n]*--prefer-online)/.test(r.out), "every npm view has --prefer-online");
  assert.ok(!r.out.includes("$run"), "with the run's id known, no placeholder line");
  assert.ok(!r.out.includes("isn't there yet"));
  assert.match(r.out, /^[\x20-\x7e\n]*$/, "ASCII only");
});

test("without gh, the next steps find the run themselves, with no placeholder to fill in; missing release notes are named", async () => {
  const r = await run({ [`ls-files --others --ignored --exclude-standard -- .scratch/release-notes-${VERSION}.md`]: "" });
  assert.equal(r.code, 0);
  assert.ok(r.out.includes('$run = gh run list --workflow release.yml --limit 1 --json databaseId --jq ".[0].databaseId"'));
  assert.ok(r.out.includes("gh run view $run --log | Select-String $h"));
  assert.ok(r.out.includes("gh run view $run --log | grep $h"));
  assert.ok(r.out.includes(`.scratch/release-notes-${VERSION}.md isn't there yet: draft the release notes first.`));
});

test("--dry-run: checks 1 to 8 pass, nothing is tagged, and it needs no terminal", async () => {
  const r = await run({}, { isTTY: false, ask: () => Promise.reject(new Error("no prompt in a dry run")) }, ["--dry-run"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.tagged, false);
  assert.match(r.out, /Dry run: every check passed\. Without --dry-run this asks you to type v0\.2\.0-beta\.15, then tags aaaaaaa and pushes v0\.2\.0-beta\.15 to origin\.\n$/);
});

test("the beta.14 case: the release pull request isn't merged yet, HEAD is the merge before it", async () => {
  const subject = "Merge pull request #60 from Varshavia/dependabot/npm_and_yarn/vite-8.3.4";
  const prs = JSON.stringify([{ number: 64, state: "OPEN", mergedAt: null }]);
  const r = await run({ "log -1 --format=%s HEAD": subject }, { gh: (args) => (args.join(" ") === `pr list --head release/${TAG} --state all --json number,state,mergedAt` ? prs : null) });
  assert.equal(r.code, 1);
  assert.equal(r.tagged, false);
  assert.equal(stopped(r.out), `HEAD is aaaaaaa ${subject}, not the merge of release/${TAG}. Merge the release pull request on GitHub, then run git pull.\nPull request #64 from release/${TAG} is open.`);
  // Without gh the hint is left out; it's never required.
  const plain = await run({ "log -1 --format=%s HEAD": subject });
  assert.equal(stopped(plain.out), `HEAD is aaaaaaa ${subject}, not the merge of release/${TAG}. Merge the release pull request on GitHub, then run git pull.`);
  // As it was on 2026-10-27: main's package.json still had the version before, tagged already.
  const before = await run({ "log -1 --format=%s HEAD": subject, "show HEAD:package.json": JSON.stringify({ version: "0.2.0-beta.13" }), "ls-remote --tags origin refs/tags/v0.2.0-beta.13": `${"f".repeat(40)}\trefs/tags/v0.2.0-beta.13` });
  assert.equal(before.code, 1);
  assert.equal(before.tagged, false);
  assert.equal(stopped(before.out), "The tag v0.2.0-beta.13 already exists on origin: 0.2.0-beta.13 is released. To release the next version, merge its release pull request on GitHub and run git pull first; package.json then has the new version.");
});

test("the merge of another version's release branch, or of a branch whose name only starts the same, isn't this release's", async () => {
  for (const subject of ["Merge pull request #63 from Varshavia/release/v0.2.0-beta.14", `Merge pull request #65 from Varshavia/release/${TAG}0`]) {
    const r = await run({ "log -1 --format=%s HEAD": subject });
    assert.equal(r.code, 1, subject);
    assert.match(stopped(r.out), /not the merge of release\/v0\.2\.0-beta\.15\./);
  }
});

test("the beta.11 case: on the release branch, not main", async () => {
  const r = await run({ "rev-parse --abbrev-ref HEAD": `release/${TAG}` });
  assert.equal(r.code, 1);
  assert.equal(r.tagged, false);
  assert.equal(stopped(r.out), `Switch to main first: git switch main (this is release/${TAG}).`);
  assert.ok(!r.calls.includes("fetch origin main --tags"), "stops before the fetch");
});

test("the beta.12 case: main behind origin/main, so the merge hasn't been pulled", async () => {
  const r = await run({ "rev-parse origin/main": "d".repeat(40), "rev-list --left-right --count HEAD...origin/main": "0\t2" });
  assert.equal(r.code, 1);
  assert.equal(stopped(r.out), "Run git pull first: main is 2 commits behind.");
});

test("main ahead of origin/main: those commits go through a pull request", async () => {
  const one = await run({ "rev-parse origin/main": "d".repeat(40), "rev-list --left-right --count HEAD...origin/main": "1\t0" });
  assert.equal(stopped(one.out), "main has 1 commit that isn't on GitHub; push them through a pull request.");
  const both = await run({ "rev-parse origin/main": "d".repeat(40), "rev-list --left-right --count HEAD...origin/main": "2\t3" });
  assert.equal(stopped(both.out), "main has 2 commits that aren't on GitHub; push them through a pull request. It is also 3 behind origin/main.");
});

test("a tag that exists on origin, or only here, is refused", async () => {
  const remote = await run({ [`ls-remote --tags origin refs/tags/${TAG}`]: `${HEAD}\trefs/tags/${TAG}` });
  assert.equal(remote.code, 1);
  assert.equal(stopped(remote.out), `The tag ${TAG} already exists on origin: ${VERSION} is released. To release the next version, merge its release pull request on GitHub and run git pull first; package.json then has the new version.`);
  const local = await run({ [`tag --list ${TAG}`]: TAG });
  assert.equal(stopped(local.out), `The tag ${TAG} exists here but not on origin. If it points to the wrong commit, delete it (git tag -d ${TAG}) and run this again.`);
});

test("a dirty tree is refused, with its files", async () => {
  const r = await run({ "status --porcelain": " M package.json\n?? notes.txt" });
  assert.equal(r.code, 1);
  assert.equal(stopped(r.out), "The working tree isn't clean. These files differ from HEAD:\n   M package.json\n  ?? notes.txt");
});

test("no terminal: every check passes, but nothing is tagged without the typed confirmation", async () => {
  const r = await run({}, { isTTY: false });
  assert.equal(r.code, 1);
  assert.equal(r.tagged, false);
  assert.equal(stopped(r.out), "release:tag asks for confirmation and needs a terminal. Nothing was tagged.");
});

test("a typed name that isn't the tag cancels", async () => {
  for (const typed of ["v0.2.0-beta.14", "y", "", "0.2.0-beta.15"]) {
    const r = await run({}, { ask: async () => typed });
    assert.equal(r.code, 1, typed);
    assert.equal(r.tagged, false, typed);
    assert.match(r.out, /Cancelled: nothing was tagged\.\n$/);
  }
});

test("a failed push deletes the local tag again, so a retry starts clean", async () => {
  const r = await run({ [`push origin ${TAG}`]: new Error("Could not resolve host: github.com"), [`tag -d ${TAG}`]: "" });
  assert.equal(r.code, 1);
  assert.deepEqual(r.calls.slice(-2), [`push origin ${TAG}`, `tag -d ${TAG}`]);
  assert.equal(stopped(r.out), `git push origin ${TAG} failed: Could not resolve host: github.com\nThe local tag ${TAG} is deleted again, so a retry starts clean.`);
});

// A "Rebase and merge": HEAD is one commit, the last of the release branch, rebased onto main.
const REBASED: Record<string, Answer> = {
  "rev-list --parents -n 1 HEAD": `${HEAD} ${"b".repeat(40)}`,
  "log -1 --format=%s HEAD": `docs: status for ${VERSION}`,
  [`ls-remote --heads origin release/${TAG}`]: `${"e".repeat(40)}\trefs/heads/release/${TAG}`,
  [`fetch origin release/${TAG}`]: "",
  [`rev-list --reverse HEAD..origin/release/${TAG}`]: "s1\ns2",
  [`rev-list --reverse -n 2 ${HEAD}`]: "m1\nm2",
  "show s1": "patch one", "show s2": "patch two", "show m1": "patch one", "show m2": "patch two",
  "patch-id --stable": (input = "") => `${input.replaceAll(" ", "-")} commit`, // a patch's id is its text here
};

test("a rebase-merged release: accepted when main's last commits are the branch's, patch for patch", async () => {
  const r = await run(REBASED, {}, ["--dry-run"]);
  assert.equal(r.code, 0, r.out);
  assert.ok(r.out.includes(`ok  HEAD is the last commit of release/${TAG}, rebased onto main: docs: status for ${VERSION}`));
  const release = await run({ ...REBASED, "log -1 --format=%s HEAD": `chore: release ${VERSION}` }, {}, ["--dry-run"]);
  assert.equal(release.code, 0, release.out);
});

test("a rebase-merged release whose branch is gone from GitHub: accepted on its subject and version", async () => {
  const r = await run({ ...REBASED, [`ls-remote --heads origin release/${TAG}`]: "" }, {}, ["--dry-run"]);
  assert.equal(r.code, 0, r.out);
  assert.ok(!r.calls.includes(`fetch origin release/${TAG}`));
});

test("a rebase-merged release is refused when the patches differ, or the subject isn't the release's", async () => {
  const differ = await run({ ...REBASED, "show m2": "something else" }, {}, ["--dry-run"]);
  assert.equal(differ.code, 1);
  assert.equal(stopped(differ.out), `HEAD is aaaaaaa docs: status for ${VERSION}, a single commit, and main's last 2 commits aren't release/${TAG}'s on GitHub, patch for patch. Tag by hand only after checking (docs/release.md, section 3).`);
  const other = await run({ ...REBASED, "log -1 --format=%s HEAD": "fix: a typo" }, {}, ["--dry-run"]);
  assert.equal(stopped(other.out), `HEAD is aaaaaaa fix: a typo, not the merge of release/${TAG}. Merge the release pull request on GitHub, then run git pull.`);
});

test("the other refusals: not git, not the root, offline, not semver, the workflow's own check; --version isn't an option", async () => {
  assert.match(stopped((await run({ "rev-parse --show-toplevel": new Error("git isn't on PATH") })).out), /^git can't run here, or this folder isn't in a git repository: git isn't on PATH$/);
  assert.equal(stopped((await run({ "rev-parse --show-toplevel": "/repo/ui" })).out), `Run this from the repository's root, /repo/ui, not /repo.`);
  assert.match(stopped((await run({ "fetch origin main --tags": new Error("Could not resolve host: github.com") })).out), /^git fetch origin main --tags failed, and the checks need GitHub's main: Could not resolve host: github\.com$/);
  assert.equal(stopped((await run({ "show HEAD:package.json": JSON.stringify({ version: "next" }) })).out), "package.json's version (next) isn't a version npm can publish.");
  assert.equal(stopped((await run({ "rev-parse --is-shallow-repository": "true" })).out), "The checkout is shallow, so main's history can't be checked. Check out with fetch-depth: 0.");
  assert.equal(stopped((await run({}, {}, ["--version", "0.2.0"])).out), "--version is not an option: the version always comes from package.json.");
});

test("against a throwaway repository with a bare origin: refuses before the release merge, passes --dry-run after it", async () => {
  const base = scratchBase("tag-release");
  const work = join(base, "work");
  const origin = join(base, "origin.git");
  mkdirSync(work);
  // Isolated from the machine's git config (signing, hooks, the default branch); never above `base`.
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(base, "gitconfig"), GIT_CEILING_DIRECTORIES: base, HOME: base, USERPROFILE: base };
  writeFileSync(join(base, "gitconfig"), "[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n[tag]\n\tgpgsign = false\n");
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
  const write = (version: string) => writeFileSync(join(work, "package.json"), `${JSON.stringify({ name: "x", version }, null, 2)}\n`);
  git(base, "init", "--bare", origin);
  git(work, "init");
  write("0.0.1-beta.1");
  git(work, "add", "package.json");
  git(work, "commit", "-m", "chore: release 0.0.1-beta.1");
  git(work, "tag", "-a", "v0.0.1-beta.1", "-m", "v0.0.1-beta.1");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "origin", "main", "v0.0.1-beta.1");
  git(work, "switch", "-c", "release/v0.0.1-beta.2");
  write("0.0.1-beta.2");
  git(work, "commit", "-am", "chore: release 0.0.1-beta.2");
  git(work, "push", "origin", "release/v0.0.1-beta.2");
  git(work, "switch", "main");

  let out = "";
  const io: Io = {
    cwd: work,
    git: (args, input) => {
      try {
        return execFileSync("git", args, { cwd: work, env, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }).trimEnd();
      } catch (error) {
        throw new Error(String((error as { stderr?: string }).stderr ?? error).trim().split(/\r?\n/)[0]);
      }
    },
    gh: () => null, // never the real gh: it would ask GitHub about this repository's remote
    isTTY: false,
    ask: () => Promise.reject(new Error("no prompt in a dry run")),
    out: (text) => { out += text; },
  };

  // Before the merge: main's package.json still has 0.0.1-beta.1, released and tagged.
  assert.equal(await tagRelease(["--dry-run"], io), 1, out);
  assert.match(out, /Stopped: The tag v0\.0\.1-beta\.1 already exists on origin: 0\.0\.1-beta\.1 is released\. To release the next version, merge its release pull request/);

  // The release pull request, merged on GitHub (here: a merge commit pushed to origin), then pulled.
  git(work, "merge", "--no-ff", "release/v0.0.1-beta.2", "-m", "Merge pull request #2 from owner/release/v0.0.1-beta.2");
  git(work, "push", "origin", "main");
  out = "";
  assert.equal(await tagRelease(["--dry-run"], io), 0, out);
  assert.match(out, /ok {2}HEAD is the merge of release\/v0\.0\.1-beta\.2: Merge pull request #2 from owner\/release\/v0\.0\.1-beta\.2\n/);
  assert.match(out, /Dry run: every check passed\./);
  assert.equal(git(work, "tag", "--list"), "v0.0.1-beta.1", "a dry run tags nothing");
  assert.equal(git(origin, "tag", "--list"), "v0.0.1-beta.1");
});
