# 0036 — The hook in agents that can't ask

**Status:** accepted (2026-10-15, decided by the maintainer); revised on its branch the same day after the pre-check on real agents (Windows): Copilot CLI joins the agents that get a deny and a retry, because 1.0.98 runs a call unasked when a hook answers `ask`; the retry is by install, not by command text; adapters read shell tools only; the folder comes from the agent's input; Codex's hook entry is PowerShell and is appended last. Refines [0024](0024-recall-asks-on-avoid-notes.md) ("magpie never denies") for agents without a working ask, and [0035](0035-setup-and-doctor.md) (what `setup` writes) for their hook entries. Both stay as written; their index rows point here. Agent facts, with sources and dates: [agents](../agents.md).

## Context
The Claude Code hook is the backstop when an agent skips the check before an install. In the Windows live test (2026-10-15), the MCP tools and the skill made Claude Code call `recall` before installing pdfkit; when the maintainer then said "install pdfkit anyway", the hook's prompt caught it. Every other agent gets the MCP entry and the skill from `setup`, but no backstop.

Five more agents have a hook that runs before a shell command. Checked on 2026-10-15 in their docs and source ([agents](../agents.md#hooks-what-an-adapter-could-do)), then on a real machine ([pre-check](../agents.md#the-pre-check-on-real-agents-windows-2026-10-15)):

| Agent | Event | Can it ask? |
|---|---|---|
| Antigravity CLI | `PreToolUse`, matcher `run_command` | yes: `force_ask` showed the note in the agent's own prompt, and held after "always allow in this conversation" (1.3.5) |
| Copilot CLI | `preToolUse` | **no**: the docs say yes, but 1.0.98 ran both calls unasked when the hook answered `ask`; with no answer it asked before both |
| Codex CLI | `PreToolUse`, `Bash` | no: `ask` is "parsed but not supported yet", and the call goes on |
| Gemini CLI | `BeforeTool`, matcher `run_shell_command` | no: `allow` or `deny` only (docs and source; not tried on a machine) |
| Cursor | `beforeShellExecution` | in the schema, but not reliably: the forum reports `ask` running the command unasked (2.4.21, a known issue), and ignored in Auto-review (3.21.16); Cursor staff suggest `deny` instead. In 3.24.18 the default Run Mode, Auto-Review, ran `npm install` unasked with no hook at all |

Informing alone doesn't stop the install in those four: Codex's `additionalContext` reaches the model after the call, Gemini CLI's agent never sees `systemMessage`, Cursor's messages without a `permission` reached neither the agent nor the user, and Copilot CLI has no field for it. Security hooks for Codex and Cursor deny with a reason and give context otherwise (Skylos, a memory tool's Codex design, the Cursor forum's workaround). Their overrides are permanent allowlists or turning the hook off; none found lets the user go ahead once.

In the pre-check, a one-shot deny with the texts below made Codex, Copilot CLI and Cursor show the note and ask the user whether to install anyway, with no retry and no workaround. Two things it showed shape the retry:
- **Agents rewrite an install for the shell.** On Windows PowerShell's default execution policy blocks npm's `npm.ps1`; Codex then ran `npm.cmd install left-pad`. Told to retry "unchanged", it didn't switch to `npm.cmd` after the user said to go ahead, and the install failed.
- **Hooks fire for calls that aren't shell commands.** Copilot CLI's `preToolUse` fires for its `ask_user` tool too, whose question named the package. The pre-check script matched any text and spent the retry on that question, so the user's real retry was denied again.

## Decision

### On an exact match of an avoid note
"Exact match" and "avoid note" are as in 0024: the install names the note's package exactly, and its Verdict starts with "avoid" or its "Avoid when" section has content. A name-only match only informs, everywhere.

- **The agent can ask** (Claude Code, Antigravity CLI): the hook asks, as in 0024. Antigravity CLI gets `force_ask`, so a user's "Always allow `npm install`" doesn't skip the note.
- **The agent can't ask, or not reliably** (Codex CLI, Gemini CLI, Cursor, Copilot CLI): **the hook denies the first try and lets the same install through on the next.** The Copilot CLI adapter never answers `ask`.
  - **The first time,** it denies. The reason, written for the agent, holds the note under [0032](0032-note-text-is-data.md)'s rules (quoted, labelled with whose journal it is, cleaned, capped), then the hook's own advice: show the user this note and ask whether to install anyway or use an alternative; if the user says to go ahead, install the same package again within 10 minutes, and RepoMagpie lets that install through once. It never says "unchanged".
  - **The user also gets a short line** where the agent shows one (Codex's `systemMessage`, Gemini CLI's `systemMessage`, Cursor's `user_message`), for example: `RepoMagpie: stopped npm install pdfkit once: you noted to avoid pdfkit. Your agent should ask you; the same install within 10 minutes goes through.` Copilot CLI has no such field; it shows the user the deny reason itself ("Denied by preToolUse hook: …").
  - **The same install** within 10 minutes is let through once, then forgotten. It informs like any other match. "The same install" is the same agent, the same folder and the same detected installs: the package manager and the sorted package names. So `npm install left-pad`, `npm.cmd install left-pad`, `& npm install left-pad` and `npm.ps1 install left-pad` are one install.

The pre-check's answers fix the wording of both texts above; spec section 6 holds the final ones.

**Why not deny every time:** a note is the user's preference, not a security rule. The user must be able to go ahead without editing the note.

**Why by install, not by command text:** on Windows the agent, or the user asking again, may run the install in another form than the one denied. Matching the text would deny the user's go-ahead.

### Rules for every adapter
- **Never approves.** An adapter never returns a decision that skips the agent's own confirmation: not `allow` where `allow` means approve, not Antigravity's `auto_approve`, not Codex's `allow` with `updatedInput`, and not Copilot CLI's `ask`, which 1.0.98 treats as approval. When it only informs, it leaves the decision out if the agent allows that. **If an adapter can't meet this, it isn't shipped for that agent:** `setup` writes nothing for it, and [agents](../agents.md) says why. The pre-check showed every adapter can meet it: with no output, or Cursor's messages without a `permission`, each agent asked exactly as it does without the hook. Antigravity CLI 1.3.5 accepted no output, although its docs call `decision` required.
- **Shell tools only.** An adapter reads Codex's `Bash`, Copilot CLI's `powershell` and `bash`, Antigravity CLI's `run_command`, Gemini CLI's `run_shell_command` and Cursor's `beforeShellExecution`, and prints nothing for any other tool.
- **Print only what reaches someone.** On a plain match, Antigravity CLI's `allow` with a `reason` and Cursor's messages without a `permission` reached neither the agent nor the user, and Copilot CLI has no field for it: those adapters print nothing. Codex's `additionalContext` reached the model after each call, and its `systemMessage` showed in the transcript.
- **The folder comes from the agent's input** (`cwd`; Antigravity CLI's `toolCall.args.Cwd`), never from the process. Antigravity CLI started the hook in `~/.gemini/config`, Cursor in `~/.cursor`.
- **Never exits 2, and fails open.** Any error means no output and exit 0, logged as today. This matters more than for Claude Code: Copilot CLI denies the call on any non-zero exit or a crash, and Gemini CLI blocks on every non-zero exit but 1.
- **`--inform-only` works for every adapter** (unattended runs): it never denies and never asks.
- **The retry record:**
  - It lives in the personal journal's `.cache/` (`hook-retry.json`).
  - Each entry is a SHA-256 of the agent, the folder and the install (the package manager and the sorted package names), with a time. The file holds no command text and no package names.
  - Entries older than 10 minutes are dropped on each write. Writes are atomic, and never through a link ([0032](0032-note-text-is-data.md), rule 5).
  - **If the record can't be read or written, the adapter informs instead of denying.** A deny without a record would stop the retry too.
- **Timeout:** where the agent's format has one, `setup` sets it to 10 seconds, so a stuck hook doesn't hold the agent for Codex's default 600 s.

### What `setup` writes (refines 0035)
- **Each agent's hook entry is ours only**, edited as 0035's JSON edits are: a backup first, read back after, refused for a file it can't round-trip.
- **Never an agent-wide switch.** If an agent's hooks are turned off (Codex's `[features] hooks = false`, Gemini CLI's `hooksConfig.enabled: false`), `setup` says so and changes nothing.
- **Codex trust:** Codex skips a new or changed hook until the user trusts it; it asked at start for each one in the pre-check. Codex keeps that trust in `config.toml` (`[hooks.state."<file>:pre_tool_use:<group>:<handler>"]`, `trusted_hash`). The key is the entry's position, so `setup` appends our group last and never reorders the file. `doctor` computes our entry's hash and says "not trusted yet" when it doesn't match; `setup`'s summary says how to trust it. `setup` never writes a trust entry and never suggests `--dangerously-bypass-hook-trust`.
- **Copilot CLI:** any non-zero exit denies the call. If node or the entry file moves, every tool call is denied until `setup` runs again. `doctor` lists a broken Copilot CLI hook path as its first to-do, and the docs say so.
- **The hook's own file for Copilot CLI** is `~/.copilot/hooks/repomagpie.json`. VS Code reads that folder too and maps Copilot CLI's format to its own; the pre-check didn't test VS Code, so whether one file serves both is still open (piece 6 of the brief).
- **How each agent starts the hook command:** every agent but Claude Code takes one command string, run through a shell. On Windows (pre-check): Codex through Windows PowerShell 5.1 with `-NoProfile`, Copilot CLI through `powershell.exe -nop -nol -c`, Cursor through Windows PowerShell with the input piped in, Antigravity CLI through `cmd /c`; Gemini CLI through PowerShell (its source). So the PowerShell entries call node with `&`: `& "C:\Program Files\nodejs\node.exe" …`. `setup` writes the fastest form that works, measured on Windows as 0035 did for Claude Code (median of 20), with the start-up time each adds per tool call in [agents](../agents.md).

## Consequences
- An install of a package the user noted to avoid now needs one more step in every agent with a hook: a prompt in Claude Code and Antigravity CLI; a stopped first try and a retry in Codex, Gemini CLI, Cursor and Copilot CLI.
- In those four the agent sees the note before the install, as a tool error, and the user sees a line saying the retry will go through. An agent that retries on its own without asking gets through on the second try; the deny reason tells it not to, and the user's line says what happened.
- In Cursor's default Auto-Review, and in Codex when its sandbox lets an install run, the agent asks nobody before `npm install`. There the deny is the only thing that stops it.
- Install detection learns the forms agents use on Windows: `npm.cmd`, `npm.ps1`, `npx.cmd`, `pnpm.cmd`, `yarn.cmd`, `bun.exe` and PowerShell's call operator `& npm …`, with tests from the captured commands.
- If a later Copilot CLI honours `ask`, moving it back to the agents that ask needs a new record (once this one is merged) and a check on a real machine. A bug report for github/copilot-cli is drafted for the maintainer to file.
- The retry record is a new file in `.cache/`: hashes and times, no command text. `SECURITY.md` says what it holds.
- `setup` and `doctor` write and check five more hook entries; `setup` and `doctor` learn Antigravity CLI and Copilot CLI for the MCP entry and the skill too.
- The spec's section 6 becomes the hook contract for every agent: one table of input and output per agent, the retry rule, the "never approves" rule and the exact texts.
- [0024](0024-recall-asks-on-avoid-notes.md) and [0035](0035-setup-and-doctor.md) stay as written; their index rows point here.
