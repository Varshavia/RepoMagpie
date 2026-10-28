// npm run release:tag: the maintainer's tag guard (docs/release.md, section 3, step 3). It creates
// and pushes the release tag only when every check holds, in this order, and stops at the first that
// doesn't, saying what to do:
//   1. git runs, and this is the repository's root;   2. the branch is main;   3. the tree is clean;
//   4. git fetch origin main --tags works;   5. HEAD is origin/main;
//   6. package.json's version is semver, and v<version> isn't a tag here or on origin;
//   7. HEAD is the merge of release/v<version> (a merge commit "Merge pull request #N from
//      <owner>/release/v<version>"), or the last commit of that branch after a "Rebase and merge";
//   8. the release workflow's own check (scripts/release-check.ts), with the same inputs;
//   9. the maintainer types the tag name, in a terminal;
//  10. git tag -a, then git push origin <tag> (a failed push deletes the local tag again);
//  11. it prints the next steps, filled in with this version.
// --dry-run runs checks 1 to 8 and says what it would do. It needs no terminal, so an agent may run
// it; without it, agents are blocked (git-guard, the deny list) and the confirmation needs a terminal.
// git and gh run with argument arrays, never through a shell. Output is ASCII, apart from what git prints.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { releaseCheck, SEMVER } from "./release-check.ts";

export interface Io {
  cwd: string;
  git: (args: string[], input?: string) => string; // stdout; throws with git's message when git fails
  gh: (args: string[]) => string | null; // stdout; null when gh is missing, logged out or fails
  isTTY: boolean;
  ask: (question: string) => Promise<string>;
  out: (text: string) => void;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const samePath = (a: string, b: string) => {
  const [x, y] = [resolve(a), resolve(b)];
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};

export async function tagRelease(argv: string[], io: Io): Promise<number> {
  const stop = (text: string) => {
    io.out(`\nStopped: ${text}\n`);
    return 1;
  };
  const ok = (text: string) => io.out(`ok  ${text}\n`);
  const unknown = argv.find((arg) => arg !== "--dry-run");
  if (unknown === "--version") return stop("--version is not an option: the version always comes from package.json.");
  if (unknown) return stop(`Unknown argument ${unknown}. The only option is --dry-run.`);
  const dryRun = argv.includes("--dry-run");

  // 1. git, at the repository's root
  let top: string;
  try {
    top = io.git(["rev-parse", "--show-toplevel"]);
  } catch (error) {
    return stop(`git can't run here, or this folder isn't in a git repository: ${message(error)}`);
  }
  if (!samePath(top, io.cwd)) return stop(`Run this from the repository's root, ${top}, not ${io.cwd}.`);
  ok("git runs, at the repository's root");

  // 2. main
  const branch = io.git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") return stop(`Switch to main first: git switch main (this is ${branch === "HEAD" ? "a detached HEAD" : branch}).`);
  ok("on main");

  // 3. a clean tree
  const changed = io.git(["status", "--porcelain"]);
  if (changed) return stop(`The working tree isn't clean. These files differ from HEAD:\n${changed.split("\n").map((line) => `  ${line}`).join("\n")}`);
  ok("the working tree is clean");

  // 4. the remote
  try {
    io.git(["fetch", "origin", "main", "--tags"]);
  } catch (error) {
    return stop(`git fetch origin main --tags failed, and the checks need GitHub's main: ${message(error)}`);
  }
  ok("fetched origin main and its tags");

  // 5. up to date
  const head = io.git(["rev-parse", "HEAD"]);
  if (head !== io.git(["rev-parse", "origin/main"])) {
    const [ahead, behind] = io.git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).split(/\s+/).map(Number);
    if (ahead > 0) return stop(`main has ${plural(ahead, "commit")} that ${ahead === 1 ? "isn't" : "aren't"} on GitHub; push them through a pull request.${behind > 0 ? ` It is also ${behind} behind origin/main.` : ""}`);
    return stop(`Run git pull first: main is ${plural(behind, "commit")} behind.`);
  }
  ok(`main is origin/main (${head.slice(0, 7)})`);

