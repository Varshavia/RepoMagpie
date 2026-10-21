import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "./agents.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import { hookLaunch, hookShell, LAUNCHER, launcherText, parseHookCommand, readLauncher, type HookShell, type HookSub } from "./hook-launch.ts";

// The command each agent's hook entry runs (decision 0036): node started directly only when it and
// the entry file exist, quoted for the agent's shell, and read back by setup and doctor.

const SUBS: HookSub[] = ["codex", "cursor", "gemini-cli", "antigravity", "copilot"];
const N = "C:\\Program Files\\nodejs\\node.exe";
const E = "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\repomagpie\\dist\\cli\\main.js";
const FLAG = "--disallow-code-generation-from-strings";

test("each agent's shell: Windows PowerShell (Cursor's inside its pipeline), cmd for Antigravity, a POSIX shell elsewhere", () => {
  assert.deepEqual(SUBS.map((s) => hookShell(s, "win32")), ["powershell", "powershell-pipeline", "powershell", "cmd", "powershell"]);
  for (const platform of ["darwin", "linux"] as Platform[]) assert.ok(SUBS.every((s) => hookShell(s, platform) === "posix"));
});

test("the forms, exactly: both files checked, then node with code generation off, the entry file, hook <agent>, the flags", () => {
  assert.equal(hookLaunch("powershell", N, E, "copilot", []), `if ([IO.File]::Exists('${N}') -and [IO.File]::Exists('${E}')) { & '${N}' ${FLAG} '${E}' hook copilot }`);
  assert.equal(hookLaunch("powershell-pipeline", N, E, "cursor", []), `& { if ([IO.File]::Exists('${N}') -and [IO.File]::Exists('${E}')) { $input | & '${N}' ${FLAG} '${E}' hook cursor } }`);
  assert.equal(hookLaunch("cmd", N, E, "antigravity", ["--inform-only"]), `if exist "${N}" if exist "${E}" "${N}" ${FLAG} "${E}" hook antigravity --inform-only`);
  assert.equal(hookLaunch("posix", "/usr/bin/node", "/opt/rm/main.js", "gemini-cli", []), `test -x '/usr/bin/node' && test -f '/opt/rm/main.js' && '/usr/bin/node' ${FLAG} '/opt/rm/main.js' hook gemini-cli || true`);
  // cmd reads % as a variable: no form for such a path there.
  assert.deepEqual(hookLaunch("cmd", N, "C:\\Users\\50%off\\main.js", "antigravity", []), { error: "cmd would read a % or \" in C:\\Users\\50%off\\main.js" });
});

test("read back: setup's form gives its node, entry file and flags for any path; the name form and other forms are told apart", () => {
  const awkward = ["C:\\Users\\Zoë O'Brien (dev) & co\\node.exe", "/home/o'brien/my files/main.js", "C:\\a\\b c\\main.js"];
  for (const shell of ["powershell", "powershell-pipeline", "cmd", "posix"] as HookShell[]) {
    for (const [node, entry] of [[N, E], [awkward[0], awkward[2]], ...(shell === "posix" ? [["/usr/bin/node", awkward[1]]] : [])]) {
      for (const flags of [[], ["--inform-only"]]) {
        const command = hookLaunch(shell, node, entry, "codex", flags) as string;
        assert.deepEqual(parseHookCommand(command, "codex", shell), { form: "setup", node, entry, flags }, `${shell} ${command}`);
      }
    }
  }
  for (const command of ["repomagpie hook codex", "repomagpie.cmd hook codex --inform-only", "magpie hook codex", "& repomagpie.ps1 hook codex", "/usr/local/bin/repomagpie hook codex"]) {
    assert.equal(parseHookCommand(command, "codex", "powershell")?.form, "name", command);
  }
  assert.deepEqual(parseHookCommand("repomagpie.cmd hook codex --inform-only", "codex", "powershell")?.flags, ["--inform-only"]);
  for (const command of ["node /opt/repomagpie/dist/cli/main.js hook codex", `& '${N}' '${E}' hook codex`, `if (Test-Path '${N}') { & '${N}' ${FLAG} '${E}' hook codex }`]) {
    assert.equal(parseHookCommand(command, "codex", "powershell")?.form, "other", command);
  }
  for (const command of ["repomagpie hook codex-ish", "repomagpie hook cursor", "npm test", "echo hook"]) assert.equal(parseHookCommand(command, "codex", "powershell"), null, command);
});

