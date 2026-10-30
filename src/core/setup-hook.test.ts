import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { NO_CODEGEN } from "./launch.ts";
import { applyHook, findHooks, HOOK_COMMAND, planHook, STOP, type FoundHook, type HookKind, type HookTarget } from "./setup-hook.ts";

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
  assert.deepEqual(hooks(s.read())[1], { matcher: "Bash|PowerShell|Monitor", hooks: [exec()] });
  assert.ok(s.read().startsWith(GUARD.slice(0, GUARD.indexOf('"hooks": [{'))));
  assert.equal(planHook(s.file, s.home, false, "20261014-130000", EXEC).action, "keep");
});

test("no settings.json, or one without hooks: the hook is the file's only change", () => {
  const none = scratch();
  none.run(EXEC);
  assert.deepEqual(JSON.parse(none.read()), { hooks: { PreToolUse: [{ matcher: "Bash|PowerShell|Monitor", hooks: [exec()] }] } });
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
  assert.deepEqual(hooks(s.read()), [{ matcher: "Bash|Monitor", hooks: [exec()] }]); // Monitor added
});

test("project scope: the shell form; the old magpie entry changed in place, its flags kept", () => {
  const old = GUARD.replace("node .claude/hooks/git-guard.mjs", "magpie hook claude-code --inform-only");
  const s = scratch(old);
  assert.equal(planHook(s.file, s.home, false, STAMP, SHELL).action, "migrate");
  s.run(SHELL);
  assert.equal(s.read(), old.replace('{ "type": "command", "command": "magpie hook claude-code --inform-only" }', '{\n            "type": "command",\n            "command": "repomagpie hook claude-code --inform-only"\n          }').replace('"matcher": "Bash"', '"matcher": "Bash|Monitor"'));
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
  assert.deepEqual(JSON.parse(manual.snippet ?? ""), { hooks: { PreToolUse: [{ matcher: "Bash|PowerShell|Monitor", hooks: [exec()] }] } });

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

// The Stop reminder (decision 0042): the same writer, another event, its own subcommand.
test("the Stop reminder: a Stop entry without a matcher, beside the PreToolUse hook; kept, updated and removed on its own", () => {
  const s = scratch(GUARD);
  assert.equal(s.run(EXEC).result, "done");
  const before = s.read();
  // Without --capture-reminder (add false), nothing is added.
  assert.equal(planHook(s.file, s.home, false, STAMP, EXEC, STOP, false).action, "keep");
  const plan = planHook(s.file, s.home, false, "20261014-130000", EXEC, STOP);
  assert.equal(plan.action, "add");
  assert.equal(applyHook(plan, s.home, EXEC, STOP).result, "done");
  const settings = JSON.parse(s.read()) as { hooks: { PreToolUse: unknown; Stop: unknown } };
  assert.deepEqual(settings.hooks.Stop, [{ hooks: [{ type: "command", command: NODE, args: [NO_CODEGEN, ENTRY, "hook", "claude-code-stop"] }] }]);
  assert.deepEqual(settings.hooks.PreToolUse, (JSON.parse(before) as { hooks: { PreToolUse: unknown } }).hooks.PreToolUse, "the PreToolUse hook is untouched");
  // Each finds only its own: hook claude-code isn't hook claude-code-stop.
  assert.equal(planHook(s.file, s.home, false, STAMP, EXEC).action, "keep");
  assert.equal(planHook(s.file, s.home, false, STAMP, EXEC, STOP, false).action, "keep");
  // A moved entry file: kept up to date even without the flag.
  const moved: HookTarget = { exec: { command: NODE, args: [NO_CODEGEN, "C:\\new\\main.js", "hook", "claude-code"] } };
  assert.equal(planHook(s.file, s.home, false, STAMP, moved, STOP, false).action, "migrate");
  // --remove takes out the reminder alone; the hook stays.
  assert.equal(applyHook(planHook(s.file, s.home, true, "20261014-140000", EXEC, STOP), s.home, EXEC, STOP).result, "done");
  const after = JSON.parse(s.read()) as { hooks: Record<string, unknown> };
  assert.deepEqual(after.hooks.Stop, []);
  assert.deepEqual(after.hooks.PreToolUse, (JSON.parse(before) as { hooks: { PreToolUse: unknown } }).hooks.PreToolUse);
});

test("the Stop reminder in a project's shell form, and a Stop that isn't a list", () => {
  const s = scratch();
  assert.equal(applyHook(planHook(s.file, s.home, false, STAMP, SHELL, STOP), s.home, SHELL, STOP).result, "done");
  assert.deepEqual(JSON.parse(s.read()).hooks.Stop, [{ hooks: [{ type: "command", command: "repomagpie hook claude-code-stop" }] }]);
  const wrong = scratch('{"hooks": {"Stop": {}}}');
  assert.match(planHook(wrong.file, wrong.home, false, STAMP, EXEC, STOP).reason ?? "", /hooks\.Stop isn't a list/);
  assert.equal(planHook(wrong.file, wrong.home, false, STAMP, EXEC).action, "add", "the PreToolUse hook doesn't mind");
});

// Claude Code's Monitor tool runs shell commands with Bash's permission rules, and a hook matcher
// names tools exactly (code.claude.com/docs/en/tools-reference): the hook matches it too.
test("the hook's matcher includes Monitor; setup adds it to an entry of ours that lacks it, leaving a shared group's alone", () => {
  const s = scratch();
  s.run(EXEC);
  assert.equal(hooks(s.read())[0].matcher, "Bash|PowerShell|Monitor");
  const old = scratch(JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [exec("--inform-only")] }] } }, null, 2));
  assert.equal(planHook(old.file, old.home, false, STAMP, EXEC).action, "migrate");
  assert.equal(old.run(EXEC).result, "done");
  assert.deepEqual(hooks(old.read()), [{ matcher: "Bash|PowerShell|Monitor", hooks: [exec("--inform-only")] }]);
  assert.equal(planHook(old.file, old.home, false, "20261014-130000", EXEC).action, "keep");
  // A group with another hook beside ours: changing its matcher would change that hook too.
  const shared = scratch(JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node guard.mjs" }, exec()] }] } }, null, 2));
  assert.equal(planHook(shared.file, shared.home, false, STAMP, EXEC).action, "keep");
  // No matcher, or "*", matches every tool already.
  for (const matcher of [undefined, "*", ""]) {
    const all = scratch(JSON.stringify({ hooks: { PreToolUse: [{ ...(matcher === undefined ? {} : { matcher }), hooks: [exec()] }] } }, null, 2));
    assert.equal(planHook(all.file, all.home, false, STAMP, EXEC).action, "keep", String(matcher));
  }
});

test("a subcommand with regex characters is matched literally", () => {
  const kind: HookKind = { event: "PreToolUse", sub: "a.b+" as HookKind["sub"], matcher: null };
  const settings = (command: string) => ({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command }] }] } });
  assert.deepEqual((findHooks(settings("repomagpie hook a.b+ --quiet"), kind) as FoundHook[]).map((h) => [h.form, h.flags]), [["shell", ["--quiet"]]]);
  assert.deepEqual(findHooks(settings("repomagpie hook axbb"), kind), [], "the dot and the plus aren't wildcards");
});
