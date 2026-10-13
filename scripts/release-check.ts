// node scripts/release-check.ts <tag>: the release workflow's checks before anything is staged
// (decision 0033). The tag must be "v" plus package.json's version, and its commit must be on main's
// history (release tags are created on main only, decision 0012). Prints the npm dist-tag: "beta"
// for a prerelease (a version with "-"), "latest" otherwise; in GitHub Actions it is also written to
// the step's outputs as dist-tag. Exits 1 with the reason otherwise. The workflow runs it; locally
// it needs origin/main fetched.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export type Check = { ok: true; distTag: "beta" | "latest" } | { ok: false; error: string };

export function releaseCheck(options: { tag: string; version: string; isOnMain: () => boolean }): Check {
  const { tag, version } = options;
  if (!SEMVER.test(version)) return { ok: false, error: `package.json's version (${version}) isn't a version npm can publish.` };
  if (tag !== `v${version}`) return { ok: false, error: `The tag ${tag || "(none)"} doesn't match the version in package.json (${version}): it must be v${version}.` };
  if (!options.isOnMain()) return { ok: false, error: `The tag ${tag} points to a commit that isn't on main's history. Release tags are created on main only (decision 0012).` };
  return { ok: true, distTag: version.includes("-") ? "beta" : "latest" };
}

const main = () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tag = process.argv[2] ?? "";
  const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
  // `git merge-base --is-ancestor` exits 0 when HEAD (the tagged commit) is on origin/main's history.
  const isOnMain = () => {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { cwd: root, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  const check = releaseCheck({ tag, version, isOnMain });
  if (!check.ok) {
    console.error(check.error);
    process.exitCode = 1;
    return;
  }
  console.log(`${tag}: version ${version}, on main's history, dist-tag ${check.distTag}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `dist-tag=${check.distTag}\n`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
