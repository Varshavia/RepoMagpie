// fs.cpSync(from, to, { recursive: true }) in plain JS. Node's cpSync passes a path with letters
// outside ASCII to Windows in the wrong code page: copying to `C:\Users\Şuat\…` wrote the files
// under a mangled `Åuat…` folder beside it, and copying from such a path killed the process
// (exit 0xC0000409). Seen on Node 22.23.3 and 24.13.0, not on 24.22.0 or 26.12.0 (Windows, code
// page 1254, 2026-10-21). Upstream: https://github.com/nodejs/node/issues/61878, fixed by
// https://github.com/nodejs/node/pull/61950 in 24.15.0 and 25.9.0, with no 22.x backport found;
// the tracking issue is https://github.com/nodejs/node/issues/58768. CI's Node 24 and 26 jobs run
// fixed releases, so only its Node 22 job would catch a return to cpSync. The same steps as Node 22's
// lib/internal/fs/cp/cp-sync.js, for what setup copies: a folder is made (its parents too) and
// given the source's mode after its contents; a file is copied and given the source's mode, an
// existing one replaced, or with errorOnExist refused (cpSync's ERR_FS_CP_EEXIST); a link is copied
// as a link, a relative target resolved against the source's folder; anything else, and a copy
// into its own source, throw. No filter, no timestamps, no dereference: setup uses none.
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export function copyFolder(from: string, to: string, options: { errorOnExist?: boolean } = {}): void {
  const inside = relative(resolve(from), resolve(to));
  if (!inside || (!inside.startsWith("..") && !isAbsolute(inside))) throw new Error(`can't copy ${from} into itself (${to})`);
  mkdirSync(dirname(to), { recursive: true });
  copyEntry(from, to, options.errorOnExist ?? false);
}

function copyEntry(from: string, to: string, errorOnExist: boolean): void {
  const source = lstatSync(from);
  const there = lstatSync(to, { throwIfNoEntry: false });
  if (source.isDirectory()) {
    if (there && !there.isDirectory()) throw new Error(`can't copy the folder ${from} over ${to}, which isn't a folder`);
    if (!there) mkdirSync(to);
    for (const name of readdirSync(from)) copyEntry(join(from, name), join(to, name), errorOnExist);
    if (!there) chmodSync(to, source.mode);
  } else if (source.isFile()) {
    if (there && errorOnExist) throw Object.assign(new Error(`${to} already exists`), { code: "EEXIST" });
    if (there) unlinkSync(to);
    copyFileSync(from, to);
    chmodSync(to, source.mode);
  } else if (source.isSymbolicLink()) {
    const target = readlinkSync(from);
    if (there) removeLink(to);
    symlinkSync(isAbsolute(target) ? target : resolve(dirname(from), target), to);
  } else throw new Error(`can't copy ${from}: it isn't a file, a folder or a link`);
}

// fs.rmSync(path, { recursive: true, force: true }) in plain JS, for a file, a link or a folder. On
// Windows, Node 23.x, 24.0 to 24.13.0 and 25.0 return from rmSync without an error and remove
// nothing when the path has letters outside ASCII; rmdirSync({ recursive }) is the same call. Seen
// on 23.11.1, 24.0.2, 24.13.0 and 25.0.0; not on 22.12.0, 22.23.4, 24.13.1, 24.14.x, 24.22.1,
// 25.4.0, 25.9.0 or 26.12.1 (Windows, code page 1254, tested 2026-10-23). Upstream:
// https://github.com/nodejs/node/issues/65578; https://github.com/nodejs/node/issues/58759 is its
// crash form. CI's Node 22, 24 and 26 run releases without it, so only a test run on an affected
// Node catches a return to rmSync. unlinkSync and rmdirSync were right on every one of them. A link
// (a junction too) is removed as a link, never followed; a folder is emptied, then removed; a
// missing path is nothing to do. While another process holds an entry (a virus scan), each step is
// tried again, as rmSync's maxRetries: 5, retryDelay: 50 did. Afterwards the path must be gone, or
// it throws.
export function removeFolder(path: string): void {
  removeEntry(path);
  if (lstatSync(path, { throwIfNoEntry: false })) throw new Error(`${path} is still there after removing it.`);
}

function removeEntry(path: string): void {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry) return;
  if (entry.isSymbolicLink()) retried(() => removeLink(path));
  else if (entry.isDirectory()) {
    for (const name of readdirSync(path)) removeEntry(join(path, name));
    retried(() => rmdirSync(path));
  } else retried(() => unlinkSync(path));
}

const HELD = new Set(["EBUSY", "EPERM", "ENOTEMPTY", "EMFILE", "ENFILE"]);

function retried(step: () => void): void {
  for (let attempt = 1; ; attempt++) {
    try {
      return step();
    } catch (error) {
      if (!HELD.has((error as NodeJS.ErrnoException).code ?? "") || attempt > 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * attempt); // a synchronous pause
    }
  }
}

// An existing link in the copy's place, without following it (a Windows junction needs rmdir).
function removeLink(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    rmdirSync(path);
  }
}
