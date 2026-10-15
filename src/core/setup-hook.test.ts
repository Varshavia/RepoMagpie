import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { NO_CODEGEN } from "./launch.ts";
import { applyHook, HOOK_COMMAND, planHook, type HookTarget } from "./setup-hook.ts";

// The Claude Code hook (spec §6; decision 0035): in the user's settings the exec form (node started
// directly, no shell); in a project the shell form. Added, migrated with its flags, kept, removed;
// every other key of settings.json byte for byte.

const STAMP = "20261014-120000";
const NODE = "C:\\Program Files\\nodejs\\node.exe";
const ENTRY = "C:\\npm\\node_modules\\repomagpie\\dist\\cli\\main.js";
const EXEC: HookTarget = { exec: { command: NODE, args: [NO_CODEGEN, ENTRY, "hook", "claude-code"] } };
const SHELL: HookTarget = { shell: true };
const GUARD = '{\n  "permissions": {\n    "allow": ["Bash(npm test)"]\n  },\n  "hooks": {\n    "PreToolUse": [\n      {\n        "matcher": "Bash",\n        "hooks": [{ "type": "command", "command": "node .claude/hooks/git-guard.mjs" }]\n      }\n    ]\n  }\n}\n';

function scratch(text?: string) {
  const root = scratchBase("hook");
  const file = join(root, "home", ".claude", "settings.json");
  mkdirSync(dirname(file), { recursive: true });
  if (text !== undefined) writeFileSync(file, text);
  const read = () => readFileSync(file, "utf8");
  const run = (target: HookTarget, remove = false, stamp = STAMP) => applyHook(planHook(file, join(root, "home"), remove, stamp, target), join(root, "home"), target);
  return { root, home: join(root, "home"), file, read, run };
}

type Hook = { type: string; command: string; args?: string[]; timeout?: number };
const hooks = (text: string) => (JSON.parse(text) as { hooks: { PreToolUse: { matcher: string; hooks: Hook[] }[] } }).hooks.PreToolUse;
const exec = (...flags: string[]): Hook => ({ type: "command", command: NODE, args: [NO_CODEGEN, ENTRY, "hook", "claude-code", ...flags] });

test("user scope: the exec form goes last in PreToolUse after the file's own hooks; a backup first; twice changes nothing", () => {
  const s = scratch(GUARD);
  const plan = planHook(s.file, s.home, false, STAMP, EXEC);
  assert.deepEqual([plan.action, plan.backup], ["add", `${s.file}.repomagpie-backup-${STAMP}`]);
  assert.equal(applyHook(plan, s.home, EXEC).result, "done");
  assert.equal(readFileSync(`${s.file}.repomagpie-backup-${STAMP}`, "utf8"), GUARD);
  assert.deepEqual(hooks(s.read())[1], { matcher: "Bash|PowerShell", hooks: [exec()] });
  assert.ok(s.read().startsWith(GUARD.slice(0, GUARD.indexOf('"hooks": [{'))));
  assert.equal(planHook(s.file, s.home, false, "20261014-130000", EXEC).action, "keep");
});

test("no settings.json, or one without hooks: the hook is the file's only change", () => {
  const none = scratch();
  none.run(EXEC);
  assert.deepEqual(JSON.parse(none.read()), { hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [exec()] }] } });
  const bare = scratch('{\n  "model": "opus"\n}\n');
  bare.run(EXEC);
  assert.ok(bare.read().startsWith('{\n  "model": "opus",\n  "hooks": {\n    "PreToolUse": [\n'));
});

test("user scope: the magpie and repomagpie shell forms, and an exec form with old paths, become the exec form; flags and other keys kept", () => {
  for (const [hook, flags] of [
    [{ type: "command", command: "magpie hook claude-code --inform-only", timeout: 5 }, ["--inform-only"]],
    [{ type: "command", command: "repomagpie hook claude-code", timeout: 5 }, []],
    [{ type: "command", command: "/old/node", args: ["/old/main.js", "hook", "claude-code", "--inform-only"], timeout: 5 }, ["--inform-only"]],
  ] as const) {
    const s = scratch(JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [hook] }] } }, null, 2));
    assert.equal(planHook(s.file, s.home, false, STAMP, EXEC).action, "migrate", hook.command);
    assert.equal(s.run(EXEC).result, "done");
    assert.deepEqual(hooks(s.read())[0].hooks, [{ ...exec(...flags), timeout: 5 }], hook.command);
  }
});

