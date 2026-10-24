# 0038 — `setup` chooses agents found by command or app, and deletes its backups on request

**Status:** accepted (2026-10-24, from the maintainer's macOS test brief). Refines [0035](0035-setup-and-doctor.md): which agents `setup` chooses (its rule 1, the multi-select in rule 3, `--yes`), "Backups are never deleted for the user", and what `doctor`'s to-dos say. 0035 stays as written for everything else, `doctor` read-only included; its index row points here. Agent facts: [agents](../agents.md).

## Context
The maintainer ran the tester guide on macOS 26.1 on 2026-10-24. On that machine `~/.codex`, `~/.cursor`, `~/.copilot` and VS Code's user folder exist, and only `claude` is on `PATH`. Four findings come from 0035 as written:

- **Agents found by a folder alone.** 0035 counts an agent as installed when its config folder exists or its command is on `PATH`, and the multi-select starts with every one chosen. `setup` preselected Codex CLI, Cursor, VS Code and Copilot CLI, and `--yes` wrote hooks for Codex CLI and Copilot CLI, whose commands aren't there. A folder outlives an uninstall, and other tools make some of them (VS Code reads `~/.copilot`).
- **Backups pile up.** One `--remove` and `setup` cycle left 17 backups, three of them whole copies of `~/.claude.json`, which can hold sign-in tokens. `setup` never deletes one and `doctor` only lists them, so the safe step, deleting them, meant typing a long `rm` by hand.
- **A to-do that sends you in a circle.** Without the `codex` command, `setup` prints a TOML snippet to paste; `doctor` then said "Run repomagpie setup", which prints the same snippet again. The same trap waits wherever `setup` only prints a snippet or never writes: a file with comments or a key written twice, a file behind a link, an agent's hooks turned off, `.claude/settings.local.json`, a skill folder `setup` doesn't manage.
- **The note tool turned off unannounced.** After `--remove`, `setup --yes` wrote entries without `--allow-write`, as specified (a new entry starts without it), but nothing said so.

## Decision

### 1. How an agent was found, and which ones `setup` chooses
- An agent is found by its **command** on `PATH`, by its **app** (on macOS, `Cursor.app` and `Visual Studio Code.app` in `/Applications` or `~/Applications`; their command is on `PATH` only once the user installs it from the app), or by its **folder** alone (the marker of 0035: `~/.codex`, `~/.cursor`, `~/.gemini/settings.json`, …). The markers stay as 0035 and [0036](0036-hooks-in-other-agents.md) set them, so Gemini CLI and Antigravity CLI still tell `~/.gemini` apart.
- Without `--agents`, `setup` chooses the agents found by command or app. The multi-select lists every agent found, with how (`Claude Code (the claude command)`, `Cursor (/Applications/Cursor.app)`, `Codex CLI (found ~/.codex only)`), and starts with the folder-only ones unchosen. `--yes` and `--dry-run` follow the same choice; the plan lists a folder-only agent as `not chosen: found ~/.codex only (--agents codex sets it up)`.
- `--agents` still chooses exactly, a folder-only agent included.
- `--remove` chooses every agent found, by folder too: an earlier `setup` may have written to one, and taking out only RepoMagpie's own entries is always safe.
- `doctor` says `found ~/.codex only` where it said `installed` for such an agent, and a folder-only agent without an entry is no to-do: `setup` doesn't choose it either. `installed` stays in both `--json` documents, as before; a new `found` field says how (`{"by": "command|app|folder", "path": "..."}`).
- Windows and Linux have no app check: their installers put the command on `PATH`.

### 2. Deleting backups: `repomagpie setup --delete-backups`
- It lists the backups `doctor` lists, with their dates; asks `Delete these N backups? (y/N)`, whose default is no; deletes each; and prints what it deleted. Without a terminal it needs `--yes` (or `--dry-run`, which lists them); `--json` needs one of the two, as for `setup`. `--keep-latest` keeps the newest backup of each file.
- It deletes only what `doctor` found: names that match the backup pattern, beside the files `setup` edits in the home folder and beside the skills folders, found again from the folders' listings just before the delete, never a link and never in a folder reached through a link. Each goes through `removeFolder`, which removes a link as a link and never follows it (a skill folder's backup is a folder).
- It goes alone: with `--remove`, `--agents`, `--allow-write`, `--no-allow-write` or `--project` it is a usage error.
- **Why `setup` and not `doctor`:** `doctor` is read-only, so it is safe to run at any time and to paste into a bug report (0035); a flag that deletes would end that. `setup` is the command that writes in the agents' folders and wrote these files; it already has the plan, the question, `--yes`, `--dry-run` and `--json`.
- A `setup` run that wrote backups ends with one more line: `repomagpie setup --delete-backups deletes them; with --keep-latest it keeps the newest of each file.` `doctor`'s backups sentence names the command too.
- `setup` itself still never deletes a backup on its own: the first one is the file as it was before `setup`.

### 3. `--remove` still backs up
`--remove` writes to a file `setup` doesn't own, through the agent's CLI or the same round-trip edit as an add. The spec's reason for a backup, a change to an existing file, holds for it as much as for an add, so it keeps one. Deleting them is now one command.

### 4. Every to-do names an action that works there
`doctor` builds each fix from what `setup` would do:
- `setup` writes the entry itself: `Run repomagpie setup.` (`again` for an entry that is there), with `--agents <id>` for an agent found by its folder only.
- `setup` can only print it (Codex CLI without its command, Claude Code without `claude`, a file with comments, trailing commas or a key written twice, a file behind a link): `Paste the entry into ~/.codex/config.toml by hand (the codex command isn't on PATH, and setup doesn't edit TOML itself); repomagpie setup --dry-run --agents codex prints it.`, or `Replace the entry in …` for one that is there.
- Hooks: in `.claude/settings.json` of the project, `Run repomagpie setup --project . …`; in `.claude/settings.local.json`, by hand, since `setup` never writes it; in a file with comments, behind a link, or where the agent's hooks are turned off, by hand with the dry run that prints the entry.
- The skill: a copy in a folder `setup` doesn't write (Cursor's, Copilot CLI's, Codex CLI's) is updated the way it was installed, or deleted; a shared folder that is the user's link is updated where it points.

### 5. `--yes` says when the note tool starts off
When a new entry starts without the note tool because neither flag was given and no answer was asked for, the plan says it once, `Note tool: off (repomagpie setup --allow-write turns it on).` (`off in Cursor and Gemini CLI` when other entries keep theirs), and so does the summary. `--remove` doesn't remember the choice for the next `setup`: that needs state outside the agents' files that a clean remove should leave behind, and the line makes the off state visible.

## Consequences
- On the macOS test machine, `setup --yes` sets up Claude Code only; Codex CLI, Cursor, VS Code and Copilot CLI are listed as found by their folder, unchosen. `setup --remove` still takes out the hooks the earlier run wrote for Codex CLI and Copilot CLI. `doctor` has no Codex CLI to-do there.
- A user whose agent is found by its folder only (a `cursor` command never installed from the app on Linux, say) ticks it in the multi-select or names it with `--agents`.
- Backups can be deleted in one command, after a question; nothing deletes them unasked.
- Both `--json` documents gain `found` on each agent; nothing is removed from them.
