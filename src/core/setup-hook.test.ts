import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { applyHook, HOOK_COMMAND, planHook } from "./setup-hook.ts";

// The Claude Code hook (spec §6; decision 0035): added, migrated from the old `magpie` name, kept,
// removed; every other key of settings.json byte for byte.

const STAMP = "20261014-120000";
const GUARD = '{\n  "permissions": {\n    "allow": ["Bash(npm test)"]\n  },\n  "hooks": {\n    "PreToolUse": [\n      {\n        "matcher": "Bash",\n        "hooks": [{ "type": "command", "command": "node .claude/hooks/git-guard.mjs" }]\n      }\n    ]\n  }\n}\n';

function scratch(text?: string) {
  const root = scratchBase("hook");
  const file = join(root, "home", ".claude", "settings.json");
  mkdirSync(dirname(file), { recursive: true });
  if (text !== undefined) writeFileSync(file, text);
  const read = () => readFileSync(file, "utf8");
  return { root, home: join(root, "home"), file, read };
}

const hooks = (text: string) => (JSON.parse(text) as { hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] } }).hooks.PreToolUse;

test("added last in PreToolUse, after the file's own hooks, everything else byte for byte; a backup first", () => {
  const s = scratch(GUARD);
  const plan = planHook(s.file, s.home, false, STAMP);
  assert.deepEqual([plan.action, plan.backup], ["add", `${s.file}.repomagpie-backup-${STAMP}`]);
  const done = applyHook(plan, s.home);
  assert.equal(done.result, "done", done.error);
  assert.equal(readFileSync(`${s.file}.repomagpie-backup-${STAMP}`, "utf8"), GUARD);
  assert.deepEqual(hooks(s.read())[1], { matcher: "Bash|PowerShell", hooks: [{ type: "command", command: HOOK_COMMAND }] });
  assert.ok(s.read().startsWith(GUARD.slice(0, GUARD.indexOf('"hooks": [{')) ));
  assert.equal(HOOK_COMMAND, "repomagpie hook claude-code");
  // Twice changes nothing.
  assert.equal(planHook(s.file, s.home, false, "20261014-130000").action, "keep");
});

test("no settings.json, or one without hooks: the hook is the file's only change", () => {
  const none = scratch();
  applyHook(planHook(none.file, none.home, false, STAMP), none.home);
  assert.deepEqual(JSON.parse(none.read()), { hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [{ type: "command", command: HOOK_COMMAND }] }] } });
  const bare = scratch('{\n  "model": "opus"\n}\n');
  applyHook(planHook(bare.file, bare.home, false, STAMP), bare.home);
  assert.ok(bare.read().startsWith('{\n  "model": "opus",\n  "hooks": {\n    "PreToolUse": [\n'));
});

test("the old magpie entry is migrated in place, its flags kept; with a current entry too, the old one goes", () => {
  const old = GUARD.replace("node .claude/hooks/git-guard.mjs", "magpie hook claude-code --inform-only");
  const s = scratch(old);
  const plan = planHook(s.file, s.home, false, STAMP);
  assert.equal(plan.action, "migrate");
  applyHook(plan, s.home);
  assert.equal(s.read(), old.replace("magpie hook claude-code --inform-only", "repomagpie hook claude-code --inform-only"));

  const both = scratch(old);
  applyHook(planHook(both.file, both.home, false, STAMP), both.home); // migrated: now current
  writeFileSync(both.file, both.read().replace("]\n      }\n    ]", ']\n      },\n      {\n        "matcher": "Bash",\n        "hooks": [{ "type": "command", "command": "magpie hook claude-code" }]\n      }\n    ]'));
  applyHook(planHook(both.file, both.home, false, "20261014-130000"), both.home);
  assert.deepEqual(hooks(both.read()).map((g) => g.hooks.map((h) => h.command)), [["repomagpie hook claude-code --inform-only"]]);
});

test("an entry that runs RepoMagpie another way is kept, and said so", () => {
  const s = scratch(GUARD.replace("node .claude/hooks/git-guard.mjs", "node /opt/repomagpie/dist/cli/main.js hook claude-code"));
  const plan = planHook(s.file, s.home, false, STAMP);
  assert.equal(plan.action, "keep");
  assert.match(plan.reason ?? "", /another way/);
});

test("--remove takes out only our entries: a group of ours whole, ours alone from a shared group", () => {
  const s = scratch(GUARD);
  applyHook(planHook(s.file, s.home, false, STAMP), s.home);
  const removed = applyHook(planHook(s.file, s.home, true, "20261014-130000"), s.home);
  assert.equal(removed.result, "done", removed.error);
  assert.equal(s.read(), GUARD);
  const shared = scratch(GUARD.replace('[{ "type": "command", "command": "node .claude/hooks/git-guard.mjs" }]', '[{ "type": "command", "command": "node .claude/hooks/git-guard.mjs" }, { "type": "command", "command": "magpie hook claude-code" }]'));
  applyHook(planHook(shared.file, shared.home, true, STAMP), shared.home);
  assert.equal(shared.read(), GUARD);
});

test("never edited: comments (a snippet instead), a linked .claude folder, PreToolUse that isn't a list", () => {
  const comments = scratch(`// mine\n${GUARD}`);
  const manual = planHook(comments.file, comments.home, false, STAMP);
  assert.equal(manual.action, "manual");
  assert.deepEqual(JSON.parse(manual.snippet ?? ""), { hooks: { PreToolUse: [{ matcher: "Bash|PowerShell", hooks: [{ type: "command", command: HOOK_COMMAND }] }] } });

  const linked = scratch();
  const elsewhere = join(linked.root, "elsewhere");
  mkdirSync(elsewhere);
  symlinkSync(elsewhere, join(linked.home, ".claude2"), "junction");
  const viaLink = join(linked.home, ".claude2", "settings.json");
  assert.equal(planHook(viaLink, linked.home, false, STAMP).action, "refused");
  assert.equal(existsSync(join(elsewhere, "settings.json")), false);

  const wrong = scratch('{"hooks": {"PreToolUse": {}}}');
  const refused = planHook(wrong.file, wrong.home, false, STAMP);
  assert.equal(refused.action, "refused");
  assert.match(refused.reason ?? "", /PreToolUse/);
});
