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

// An existing link in the copy's place, without following it (a Windows junction needs rmdir).
function removeLink(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    rmdirSync(path);
  }
}