test("user scope: an old and a current entry together become one exec entry", () => {
  const s = scratch(JSON.stringify({ hooks: { PreToolUse: [
    { matcher: "Bash", hooks: [{ type: "command", command: "magpie hook claude-code" }] },
    { matcher: "Bash|PowerShell", hooks: [{ type: "command", command: "repomagpie hook claude-code" }] },
  ] } }, null, 2));
  s.run(EXEC);
  assert.deepEqual(hooks(s.read()), [{ matcher: "Bash", hooks: [exec()] }]);
});

test("project scope: the shell form; the old magpie entry changed in place, its flags kept", () => {
  const old = GUARD.replace("node .claude/hooks/git-guard.mjs", "magpie hook claude-code --inform-only");
  const s = scratch(old);
  assert.equal(planHook(s.file, s.home, false, STAMP, SHELL).action, "migrate");
  s.run(SHELL);
  assert.equal(s.read(), old.replace('{ "type": "command", "command": "magpie hook claude-code --inform-only" }', '{\n            "type": "command",\n            "command": "repomagpie hook claude-code --inform-only"\n          }'));
  assert.equal(planHook(s.file, s.home, false, "20261014-130000", SHELL).action, "keep");
  const fresh = scratch();
  fresh.run(SHELL);
  assert.deepEqual(hooks(fresh.read())[0].hooks, [{ type: "command", command: HOOK_COMMAND }]);
  assert.equal(HOOK_COMMAND, "repomagpie hook claude-code");
});

test("an entry that runs RepoMagpie another way is kept, and said so", () => {
  const s = scratch(GUARD.replace("node .claude/hooks/git-guard.mjs", "node /opt/repomagpie/dist/cli/main.js hook claude-code"));
  const plan = planHook(s.file, s.home, false, STAMP, EXEC);
  assert.equal(plan.action, "keep");
  assert.match(plan.reason ?? "", /another way/);
});

test("--remove takes out only our entries, in any form: a group of ours whole, ours alone from a shared group", () => {
  const s = scratch(GUARD);
  s.run(EXEC);
  assert.equal(s.run(EXEC, true, "20261014-130000").result, "done");
  assert.equal(s.read(), GUARD);
  const shared = scratch(GUARD.replace('[{ "type": "command", "command": "node .claude/hooks/git-guard.mjs" }]', '[{ "type": "command", "command": "node .claude/hooks/git-guard.mjs" }, { "type": "command", "command": "magpie hook claude-code" }]'));
  shared.run(EXEC, true);
  assert.equal(shared.read(), GUARD);
});

test("never edited: comments (a snippet instead), a linked folder, PreToolUse that isn't a list, no launch", () => {
  const comments = scratch(`// mine\n${GUARD}`);
  const manual = planHook(comments.file, comments.home, false, STAMP, EXEC);
  assert.equal(manual.action, "manual");
  assert.deepEqual(JSON.parse(manual.snippet ?? ""), { hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [exec()] }] } });

  const linked = scratch();
  const elsewhere = join(linked.root, "elsewhere");
  mkdirSync(elsewhere);
  symlinkSync(elsewhere, join(linked.home, ".claude2"), "junction");
  assert.equal(planHook(join(linked.home, ".claude2", "settings.json"), linked.home, false, STAMP, EXEC).action, "refused");
  assert.equal(existsSync(join(elsewhere, "settings.json")), false);

  const wrong = scratch('{"hooks": {"PreToolUse": {}}}');
  assert.match(planHook(wrong.file, wrong.home, false, STAMP, EXEC).reason ?? "", /PreToolUse/);

  const npx = scratch(GUARD);
  const blocked = planHook(npx.file, npx.home, false, STAMP, { error: "This copy of RepoMagpie runs from npx's cache" });
  assert.deepEqual([blocked.action, blocked.reason], ["refused", "This copy of RepoMagpie runs from npx's cache"]);
});
