// Writing other tools' files for repomagpie setup (decision 0035, "Safety"): never through a link,
// never outside the folder setup may write in (the home folder, or the project with --project), a
// backup first, and a write that is whole or not at all. Never prints.
import { existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

export function writeAtomically(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.repomagpie-${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text, { flag: "wx" });
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
