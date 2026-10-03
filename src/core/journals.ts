// Where the journals are: spec section 3, decision 0016.
// Reads the file system; never prints. Home, environment and working directory are passed in.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export type Env = Record<string, string | undefined>;

export interface PersonalJournal {
  path: string;
  source: "flag" | "env" | "config" | "default";
  warnings: string[];
}

// The config file never moves, even when MAGPIE_HOME points elsewhere.
export function configPath(home: string): string {
  return join(home, ".magpie", "config.yaml");
}

// --home > MAGPIE_HOME > personal_journal in the config file > <home>/.magpie
export function resolvePersonalJournal(options: { home: string; env: Env; cwd: string; flag?: string }): PersonalJournal {
  const { home, env, cwd, flag } = options;
  if (flag) return { path: resolve(cwd, flag), source: "flag", warnings: [] };
  if (env.MAGPIE_HOME) return { path: resolve(cwd, env.MAGPIE_HOME), source: "env", warnings: [] };

  const fallback = { path: join(home, ".magpie"), source: "default" as const };
  const file = configPath(home);
  if (!existsSync(file)) return { ...fallback, warnings: [] };

  let config: unknown;
  try {
    config = parseYaml(readFileSync(file, "utf8"));
  } catch (error) {
    return { ...fallback, warnings: [`Ignoring ${file}: ${(error as Error).message.split("\n")[0]}`] };
  }
  const value = (config as { personal_journal?: unknown } | null)?.personal_journal;
  if (value === undefined || value === null || value === "") return { ...fallback, warnings: [] };
  if (typeof value !== "string") return { ...fallback, warnings: [`Ignoring personal_journal in ${file}: it must be a path`] };

  // "~" means the home directory; any other relative path is relative to the config file's folder.
  const expanded = value === "~" || /^~[\\/]/.test(value) ? join(home, value.slice(1)) : value;
  return { path: resolve(dirname(file), expanded), source: "config", warnings: [] };
}

// --project, or the first .magpie/ folder walking up from the working directory.
// --project names the project root, like git -C; a path to the .magpie folder itself also works.
// The walk stops at the git root (a folder containing .git) or the filesystem root,
// and never takes the personal journal's folder.
export function findProjectJournal(options: { cwd: string; personalJournal: string; flag?: string }): string | null {
  const { cwd, personalJournal, flag } = options;
  if (flag) {
    const path = resolve(cwd, flag);
    return basename(path) === ".magpie" ? path : join(path, ".magpie");
  }
  const personal = comparable(personalJournal);
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const candidate = join(dir, ".magpie");
    if (isDirectory(candidate) && comparable(candidate) !== personal) return candidate;
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return null;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Paths compare case-insensitively on Windows.
function comparable(path: string): string {
  const full = resolve(path);
  return process.platform === "win32" ? full.toLowerCase() : full;
}
