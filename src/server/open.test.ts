import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, posix, win32 } from "node:path";
import { openCommand, openExternal } from "./open.ts";
import { scratchBase } from "../core/fixtures/scratch.ts";

// On Windows, cmd expands % even inside quotes, and a " would end the quoted target, so such a target
// is refused before anything runs. (Elsewhere the call would start xdg-open or open, so it isn't run.)
test("on Windows, a target with \" or % is refused before cmd runs", { skip: process.platform !== "win32" && "Windows only" }, async () => {
  for (const target of ["C:\\notes\\%COMSPEC%.md", "C:\\notes\\a\".md", "C:\\notes\\a\r\n.md"]) {
    await assert.rejects(openExternal(target), /can't pass on safely/, JSON.stringify(target));
  }
});

test("every platform's program is an absolute path, and only a web address or an absolute path is opened", () => {
  const url = "http://127.0.0.1:4321/?token=x";
  const windows = openCommand(url, "win32", { ComSpec: "cmd.exe", SystemRoot: "C:\\Windows" });
  assert.equal(windows.command, "C:\\Windows\\System32\\cmd.exe");
  assert.equal(openCommand(url, "win32", { ComSpec: "D:\\Tools\\cmd.exe" }).command, "D:\\Tools\\cmd.exe");
  assert.equal(openCommand("/Users/me/.magpie/notes/a.md", "darwin", {}).command, "/usr/bin/open");
  for (const [platform, target] of [["win32", "notes\\a.md"], ["win32", "a.md"], ["darwin", "notes/a.md"], ["linux", "a.md"]] as const) {
    assert.throws(() => openCommand(target, platform, {}), /only a web address or an absolute path/, `${platform} ${target}`);
  }
  assert.ok(win32.isAbsolute(windows.command));
});

test("Linux: xdg-open only from an absolute PATH folder; a relative one is never searched", { skip: process.platform === "win32" && "POSIX file modes" }, () => {
  const root = scratchBase("open");
  const absolute = join(root, "bin");
  mkdirSync(absolute);
  writeFileSync(join(absolute, "xdg-open"), "#!/bin/sh\n");
  chmodSync(join(absolute, "xdg-open"), 0o755);
  assert.equal(openCommand("http://127.0.0.1:1/", "linux", { PATH: `bin:.:${absolute}` }).command, join(absolute, "xdg-open"));
  assert.ok(posix.isAbsolute(join(absolute, "xdg-open")));
  assert.throws(() => openCommand("http://127.0.0.1:1/", "linux", { PATH: "bin:." }), /xdg-open isn't in a folder on PATH/);
});

// A cloned repository with a cmd.exe in it, and `repomagpie ui` started there. Node looks in the
// current folder unless this process has NoDefaultCurrentDirectoryInExePath (some terminals set it),
// so it is cleared here, as on most machines.
test("Windows: a cmd.exe planted in the current folder never runs; the bare name would run it", { skip: process.platform !== "win32" && "Windows only" }, () => {
  const cloned = join(scratchBase("open"), "cloned-repo");
  mkdirSync(cloned);
  copyFileSync(join(process.env.SystemRoot as string, "System32", "whoami.exe"), join(cloned, "cmd.exe"));
  const saved = process.env.NoDefaultCurrentDirectoryInExePath;
  delete process.env.NoDefaultCurrentDirectoryInExePath;
  try {
    const echo = (command: string) => spawnSync(command, ["/d", "/c", "echo real cmd"], { cwd: cloned, encoding: "utf8", windowsHide: true }).stdout.trim();
    // The plant works: the bare name, as open.ts used to start it, runs whoami instead.
    assert.notEqual(echo("cmd"), "real cmd");
    for (const ComSpec of ["cmd.exe", undefined, process.env.ComSpec]) {
      assert.equal(echo(openCommand("http://127.0.0.1:1/", "win32", { ...process.env, ComSpec }).command), "real cmd", String(ComSpec));
    }
  } finally {
    if (saved !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = saved;
  }
});