  // 6. the version and its tag. The tree is clean and HEAD is origin/main, so HEAD's package.json is the file.
  const { version } = JSON.parse(io.git(["show", "HEAD:package.json"])) as { version: string };
  if (!SEMVER.test(String(version))) return stop(`package.json's version (${version}) isn't a version npm can publish.`);
  const tag = `v${version}`;
  // On origin first: before the release pull request is merged and pulled, package.json still has
  // the version released last, whose tag is there (and here, after the fetch).
  if (io.git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`])) {
    return stop(`The tag ${tag} already exists on origin: ${version} is released. To release the next version, merge its release pull request on GitHub and run git pull first; package.json then has the new version.`);
  }
  if (io.git(["tag", "--list", tag])) return stop(`The tag ${tag} exists here but not on origin. If it points to the wrong commit, delete it (git tag -d ${tag}) and run this again.`);
  ok(`version ${version}; ${tag} isn't a tag yet, here or on origin`);

  // 7. the release merge
  const subject = io.git(["log", "-1", "--format=%s", "HEAD"]);
  const parents = io.git(["rev-list", "--parents", "-n", "1", "HEAD"]).split(/\s+/).slice(1);
  const branchName = `release/${tag}`;
  const merged = parents.length === 2 && new RegExp(`^Merge pull request #\\d+ from [^/\\s]+/${escape(branchName)}(\\s|$)`).test(subject);
  const rebased = parents.length === 1 && [`docs: status for ${version}`, `chore: release ${version}`].includes(subject);
  if (!merged && !rebased) {
    const lines = [`HEAD is ${head.slice(0, 7)} ${subject}, not the merge of ${branchName}. Merge the release pull request on GitHub, then run git pull.`];
    const listed = io.gh(["pr", "list", "--head", branchName, "--state", "all", "--json", "number,state,mergedAt"]);
    if (listed !== null) {
      const prs = JSON.parse(listed) as { number: number; state: string; mergedAt: string | null }[];
      lines.push(prs.length
        ? prs.map((pr) => `Pull request #${pr.number} from ${branchName} is ${pr.state.toLowerCase()}${pr.mergedAt ? `, merged ${pr.mergedAt}` : ""}.`).join(" ")
        : `GitHub has no pull request from ${branchName}.`);
    }
    return stop(lines.join("\n"));
  }
  if (merged) ok(`HEAD is the merge of ${branchName}: ${subject}`);
  else {
    const refusal = checkRebase(io, head, branchName);
    if (refusal) return stop(`HEAD is ${head.slice(0, 7)} ${subject}, a single commit, and ${refusal}`);
    ok(`HEAD is the last commit of ${branchName}, rebased onto main: ${subject}`);
  }

  // 8. the release workflow's check
  const check = releaseCheck({
    tag,
    version,
    isOnMain: () => {
      try {
        io.git(["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
        return true;
      } catch {
        return false;
      }
    },
    isShallow: () => io.git(["rev-parse", "--is-shallow-repository"]) !== "false",
  });
  if (!check.ok) return stop(check.error);
  ok(`the release workflow's check (scripts/release-check.ts): dist-tag ${check.distTag}`);

  io.out(`\n  tag      ${tag}\n  commit   ${head} ${subject}\n  version  ${version}\n  npm      staged by the release workflow under the dist-tag ${check.distTag}\n\n`);
  if (dryRun) {
    io.out(`Dry run: every check passed. Without --dry-run this asks you to type ${tag}, then tags ${head.slice(0, 7)} and pushes ${tag} to origin.\n`);
    return 0;
  }

  // 9. confirmation, typed in a terminal
  if (!io.isTTY) return stop("release:tag asks for confirmation and needs a terminal. Nothing was tagged.");
  const typed = (await io.ask(`Type ${tag} to tag and push: `)).trim();
  if (typed !== tag) {
    io.out("Cancelled: nothing was tagged.\n");
    return 1;
  }

  // 10. tag and push
  io.git(["tag", "-a", tag, "-m", tag]);
  try {
    io.git(["push", "origin", tag]);
  } catch (error) {
    let cleaned = `The local tag ${tag} is deleted again, so a retry starts clean.`;
    try {
      io.git(["tag", "-d", tag]);
    } catch (deleteError) {
      cleaned = `Deleting the local tag failed too (${message(deleteError)}): run git tag -d ${tag} before a retry.`;
    }
    return stop(`git push origin ${tag} failed: ${message(error)}\n${cleaned}`);
  }
  io.out(`\nTagged ${head.slice(0, 7)} as ${tag} and pushed it.\n`);

  // 11. the next steps
  io.out(nextSteps(version, check.distTag === "beta", head, io));
  return 0;
}

// A "Rebase and merge": when release/<tag> is still on GitHub, main's last commits must be its
// commits, patch for patch. Returns why not, or null.
function checkRebase(io: Io, head: string, branchName: string): string | null {
  if (!io.git(["ls-remote", "--heads", "origin", branchName])) return null; // deleted after the merge: nothing left to compare
  try {
    io.git(["fetch", "origin", branchName]);
  } catch (error) {
    return `${branchName} couldn't be fetched to compare: ${message(error)}`;
  }
  const lines = (text: string) => text.split("\n").filter(Boolean);
  const theirs = lines(io.git(["rev-list", "--reverse", `HEAD..origin/${branchName}`]));
  if (!theirs.length) return null; // every commit of the branch is on main as it is
  const ours = lines(io.git(["rev-list", "--reverse", "-n", String(theirs.length), head]));
  const patchId = (commit: string) => io.git(["patch-id", "--stable"], io.git(["show", commit])).split(/\s+/)[0];
  if (ours.length !== theirs.length || ours.some((commit, k) => patchId(commit) !== patchId(theirs[k]))) {
    return `main's last ${plural(theirs.length, "commit")} ${theirs.length === 1 ? "isn't" : "aren't"} ${branchName}'s on GitHub, patch for patch. Tag by hand only after checking (docs/release.md, section 3).`;
  }
  return null;
}

function nextSteps(version: string, prerelease: boolean, head: string, io: Io): string {
  const tag = `v${version}`;
  const listed = io.gh(["run", "list", "--workflow", "release.yml", "--limit", "1", "--json", "databaseId,headSha,url"]);
  const run = listed === null ? undefined : (JSON.parse(listed) as { databaseId: number; headSha: string; url: string }[]).find((r) => r.headSha === head);
  const id = run ? String(run.databaseId) : "$run";
  const notes = `.scratch/release-notes-${version}.md`;
  const notesThere = (() => {
    try {
      return io.git(["ls-files", "--others", "--ignored", "--exclude-standard", "--", notes]) !== "";
    } catch {
      return false;
    }
  })();
  const steps = [
    "",
    "Next (docs/release.md, section 3, steps 4 to 10):",
    run
      ? ` 4. The release workflow runs on ${tag}: ${run.url}\n    Wait for both jobs: gh run watch ${id}`
      : ` 4. The release workflow starts on ${tag}. Its run: gh run list --workflow release.yml --limit 1`,
    " 5. Approve the staged version, in a terminal logged in to npm with 2FA:",
    "      npx -y npm@11.21.0 stage list repomagpie",
    `      npx -y npm@11.21.0 stage approve <the stage id that list shows for ${version}>`,
    "    If approve fails with E409, npm's automated review is still running (stage list shows validating).",
    "    Wait until stage list shows another status, then approve again.",
    "    Right after a publish, npm's cache can still answer with the old version, so the commands below",
    "    ask the registry with --prefer-online.",
    ` 6. npm view repomagpie@${version} version dist.tarball --prefer-online`,
    prerelease
      ? `    Until the first stable version, move latest too: npm dist-tag add repomagpie@${version} latest\n    then npm view repomagpie dist-tags --prefer-online shows beta and latest on ${version}.`
      : "    A stable version is staged under latest: npm view repomagpie dist-tags --prefer-online shows it.",
    " 7. Check that the released tarball is the one the run packed: npm fetches it into .scratch/ (git-ignored).",
    "    From the repository's folder, copy these lines as they are. PowerShell:",
    ...(run ? [] : ['      $run = gh run list --workflow release.yml --limit 1 --json databaseId --jq ".[0].databaseId"']),
    `      npm pack repomagpie@${version} --prefer-online --pack-destination .scratch`,
    `      $h = (Get-FileHash .\\.scratch\\repomagpie-${version}.tgz -Algorithm SHA256).Hash.Substring(0,8).ToLower()`,
    `      gh run view ${id} --log | Select-String $h`,
    "    bash or zsh:",
    ...(run ? [] : ["      run=$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"]),
    `      npm pack repomagpie@${version} --prefer-online --pack-destination .scratch`,
    `      h=$(shasum -a 256 .scratch/repomagpie-${version}.tgz | cut -c1-8)`,
    `      gh run view ${run ? id : "$run"} --log | grep $h`,
    "    $h is the first 8 characters of the tarball's SHA-256; a line printed is the run's log naming it.",
    ` 8. The version's page on npmjs.com shows "Built and signed on GitHub Actions" for this run.`,
    ` 9. gh release create ${tag}${prerelease ? " --prerelease" : ""} --title "${version}" --notes-file ${notes}`,
    ...(notesThere ? [] : [`    ${notes} isn't there yet: draft the release notes first.`]),
    `10. npm install -g repomagpie@${version}`,
    "    repomagpie --version",
    "    repomagpie setup --yes",
    "    repomagpie doctor",
    "",
  ];
  return steps.join("\n");
}

const realIo = (): Io => {
  const run = (command: string, args: string[], input?: string) => execFileSync(command, args, { cwd: process.cwd(), encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }).trimEnd();
  return {
    cwd: process.cwd(),
    git: (args, input) => {
      try {
        return run("git", args, input);
      } catch (error) {
        const stderr = String((error as { stderr?: string }).stderr ?? "").trim().split(/\r?\n/)[0];
        throw new Error(stderr || ((error as { code?: string }).code === "ENOENT" ? "git isn't on PATH" : message(error)));
      }
    },
    gh: (args) => {
      try {
        return run("gh", args);
      } catch {
        return null;
      }
    },
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    ask: async (question) => {
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await prompt.question(question);
      } finally {
        prompt.close();
      }
    },
    out: (text) => { process.stdout.write(text); },
  };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // npm run release:tag --dry-run (without --) gives npm the flag, not this script: honour it here too.
  const argv = process.argv.slice(2);
  if (process.env.npm_config_dry_run === "true" && !argv.includes("--dry-run")) argv.push("--dry-run");
  process.exitCode = await tagRelease(argv, realIo());
}