// The entry, run the way each agent runs it (docs/agents.md: the pre-check's captured command
// lines on Windows; sh elsewhere), with a stand-in entry file that echoes what it got. With node or
// the entry file gone, it must exit 0 and print nothing: a failed hook denies every call in Copilot
// CLI and blocks in Gemini CLI. Started together: Windows PowerShell takes about 300 ms to start.
const windows = process.platform === "win32";
const run = (file: string, args: string[], input: string, verbatim = false) => new Promise<{ code: number | null; out: string; err: string }>((done) => {
  const child = spawn(file, args, { windowsVerbatimArguments: verbatim, env: { ...process.env, PSExecutionPolicyPreference: "" } });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => { out += chunk; });
  child.stderr.on("data", (chunk) => { err += chunk; });
  child.on("close", (code) => done({ code, out, err }));
  // With node or the entry file moved, nothing reads the input: the shell may exit before the write
  // (EPIPE, seen on Linux in CI). The exit code and the output are what the test checks.
  child.stdin.on("error", () => {});
  child.stdin.end(input);
});
const ECHO = "let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), input: s.replace(/^\\uFEFF/, '').trim() })));\n";
const PS = windows ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "";
// Go's syscall.EscapeArg on Windows, which agy (Antigravity CLI, a Go program) applies to each
// argument of `cmd /c <command>`: quoted when it has a space, tab or quote, each " written as \".
function goEscapeArg(arg: string): string {
  if (arg === "") return '""';
  if (!/[ \t"]/.test(arg)) return arg;
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
}
const agy = (command: string, input: string) => run(process.env.ComSpec ?? "cmd.exe", ["/c", goEscapeArg(command)], input, true);
// Antigravity CLI's entry on Windows: the launcher, written beside a hooks.json in <home>\.gemini\config.
function antigravityEntry(home: string, command: string, node: string, entry: string): string {
  const config = join(home, ".gemini", "config");
  mkdirSync(config, { recursive: true });
  const launcher = join(config, LAUNCHER);
  writeFileSync(launcher, launcherText(launcher, node, entry, command) as string);
  return launcher;
}
function launch(sub: HookSub, command: string, input: string, root: string, paths?: [string, string]) {
  if (!windows) return run("/bin/sh", ["-c", command], input);
  if (sub === "antigravity") return agy(antigravityEntry(join(root, `home ${Math.random().toString(36).slice(2)}`), command, ...(paths as [string, string])), input);
  if (sub === "cursor") {
    const payload = join(root, `payload-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(payload, input);
    return run(PS, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-c", `$OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -LiteralPath '${payload}' -Raw | & { $input | ${command} }`], "");
  }
  const flags = { codex: ["-NoProfile", "-Command"], copilot: ["-nop", "-nol", "-c"], "gemini-cli": ["-NoProfile", "-NonInteractive", "-Command"] }[sub];
  return run(PS, [...flags, command], input);
}

test("run through each agent's own shell: the entry answers; with node or the entry file moved, it exits 0 and prints nothing", async () => {
  const root = scratchBase("hook-launch");
  const folder = join(root, windows ? "O'Brien & co (dev)" : "o'brien & co");
  mkdirSync(folder);
  const entry = join(folder, "main.js");
  writeFileSync(entry, ECHO);
  const input = JSON.stringify({ tool: "npm install pdfkit" });
  const cases = SUBS.flatMap((sub) => {
    const shell = hookShell(sub, process.platform as Platform);
    const start = (node: string, file: string) => launch(sub, hookLaunch(shell, node, file, sub, ["--inform-only"]) as string, input, root, [node, file]);
    return [
      { sub, what: "in place", run: start(process.execPath, entry) },
      { sub, what: "node moved", run: start(join(root, "moved", windows ? "node.exe" : "node"), entry) },
      { sub, what: "entry moved", run: start(process.execPath, join(folder, "gone.js")) },
    ];
  });
  for (const c of cases) {
    const r = await c.run;
    if (c.what === "in place") {
      assert.equal(r.code, 0, `${c.sub}: ${r.err}`);
      assert.deepEqual(JSON.parse(r.out), { argv: ["hook", c.sub, "--inform-only"], input }, c.sub);
    } else assert.deepEqual([r.code, r.out, r.err], [0, "", ""], `${c.sub}, ${c.what}`);
  }
});

// Live test C4: agy writes each " in the command as \" (Go's EscapeArg), which cmd doesn't read, so
// the entry holds no quote: it is the launcher's path. cmd reads the launcher in the console's code
// page, so its paths below the home folder come from %~dp0, and any other must be ASCII.
test("Antigravity CLI on Windows, run as agy runs it: the launcher answers under a user name with a space, an apostrophe and Ş; the old form did nothing", { skip: !windows && "cmd is Windows only" }, async () => {
  const root = scratchBase("hook-launch-agy");
  const home = join(root, "Şuat O'Brien");
  const folder = join(home, "AppData", "Roaming", "npm", "node_modules", "repomagpie");
  mkdirSync(folder, { recursive: true });
  const entry = join(folder, "main.js");
  writeFileSync(entry, ECHO);
  const command = hookLaunch("cmd", process.execPath, entry, "antigravity", ["--inform-only"]) as string;
  const launcher = antigravityEntry(home, command, process.execPath, entry);
  const text = readFileSync(launcher, "utf8");
  assert.ok(text.includes('"%~dp0..\\..\\AppData\\Roaming\\npm\\node_modules\\repomagpie\\main.js"'), text);
  assert.match(text, /^[\x20-\x7e\r\n]*$/, "ASCII only");
  assert.equal(readLauncher(launcher), command);
  assert.deepEqual(parseHookCommand(launcher, "antigravity", "cmd"), { form: "setup", node: process.execPath, entry, flags: ["--inform-only"], launcher });
  const input = JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "npm install pdfkit" } } });
  const [answer, old] = await Promise.all([agy(launcher, input), agy(command, input)]);
  assert.equal(answer.code, 0, answer.err);
  assert.deepEqual(JSON.parse(answer.out), { argv: ["hook", "antigravity", "--inform-only"], input });
  assert.deepEqual([old.code, old.out, old.err], [0, "", ""], "the entry before the launcher: if exist finds no file");
  // A launcher that isn't there, or isn't ours: still our entry, with no node, so doctor and setup see it.
  const gone = join(root, "gone", LAUNCHER);
  assert.deepEqual(parseHookCommand(gone, "antigravity", "cmd"), { form: "setup", node: null, entry: null, flags: [], launcher: gone });
  writeFileSync(launcher, "@echo off\r\nnode other.js\r\n");
  assert.equal(readLauncher(launcher), null);
});

test("the launcher can't be written: cmd would split its path or read a character in it; a path outside the home folder that isn't ASCII", () => {
  const command = hookLaunch("cmd", N, E, "antigravity", []) as string;
  for (const user of ["a&b", "a,b", "a;b", "a=b", "x (dev)", "50%"]) {
    const launcher = `C:\\Users\\${user}\\.gemini\\config\\${LAUNCHER}`;
    assert.match((launcherText(launcher, N, E, command) as { error: string }).error, /^cmd can't start /, user);
  }
  const launcher = `C:\\Users\\Zoë O'Brien\\.gemini\\config\\${LAUNCHER}`;
  assert.equal(typeof launcherText(launcher, N, E, command), "string", "a space, an apostrophe and ë in its own path are fine");
  const outside = "D:\\Düğüm\\node.exe";
  assert.deepEqual(launcherText(launcher, outside, E, hookLaunch("cmd", outside, E, "antigravity", []) as string), { error: `cmd reads ${LAUNCHER} in the console's code page, so it can't hold ${outside}` });
});
