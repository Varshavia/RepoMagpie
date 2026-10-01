// Tests for git-guard.mjs. Run from the repo root: node --test ".claude/hooks/*.test.mjs"
// (Node 21+ treats --test arguments as globs; a bare directory is not searched.)
// Each case feeds the hook the JSON a PreToolUse event would send and checks the exit code
// (2 = blocked, 0 = allowed). No git command is ever executed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./git-guard.mjs", import.meta.url));

function exitCode(tool, command) {
  const input = JSON.stringify({ tool_name: tool, tool_input: { command } });
  return spawnSync(process.execPath, [HOOK], { input }).status;
}

const BLOCKED = [
  // Required by the maintainer
  ["Bash", "git commit -m test"],
  ["Bash", "git -C . commit -m test"],
  ["Bash", "git add ."],
  ["Bash", "git status && git push"],
  // Other forms
  ["Bash", "git.exe commit -m test"],
  ["PowerShell", "git.exe commit -m test"],
  ["PowerShell", "git status; git push"],
  ["PowerShell", "& 'C:\\Program Files\\Git\\cmd\\git.exe' add ."],
  ["Bash", "/usr/bin/git push"],
  ["Bash", "git 'push' origin main"],
  ["Bash", "git -c push.default=current push"],
  ["Bash", "cd /tmp && git stash"],
  ["Bash", "git log || git reset --hard"],
  ["Bash", 'echo "$(git restore .)"'],
  ["Bash", 'echo "$(date)" && git push'],
  ["PowerShell", 'Write-Host "x $(git commit -m y) z"'],
  ["Bash", 'bash -c "git status; git clean -fd"'],
  ["PowerShell", 'powershell -NoProfile -Command "git push"'],
  ["Bash", "cmd /c git rm x"],
  ["Bash", "FOO=1 timeout 30 git worktree add ../x"],
  ["Bash", "ls | xargs git add"],
  ["Bash", 'find . -name "*.md" -exec git add {} \\;'],
  ["Bash", "if true; then git revert HEAD; fi"],
  ["Monitor", "git config user.name x"],
  ["Bash", "git -C . \\\ncommit -m x"],
  ["PowerShell", "git -C . `\r\ncommit -m x"],
  ["Bash", "git init"],
  ["Bash", "git cherry-pick abc"],
  ["Bash", "git mv a b"],
  ["Bash", "git fetch"],
];

const ALLOWED = [
  ["Bash", "git status"],
  ["Bash", "git -C . log --oneline -5"],
  ["Bash", "git --no-pager diff --stat"],
  ["Bash", "git show HEAD:README.md && git blame CLAUDE.md && git ls-files"],
  ["Bash", "git --version"],
  ["Bash", "git check-ignore -v .worklog/2026-10-01.md"],
  ["Bash", 'echo "$(git log -1 --format=%H)"'],
  ["PowerShell", '"Today: $(Get-Date)"; git log -1'],
  ["Bash", 'grep -rn "git commit" docs CLAUDE.md'],
  ["Bash", "echo git push is forbidden"],
  ["Bash", 'git log --grep="git push" --oneline'],
  ["Bash", "ls .git && cat .gitignore"],
  ["Bash", "npm test"],
  ["PowerShell", "Get-ChildItem; git status"],
];

for (const [tool, command] of BLOCKED) {
  test(`blocks (${tool}) ${JSON.stringify(command)}`, () => assert.equal(exitCode(tool, command), 2));
}

for (const [tool, command] of ALLOWED) {
  test(`allows (${tool}) ${JSON.stringify(command)}`, () => assert.equal(exitCode(tool, command), 0));
}
