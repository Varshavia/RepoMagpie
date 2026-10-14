// Writing other tools' files for repomagpie setup (decision 0035, "Safety"): never through a link,
// never outside the folder setup may write in (the home folder, or the project with --project), a
// backup first, and a write that is whole or not at all. Never prints.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

// Why `path` can't be written: a link on its way down from `root` (decision 0032, rule 5), the path
// itself a link unless `linkAllowed`, or a place outside `root`. null when it can.
export function pathProblem(path: string, root: string, linkAllowed = false): string | null {
  const inside = relative(resolve(root), resolve(path));
  if (!inside || inside.startsWith("..") || resolve(inside) === inside) return `${path} is outside ${root}; setup writes only inside it.`;
  const parts = inside.split(sep);
  let current = resolve(root);
  for (const [i, part] of parts.entries()) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink() && !(linkAllowed && i === parts.length - 1)) return `${current} is a link; setup never writes through one.`;
    } catch {
      break; // doesn't exist yet: nothing below it does either
    }
  }
  return null;
}

// ~/.claude.json grows with Claude Code's history, to a few MB; a file over this isn't a config file,
// and reading it whole would only cost time and memory.
export const CONFIG_LIMIT = 64 * 1024 * 1024;

// A config file's text, or why it can't be read; null when it doesn't exist. A file over the limit is
// refused unread.
export function readConfig(file: string): { text: string | null } | { error: string } {
  try {
    if (!existsSync(file)) return { text: null };
    if (statSync(file).size > CONFIG_LIMIT) return { error: `${file} is larger than ${CONFIG_LIMIT / 1024 / 1024} MB, so it isn't read` };
    return { text: readFileSync(file, "utf8") };
  } catch (error) {
    return { error: `${file} can't be read: ${(error as Error).message}` };
  }
}

// The whole file or nothing: written beside it, then renamed over it. The file keeps its permissions
// (a config that holds another server's token is often private to its owner).
export function writeAtomically(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.repomagpie-${process.pid}.tmp`;
  const mode = existsSync(file) ? statSync(file).mode & 0o777 : undefined;
  try {
    writeFileSync(temporary, text, { flag: "wx", mode: mode ?? 0o666 });
    if (mode !== undefined) chmodSync(temporary, mode); // the umask may have narrowed it
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

// `<path>.repomagpie-backup-<stamp>`, or with -2, -3… when that exists.
export function backupName(path: string, stamp: string): string {
  let name = `${path}.repomagpie-backup-${stamp}`;
  for (let n = 2; existsSync(name); n++) name = `${path}.repomagpie-backup-${stamp}-${n}`;
  return name;
}
