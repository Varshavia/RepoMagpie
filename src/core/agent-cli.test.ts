import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./agent-cli.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import type { Platform } from "./agents.ts";

// An agent's CLI gets exactly the arguments setup means, also through a Windows .cmd shim, where
// cmd.exe would otherwise read &, |, %, ^, quotes and spaces itself (decision 0035).

const platform = process.platform as Platform;
const RECORDER = fileURLToPath(new URL("./fixtures/record-argv.ts", import.meta.url));

// A fake CLI as npm installs one: a .cmd shim on Windows, a shell script elsewhere; in a folder
// whose name has a space, as "Program Files" does.
function fakeCli(name: string) {
  const root = scratchBase("agent-cli");
  const folder = join(root, "with space");
  const record = join(root, "record.jsonl");
  mkdirSync(folder);
  let file: string;
  if (platform === "win32") {
    file = join(folder, `${name}.cmd`);
    writeFileSync(file, `@"${process.execPath}" "${RECORDER}" %*\r\n`);
  } else {
    file = join(folder, name);
    writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${RECORDER}" "$@"\n`);
    chmodSync(file, 0o755);
  }
  const received = () => readFileSync(record, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
  return { file, env: { ...process.env, RECORD_FILE: record }, received };
}

const HARD = [
  "plain",
  "with space",
  'a "quoted" word',
  "C:\\Program Files\\nodejs\\node.exe",
  "trailing\\",
  "50% & | < > ^ ! ( ) ; , ` *?",
  "%PATH%",
  "--disallow-code-generation-from-strings",
  JSON.stringify({ name: "repomagpie", command: "C:\\n\\node.exe", args: ["--x", "a b", "mcp"] }),
  "ünïcödé ✓",
  "",
];

test("every argument arrives exactly as given, through the platform's shim", () => {
  const cli = fakeCli("agent");
  const result = runCli(cli.file, HARD, { env: cli.env, platform });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(cli.received(), [HARD]);
});

test("only an absolute program is run: a bare name, which Windows would look up in the current folder first, is refused", () => {
  const cli = fakeCli("agent");
  for (const name of ["agent", "agent.cmd", join("relative", "agent.cmd")]) {
    const result = runCli(name, ["x"], { env: cli.env, platform });
    assert.equal(result.status, -1, name);
    assert.match(result.stderr, /isn't an absolute path/);
  }
});

test("the CLI runs in the folder given (setup gives the home folder), never the one setup was started from", () => {
  const cli = fakeCli("agent");
  const home = join(scratchBase("agent-cli"), "home");
  mkdirSync(home);
  runCli(cli.file, [], { env: { ...cli.env, RECORD_CWD: "1" }, platform, cwd: home });
  assert.deepEqual(cli.received(), [home]);
});

test("Windows: cmd.exe comes from ComSpec when absolute, else from SystemRoot: a cmd.exe in the working folder never runs", { skip: platform !== "win32" && "Windows only" }, () => {
  const cli = fakeCli("agent");
  const cloned = join(scratchBase("agent-cli"), "cloned-repo");
  mkdirSync(cloned);
  // A program that isn't cmd.exe, under that name, where a bare lookup would find it first.
  copyFileSync(join(process.env.SystemRoot as string, "System32", "whoami.exe"), join(cloned, "cmd.exe"));
  // Node looks in the current folder unless this process has NoDefaultCurrentDirectoryInExePath
  // (some terminals set it): without it, as on most machines, a bare "cmd.exe" here runs whoami.
  const saved = process.env.NoDefaultCurrentDirectoryInExePath;
  delete process.env.NoDefaultCurrentDirectoryInExePath;
  try {
    for (const ComSpec of ["cmd.exe", undefined]) {
      const result = runCli(cli.file, ["ok"], { env: { ...cli.env, ComSpec }, platform, cwd: cloned });
      assert.equal(result.status, 0, result.stderr);
    }
  } finally {
    if (saved !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = saved;
  }
  assert.deepEqual(cli.received(), [["ok"], ["ok"]]);
});

test("a missing program is a failure with a message, not a throw", () => {
  const result = runCli(join(scratchBase("agent-cli"), platform === "win32" ? "nope.cmd" : "nope"), ["x"], { env: process.env, platform });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.length > 0);
});
