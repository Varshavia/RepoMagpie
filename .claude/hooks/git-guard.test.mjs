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
  // A heredoc fed to an interpreter runs its body, so heredoc text must stay scanned.
  ["Bash", "bash <<EOF\ngit push\nEOF"],
  // gh: anything outside the read-only allowlist
  ["Bash", "gh pr create --fill"],
  ["Bash", "gh pr merge 12"],
  ["Bash", "gh pr checkout 5"],
  ["Bash", "gh issue create -t x -b y"],
  ["Bash", "gh issue comment 3 -b hi"],
  ["Bash", "gh repo delete o/r --yes"],
  ["Bash", "gh release create v0.1.0"],
  ["Bash", "gh workflow run ci.yml"],
  ["Bash", "gh secret set TOKEN"],
  ["Bash", "gh extension install o/r"],
  ["Bash", "gh alias set co 'pr checkout'"],
  ["Bash", "gh auth token"],
  ["Bash", "gh auth status --show-token"],
  ["Bash", "gh auth status -t"],
  ["Bash", "gh -R o/r pr create"],
  ["Bash", "gh repo view && gh pr create"],
  ["Bash", 'bash -c "gh release delete v1"'],
  ["PowerShell", "gh.exe pr create --fill"],
  // gh api: non-GET methods and body fields
  ["Bash", "gh api -X POST repos/o/r/issues"],
  ["Bash", "gh api -XPATCH repos/o/r"],
  ["Bash", "gh api --method PUT repos/o/r/subscription"],
  ["Bash", "gh api --method=DELETE repos/o/r"],
  ["Bash", "gh api repos/o/r/issues -f title=x"],
  ["Bash", "gh api repos/o/r/issues -ftitle=x"],
  ["Bash", "gh api repos/o/r/issues -F title=x"],
  ["Bash", "gh api repos/o/r/issues --field=title=x"],
  ["Bash", "gh api repos/o/r/issues --raw-field title=x"],
  ["Bash", "gh api graphql --input query.json"],
  // Writing files from the shell: use the Edit/Write tools instead.
  ["Bash", "sed -i 's/a/b/' docs/x.md"],
  ["Bash", "sed -i.bak 's/a/b/' x.md"],
  ["Bash", "sed --in-place 's/a/b/' x.md"],
  ["Bash", "sed -ni 's/a/b/p' x.md"],
  ["Bash", "sed 's/a/b/' -i x.md"],
  ["Bash", "cd docs && sed -i 's/a/b/' x.md"],
  ["Bash", "find . -name '*.md' -exec sed -i 's/a/b/' {} \\;"],
  ["Bash", "perl -i -pe 's/a/b/' x.md"],
  ["Bash", "perl -pi -e 's/a/b/' x.md"],
  ["Bash", "ruby -i -pe 'gsub(/a/, \"b\")' x.md"],
  ["Bash", "awk -i inplace '{print}' x.md"],
  ["Bash", "gawk -i inplace '{print}' x.md"],
  ["Bash", "echo hi | tee out.txt"],
  ["Bash", "echo hi | tee -a out.txt"],
  ["Bash", "echo hi > out.txt"],
  ["Bash", "echo hi >> out.txt"],
  ["Bash", "echo hi>out.txt"],
  ["Bash", "echo hi &> out.txt"],
  ["Bash", "printf x >| out.txt"],
  ["Bash", "ls 2> errors.log"],
  ["Bash", "git status && echo done > log.txt"],
  ["Bash", "cat <<'EOF' > notes.md\nhello\nEOF"],
  ["Bash", 'bash -c "echo hi > out.txt"'],
  ["Bash", 'echo "$(cat a.md > b.md)"'],
  ["PowerShell", "Set-Content -Path x.md -Value hi"],
  ["PowerShell", "set-content x.md hi"],
  ["PowerShell", "Add-Content x.md 'hi'"],
  ["PowerShell", "'hi' | Out-File x.md"],
  ["PowerShell", "Get-Content a.md | Set-Content b.md"],
  ["PowerShell", "echo hi > out.txt"],
  ["PowerShell", "Write-Output hi >> out.txt"],
  ["PowerShell", "Get-Date *> log.txt"],
  ["PowerShell", "Get-ChildItem; 'x' | Out-File -FilePath log.txt"],
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
  // gh: read-only allowlist
  ["Bash", "gh repo view"],
  ["Bash", "gh repo view o/r --json licenseInfo,visibility"],
  ["Bash", "gh issue list --state open"],
  ["Bash", "gh issue view 3 --comments"],
  ["Bash", "gh pr list"],
  ["Bash", "gh pr view 12"],
  ["Bash", "gh release list"],
  ["Bash", "gh release view v0.1.0"],
  ["Bash", "gh auth status"],
  ["Bash", "gh --version"],
  ["Bash", "gh api repos/o/r/private-vulnerability-reporting"],
  ["Bash", "gh api -X GET repos/o/r"],
  ["Bash", "gh api --method=get repos/o/r"],
  ["Bash", "gh api repos/o/r/issues --paginate -q '.[].title'"],
  ["Bash", "gh api -H 'Accept: application/vnd.github+json' repos/o/r"],
  ["PowerShell", "gh.exe api repos/o/r"],
  ["Bash", 'echo "gh pr create is blocked"'],
  // Read-only commands, grep/sed without -i, tests, npm/npx, piping to stdout.
  ["Bash", "grep -rn 'a > b' docs"],
  ["Bash", 'grep -rn "x >> y" docs'],
  ["Bash", "sed -n '1,5p' CLAUDE.md"],
  ["Bash", "sed 's/a/b/' CLAUDE.md"],
  ["Bash", "sed -e 's/i/x/' CLAUDE.md"],
  ["Bash", "awk '{print $1}' CLAUDE.md"],
  ["Bash", "perl -ne 'print if /x/' CLAUDE.md"],
  ["Bash", "node -e 'console.log(1 > 0)'"],
  ['Bash', 'node --test ".claude/hooks/*.test.mjs"'],
  ["Bash", "npm test"],
  ["Bash", "npx tsc --noEmit"],
  ["Bash", "cat CLAUDE.md | head -5"],
  ["Bash", "echo hi | tee"],
  ["Bash", "echo hi | tee /dev/null"],
  ["Bash", "ls 2>/dev/null"],
  ["Bash", "ls > /dev/null 2>&1"],
  ["Bash", "git status 2>&1 | head -5"],
  ["Bash", "echo error >&2"],
  ["Bash", "ls 2>&-"],
  ["PowerShell", "Get-ChildItem 2>$null"],
  ["PowerShell", "git status > $null"],
  ["PowerShell", "dir > NUL"],
  ["PowerShell", "Get-Content CLAUDE.md | Select-Object -First 5"],
  ["PowerShell", "Get-Date *>&1"],
];

for (const [tool, command] of BLOCKED) {
  test(`blocks (${tool}) ${JSON.stringify(command)}`, () => assert.equal(exitCode(tool, command), 2));
}

for (const [tool, command] of ALLOWED) {
  test(`allows (${tool}) ${JSON.stringify(command)}`, () => assert.equal(exitCode(tool, command), 0));
}
