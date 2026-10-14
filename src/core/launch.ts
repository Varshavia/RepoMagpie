// How agents start repomagpie mcp (decision 0035, "How agents launch RepoMagpie"): the absolute
// node and the absolute entry file of the installed CLI, never a name looked up on PATH and never an
// npx cache. Node runs with code generation from strings disallowed (decision 0034): the server
// needs none, so it can't run any either.
import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import { onPath, type Platform } from "./agents.ts";
import type { Env } from "./journals.ts";

export const NO_CODEGEN = "--disallow-code-generation-from-strings";

export interface LaunchRequest {
  execPath: string; // the node running setup
  entry: string; // the CLI's entry file running setup
  env: Env;
  platform: Platform;
  tmp: string; // the OS temp folder
  allowWrite: boolean;
  home?: string; // the personal journal, when it was chosen by --home or MAGPIE_HOME: the agent won't have either
}

export type Launch = { command: string; args: string[] } | { error: string };

const INSTALL = "Install RepoMagpie first with npm install -g repomagpie, then run repomagpie setup from it.";

export function launchCommand(r: LaunchRequest): Launch {
  const passing = temporary(r.entry, r.tmp) ?? temporary(r.execPath, r.tmp);
  if (passing) return { error: `This copy of RepoMagpie runs from ${passing}, which can disappear, so an agent's entry would break. ${INSTALL}` };
  // The node on PATH, as written, when it is the same program: /opt/homebrew/bin/node keeps working
  // after an upgrade; the versioned folder it resolves to doesn't.
  const real = realOf(r.execPath);
  const named = onPath("node", { home: "", env: r.env, platform: r.platform }).find((candidate) => realOf(candidate) === real && !temporary(candidate, r.tmp));
  const args = [NO_CODEGEN, r.entry, "mcp", ...(r.allowWrite ? ["--allow-write"] : []), ...(r.home ? ["--home", r.home] : [])];
  return { command: named ?? r.execPath, args };
}

// Why a path is temporary, or null: npx's cache, the OS temp folder, or fnm's per-shell folders.
function temporary(path: string, tmp: string): string | null {
  const parts = path.split(/[\\/]+/);
  if (parts.includes("_npx")) return "npx's cache";
  if (parts.includes("fnm_multishells")) return "a version manager's per-shell folder";
  const inside = relative(tmp, path);
  if (inside && !inside.startsWith("..") && !inside.includes(`:${sep}`) && !/^[A-Za-z]:/.test(inside)) return "the temp folder";
  return null;
}

const realOf = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
