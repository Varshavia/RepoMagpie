import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "./agents.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import { hookLaunch, hookShell, parseHookCommand, type HookShell, type HookSub } from "./hook-launch.ts";

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
  child.stdin.end(input);
});
const PS = windows ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "";
function launch(sub: HookSub, command: string, input: string, root: string) {
  if (!windows) return run("/bin/sh", ["-c", command], input);
  if (sub === "antigravity") return run(process.env.ComSpec ?? "cmd.exe", ["/c", `"${command}"`], input, true); // cmd /c "<command>", as agy runs it
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
  writeFileSync(entry, "let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), input: s.replace(/^\\uFEFF/, '').trim() })));\n");
  const input = JSON.stringify({ tool: "npm install pdfkit" });
  const cases = SUBS.flatMap((sub) => {
    const shell = hookShell(sub, process.platform as Platform);
    const command = (node: string, file: string) => hookLaunch(shell, node, file, sub, ["--inform-only"]) as string;
    return [
      { sub, what: "in place", run: launch(sub, command(process.execPath, entry), input, root) },
      { sub, what: "node moved", run: launch(sub, command(join(root, "moved", windows ? "node.exe" : "node"), entry), input, root) },
      { sub, what: "entry moved", run: launch(sub, command(process.execPath, join(folder, "gone.js")), input, root) },
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
