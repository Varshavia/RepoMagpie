// node scripts/release-check.ts <tag>: the release workflow's checks before anything is staged
// (decision 0033). The tag must be "v" plus package.json's version, and its commit must be on main's
// history (release tags are created on main only, decision 0012), and server.json's two versions
// (the MCP Registry's listing, docs/release.md) and .claude-plugin/plugin.json's version (decision
// 0063) must be that version too. Prints the npm dist-tag: "beta"
// for a prerelease (a version with "-"), "latest" otherwise; in GitHub Actions it is also written to
// the step's outputs as dist-tag. Exits 1 with the reason otherwise. The workflow runs it; locally
// it needs origin/main fetched.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export type Check = { ok: true; distTag: "beta" | "latest" } | { ok: false; error: string };

// server.json's versions: its own, then each package's. Anything else in their place is listed as is.
export function serverVersions(server: unknown): unknown[] {
  const s = (server ?? {}) as { version?: unknown; packages?: unknown };
  const packages = Array.isArray(s.packages) ? s.packages : [];
  return [s.version, ...packages.map((p) => (p as { version?: unknown } | null)?.version)];
}

// The Claude Code plugin's manifest, in the repository and in the package (decision 0063).
export const PLUGIN_MANIFEST = ".claude-plugin/plugin.json";

// `server` and `plugin`: server.json and the plugin's manifest as parsed; undefined when missing or not JSON.
export function releaseCheck(options: { tag: string; version: string; server: unknown; plugin: unknown; isOnMain: () => boolean; isShallow?: () => boolean }): Check {
  const { tag, version } = options;
  if (!SEMVER.test(version)) return { ok: false, error: `package.json's version (${version}) isn't a version npm can publish.` };
  if (tag !== `v${version}`) return { ok: false, error: `The tag ${tag || "(none)"} doesn't match the version in package.json (${version}): it must be v${version}.` };
  const listed = serverVersions(options.server);
  if (listed.length < 2 || listed.some((v) => v !== version)) {
    return { ok: false, error: `server.json's versions (${listed.map((v) => String(v)).join(", ")}) must be package.json's version (${version}): set its version and its npm package's version to ${version}. The MCP Registry lists the version server.json names.` };
  }
  // Claude Code keeps an installed plugin at the version its manifest names, so a stale one is never updated.
  const plugin = (options.plugin as { version?: unknown } | null | undefined)?.version;
  if (plugin !== version) {
    return { ok: false, error: `${PLUGIN_MANIFEST}'s version (${String(plugin)}) must be package.json's version (${version}): set it to ${version}. Claude Code updates an installed plugin only when that version changes.` };
  }
  // In a shallow clone merge-base can't see the history, and would refuse a good tag or worse.
  if (options.isShallow?.()) return { ok: false, error: "The checkout is shallow, so main's history can't be checked. Check out with fetch-depth: 0." };
  if (!options.isOnMain()) return { ok: false, error: `The tag ${tag} points to a commit that isn't on main's history. Release tags are created on main only (decision 0012).` };
  return { ok: true, distTag: version.includes("-") ? "beta" : "latest" };
}

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};

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
  const isShallow = () => execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, encoding: "utf8" }).trim() !== "false";
  const check = releaseCheck({ tag, version, server: readJson(resolve(root, "server.json")), plugin: readJson(resolve(root, PLUGIN_MANIFEST)), isOnMain, isShallow });
  if (!check.ok) {
    console.error(check.error);
    process.exitCode = 1;
    return;
  }
  console.log(`${tag}: version ${version}, on main's history, dist-tag ${check.distTag}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `dist-tag=${check.distTag}\n`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
