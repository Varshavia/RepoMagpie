# 0061 — The Claude Code hook's form follows Claude Code's version

**Status:** accepted (2026-11-08, from the maintainer's brief for `fix/setup-claude-code-version`). Supersedes three parts of [0035](0035-setup-and-doctor.md): the user's hook entry always in exec form, its migration of every older entry to exec form, and the shell form in the user's settings always being a to-do. 0035's "exits 0 whatever it finds" stays.

## Context
`setup` wrote the exec form (`command` plus `args`) into `~/.claude/settings.json` on every Claude Code. The hook field `args` first shipped in v2.1.139 on 2026-05-11 ([agents](../agents.md#claude-code)). The maintainer's report is that an older version silently ignores it, so the hook never fires. `doctor` only checks the entry's shape, so it still reported the hook as wired.

A hook that doesn't fire is the worst way for this hook to fail: the user believes an install is checked when it isn't. The shell form runs on every version, but it costs more. On Windows it took 281 ms against the exec form's 86 ms, over the hook's 150 ms budget ([0035](0035-setup-and-doctor.md)), and it starts node without `--disallow-code-generation-from-strings`.

## Decision

**`setup` reads `claude --version`**, the way it runs an agent's CLI: by the absolute path found on `PATH`, through `cmd.exe` for npm's `.cmd` shim on Windows, from the home folder, with a 10-second timeout. The minimum is one constant, `EXEC_FORM_MIN_VERSION` (`src/core/claude-version.ts`).

| `claude --version` | No entry yet | An exec entry there | A shell entry there |
|---|---|---|---|
| at or above the minimum | exec form | kept, or updated to this install's paths | changed to exec form |
| below the minimum | shell form, with a note | changed to shell form, flags kept | kept |
| can't be read | shell form, with a warning | **left byte for byte**, with a warning | kept |

- **Only a version known to be too old moves an exec entry to the shell form.** A failed read says nothing about the entry, and a brief failure must not slow a working hook (decided by the maintainer on 2026-11-08). Unreadable means no `claude` command on `PATH`, a non-zero exit, the timeout, or output with no version.
- **The Stop reminder** ([0042](0042-the-stop-reminder.md)) follows the same rule: it is the same kind of entry in the same file.
- **Nothing else changes.** With `--project` the entry is the shell form and the version isn't read. From npx's cache no user hook is written. `--remove` doesn't read it.

**`doctor` prints Claude Code's version and each entry's form,** and compares them:
- Exec form on a version known to be below the minimum is a **FAIL**: a line starting `FAIL:` above every other to-do, repeated in `claude_code.failures` in `--json`. `doctor` still exits 0: it is a report, not a check ([0035](0035-setup-and-doctor.md)).
- Exec form with the version unreadable is an ordinary to-do, not a FAIL.
- The shell form in the user's settings is a to-do only at or above the minimum, where `setup` would change it. Below the minimum, or with the version unknown, a to-do would name a run that changes nothing.
- `doctor` stays read-only for RepoMagpie's files. Starting `claude --version` is new for it.

## Consequences
- A Claude Code below the minimum gets a slower hook that fires, and no code-generation flag on it. After updating Claude Code, `repomagpie setup` moves the entry to exec form.
- Exec entries written by an earlier `setup` on an old Claude Code are fixed by running `repomagpie setup` again; `doctor`'s FAIL says so.
- Each `setup` that includes Claude Code, and each `doctor` where `claude` is on `PATH`, starts one more process. `setup`'s interactive flow can start it up to three times, once per plan it draws.
- A pre-release counts as its release: `2.1.139-beta.1` is read as `2.1.139`.
- What an older Claude Code does with `args` isn't in its docs. The rule rests on the release in which the field appeared and the maintainer's report.
