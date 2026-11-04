import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { chooseRemote, countChanged, parseRemote, projectInfo, sharingLine } from "./repository.ts";

// The Project view's identity and sharing line (docs/ui.md §7): from local git only.

test("parseRemote: https and git@, with or without .git, become owner/repo and the host", () => {
  const github = { name: "acme/widget", host: "github.com", url: "https://github.com/acme/widget" };
  for (const remote of ["https://github.com/acme/widget.git", "https://github.com/acme/widget", "git@github.com:acme/widget.git", "git@github.com:acme/widget", "ssh://git@github.com:22/acme/widget.git", "https://github.com/acme/widget/"]) {
    assert.deepEqual(parseRemote(remote), github, remote);
  }
  assert.deepEqual(parseRemote("git@gitlab.com:group/sub/tool.git"), { name: "group/sub/tool", host: "gitlab.com", url: "https://gitlab.com/group/sub/tool" });
  assert.deepEqual(parseRemote("git@bitbucket.org:team/app.git"), { name: "team/app", host: "bitbucket.org", url: "https://bitbucket.org/team/app" });
});

test("parseRemote: a web link only for a known web host or an https remote", () => {
  assert.deepEqual(parseRemote("https://git.example.com/team/app.git"), { name: "team/app", host: "git.example.com", url: "https://git.example.com/team/app" });
  assert.deepEqual(parseRemote("git@git.example.com:team/app.git"), { name: "team/app", host: "git.example.com", url: null });
  assert.deepEqual(parseRemote("http://git.example.com/team/app.git"), { name: "team/app", host: "git.example.com", url: null });
});

test("parseRemote: credentials in a remote never come out", () => {
  const token = "ghp_FAKEtoken1234567890";
  for (const remote of [`https://user:${token}@github.com/acme/widget.git`, `https://${token}@github.com/acme/widget.git`, `https://oauth2:${token}@gitlab.com/acme/widget.git`]) {
    const parsed = parseRemote(remote);
    assert.equal(parsed?.name, "acme/widget", remote);
    assert.ok(!JSON.stringify(parsed).includes(token), remote);
    assert.ok(!JSON.stringify(parsed).includes("user"), remote);
  }
});

test("parseRemote: local paths and file:// have no host; nonsense is null", () => {
  for (const remote of ["/srv/git/app.git", "../app", "C:\\repos\\app.git", "C:/repos/app.git", "file:///srv/git/app.git", "", "https://"]) {
    assert.equal(parseRemote(remote), null, remote);
  }
});

test("parseRemote: a path that isn't owner/repo shows, without a link", () => {
  assert.deepEqual(parseRemote("https://github.com/only"), { name: "only", host: "github.com", url: null });
  assert.deepEqual(parseRemote("https://github.com/acme/wid get"), { name: "acme/wid get", host: "github.com", url: null });
});

test("chooseRemote: origin's URL, else the first", () => {
  assert.equal(chooseRemote("remote.upstream.url https://github.com/a/b\nremote.origin.url git@github.com:me/b.git\n"), "git@github.com:me/b.git");
  assert.equal(chooseRemote("remote.upstream.url https://github.com/a/b\r\nremote.fork.url https://github.com/c/b\r\n"), "https://github.com/a/b");
  assert.equal(chooseRemote(""), null);
});

test("countChanged: one per file; a rename's old path isn't another file", () => {
  assert.equal(countChanged(""), 0);
  assert.equal(countChanged("?? .magpie/notes/npm--a.md\0 M .magpie/tags.md\0"), 2);
  assert.equal(countChanged("R  .magpie/notes/new.md\0.magpie/notes/old.md\0A  .magpie/notes/b.md\0"), 2);
});

test("sharingLine: uncommitted first, then not pushed, else committed; no upstream says only the first", () => {
  assert.equal(sharingLine(3, 1), "3 shared note files aren't committed yet, so your team can't see them.");
  assert.equal(sharingLine(1, null), "1 shared note file isn't committed yet, so your team can't see them.");
  assert.equal(sharingLine(0, 2), "Committed, not pushed yet.");
  assert.equal(sharingLine(0, 0), "Shared notes are committed.");
  assert.equal(sharingLine(0, null), "Shared notes are committed.");
});

