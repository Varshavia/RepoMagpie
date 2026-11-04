// Which repository the project journal belongs to, and whether its shared notes are committed and
// pushed, for the app's Project view (docs/ui.md §7). Read from local git only: `git config` for the
// remotes, `git status` and `git rev-list` for .magpie/. No fetch, nothing over the network, no shell.
// Only `repomagpie ui` calls it, when the Project view opens; recall and the hooks never do.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { onPath } from "./agent-cli.ts";
import type { Platform } from "./agents.ts";
import { gitRoot, type Place } from "./journals.ts";
import { locateJournal } from "./save.ts";
import { clean } from "./text.ts";

export interface Repository {
  name: string; // owner/repo from the remote, or the folder's name without one
  host: string | null; // github.com, gitlab.com, …; null without a remote
  url: string | null; // the repository's web page, https only; null when the host isn't a known web host
}

export interface ProjectInfoJson {
  repository: Repository | null; // null outside a git repository, or when git can't be run
  sharing: string | null; // one line on whether .magpie/ is committed and pushed; null when unknown
}

const WEB_HOSTS = new Set(["github.com", "gitlab.com", "bitbucket.org"]);
const GIT_TIMEOUT = 1_500;

// A remote URL as owner/repo and host, never its credentials: `https://user:token@host/…` keeps only
// the host and the path. https://, http://, ssh://, git:// and scp-like `git@host:owner/repo`, with
// or without `.git`. A local path or file:// has no host: null, as for no remote.
export function parseRemote(remote: string): Repository | null {
  const text = remote.trim();
  let scheme: string;
  let host: string;
  let path: string;
  const scp = /^(?:[^@/\s]+@)?([^:/\\\s]+):(.+)$/.exec(text);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    scheme = url.protocol.replace(/:$/, "").toLowerCase();
    if (scheme === "file") return null;
    host = url.hostname.toLowerCase();
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return null;
    }
  } else if (scp && scp[1].length > 1) { // C:\… is a Windows path, not host C
    scheme = "ssh";
    host = scp[1].toLowerCase();
    path = scp[2];
  } else {
    return null;
  }
  const name = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!host || !name) return null;
  const safe = /^[a-z0-9.-]+$/.test(host) && /^[\w.-]+(\/[\w.-]+)+$/.test(name);
  const web = safe && (WEB_HOSTS.has(host) || scheme === "https") ? `https://${host}/${name}` : null;
  return { name: clean(name), host: clean(host), url: web };
}

// `git config --get-regexp ^remote\..*\.url$` lines, `remote.<name>.url <url>`: origin's, else the first.
export function chooseRemote(config: string): string | null {
  const remotes = config.split(/\r?\n/).map((line) => /^remote\.(.+)\.url\s+(.+)$/.exec(line)).filter((m): m is RegExpExecArray => m !== null);
  return (remotes.find((m) => m[1] === "origin") ?? remotes[0])?.[2] ?? null;
}

// The files `git status --porcelain=v1 -z` names: a rename or copy is followed by its old path, which
// isn't a second file. Ignored files aren't listed without --ignored.
export function countChanged(porcelain: string): number {
  const fields = porcelain.split("\0").filter(Boolean);
  let count = 0;
  for (let i = 0; i < fields.length; i++) {
    count++;
    if (/^[RC]/.test(fields[i]) || /^.[RC]/.test(fields[i])) i++;
  }
  return count;
}

// The status line from the two counts: uncommitted files first; then commits not pushed, when there
// is an upstream to compare with (ahead is null without one).
export function sharingLine(changed: number, ahead: number | null): string {
  if (changed) return `${changed} shared note ${changed === 1 ? "file isn't" : "files aren't"} committed yet, so your team can't see them.`;
  if (ahead) return "Committed, not pushed yet.";
  return "Shared notes are committed.";
}

type Git = (args: string[]) => Promise<string | null>;

// git by the absolute path PATH gives (never a bare name: Windows looks in the current folder first),
// in the repository's root, never looking above it (a journal in .scratch/ must not read the
// repository around it), with no prompt, no optional locks and a short timeout. null on any failure.
function gitIn(root: string, place: Place): Git | null {
  const env = place.env as NodeJS.ProcessEnv;
  const git = onPath("git", { home: place.home, env: place.env, platform: process.platform as Platform }).find((file) => !/\.(cmd|bat)$/i.test(file));
  if (!git) return null;
  const childEnv = { ...env, GIT_CEILING_DIRECTORIES: dirname(root), GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
  return (args) => new Promise((done) => {
    execFile(git, args, { cwd: root, env: childEnv, timeout: GIT_TIMEOUT, windowsHide: true, maxBuffer: 1 << 20 }, (error, stdout) => done(error ? null : stdout));
  });
}

export async function projectInfo(place: Place, git?: Git): Promise<ProjectInfoJson> {
  const none: ProjectInfoJson = { repository: null, sharing: null };
  const journal = locateJournal("project", place);
  // The journal's repository (with --project, not the working folder's).
  const root = gitRoot(journal.error ? place.cwd : dirname(journal.path), place.home);
  if (!root) return none;
  const run = git ?? gitIn(root, place);
  if (!run) return none;
  const inside = !journal.error && existsSync(journal.path) && !relative(root, journal.path).startsWith("..");
  const pathspec = inside ? relative(root, journal.path).split(sep).join("/") || "." : null;
  const [config, status, ahead] = await Promise.all([
    run(["config", "--get-regexp", "^remote\\..*\\.url$"]),
    pathspec ? run(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", pathspec]) : Promise.resolve(null),
    pathspec ? run(["rev-list", "--count", "@{upstream}..HEAD", "--", pathspec]) : Promise.resolve(null),
  ]);
  // `git config --get-regexp` exits 1 when there is no remote: that is "no remote", not a failure.
  // Telling them apart costs a call, so the repository's own check answers whether git works here.
  const works = config !== null || status !== null || (await run(["rev-parse", "--git-dir"])) !== null;
  if (!works) return none;
  const remote = config === null ? null : chooseRemote(config);
  const parsed = remote === null ? null : parseRemote(remote);
  const repository = parsed ?? { name: clean(basename(resolve(root))), host: null, url: null };
  const count = ahead === null ? null : Number.parseInt(ahead.trim(), 10);
  return { repository, sharing: status === null ? null : sharingLine(countChanged(status), Number.isNaN(count) ? null : count) };
}