// A scratch repository with a fake git: what each call answers.
function box(withJournal = true) {
  const root = scratchBase("repository");
  const project = join(root, "home", "code", "app");
  mkdirSync(join(project, ".git"), { recursive: true });
  if (withJournal) mkdirSync(join(project, ".magpie", "notes"), { recursive: true });
  return { home: join(root, "home"), env: { MAGPIE_HOME: join(root, "journal") }, cwd: project };
}

test("projectInfo: the identity and the line from git's answers; the credentials stripped", async () => {
  const calls: string[][] = [];
  const answers: Record<string, string | null> = {
    config: "remote.origin.url https://me:ghp_FAKEtoken@github.com/acme/widget.git\n",
    status: "?? .magpie/notes/npm--a.md\0?? .magpie/tags.md\0",
    "rev-list": null, // no upstream
  };
  const info = await projectInfo(box(), async (args) => (calls.push(args), answers[args[0]] ?? null));
  assert.deepEqual(info, {
    repository: { name: "acme/widget", host: "github.com", url: "https://github.com/acme/widget" },
    sharing: "2 shared note files aren't committed yet, so your team can't see them.",
  });
  assert.ok(!JSON.stringify(info).includes("ghp_"));
  assert.deepEqual(calls.find((c) => c[0] === "status"), ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".magpie"]);
  assert.ok(calls.every((c) => !["fetch", "pull", "push", "remote"].includes(c[0])), "local calls only");
});

test("projectInfo: no remote shows the folder's name; no journal yet, no line", async () => {
  const git = async (args: string[]) => (args[0] === "rev-parse" ? ".git\n" : null);
  assert.deepEqual(await projectInfo(box(false), git), { repository: { name: "app", host: null, url: null }, sharing: null });
});

test("projectInfo: git that fails or isn't there shows nothing; outside a repository, nothing", async () => {
  assert.deepEqual(await projectInfo(box(), async () => null), { repository: null, sharing: null });
  const root = scratchBase("repository");
  mkdirSync(join(root, "home", "notes-folder"), { recursive: true }); // below home without a repository: outside one
  assert.deepEqual(await projectInfo({ home: join(root, "home"), env: {}, cwd: join(root, "home", "notes-folder") }, async () => "x"), { repository: null, sharing: null });
  // No git on PATH.
  const place = box();
  assert.deepEqual(await projectInfo({ ...place, env: { ...place.env, PATH: "", Path: "" } }), { repository: null, sharing: null });
});

// The real git, when there is one: a fresh repository, then a commit. Skipped without git.
const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("projectInfo with git: uncommitted, then committed; an empty .git never reads the repository around it", { skip: !hasGit && "git isn't on PATH" }, async () => {
  const place = box(false);
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: join(place.cwd, "..") };
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: place.cwd, env, stdio: "ignore" });
  // Before git init: the folder's .git is empty, and this scratch folder sits inside RepoMagpie's
  // own repository. Nothing of that one may show.
  const outside = await projectInfo({ ...place, env: process.env as Record<string, string> });
  assert.deepEqual(outside, { repository: null, sharing: null });

  git("init", "-q");
  git("remote", "add", "origin", "https://u:FAKE@github.com/acme/widget.git");
  mkdirSync(join(place.cwd, ".magpie", "notes"), { recursive: true });
  writeFileSync(join(place.cwd, ".magpie", "notes", "npm--a.md"), "x\n");
  writeFileSync(join(place.cwd, ".magpie", "tags.md"), "x\n");
  writeFileSync(join(place.cwd, "README.md"), "outside .magpie\n");
  const real = { ...place, env: process.env as Record<string, string> };
  assert.deepEqual(await projectInfo(real), {
    repository: { name: "acme/widget", host: "github.com", url: "https://github.com/acme/widget" },
    sharing: "2 shared note files aren't committed yet, so your team can't see them.",
  });
  git("add", ".magpie");
  git("commit", "-q", "-m", "notes");
  assert.equal((await projectInfo(real)).sharing, "Shared notes are committed.");
});
