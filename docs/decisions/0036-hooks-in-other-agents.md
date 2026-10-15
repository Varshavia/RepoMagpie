# 0036 — The hook in agents that can't ask

**Status:** accepted (2026-10-15, decided by the maintainer). Refines [0024](0024-recall-asks-on-avoid-notes.md) ("magpie never denies") for agents without a working ask, and [0035](0035-setup-and-doctor.md) (what `setup` writes) for their hook entries. Both stay as written; their index rows point here. Agent facts, with sources and dates: [agents](../agents.md).

## Context
The Claude Code hook is the backstop when an agent skips the check before an install. In the Windows live test (2026-10-15), the MCP tools and the skill made Claude Code call `recall` before installing pdfkit; when the maintainer then said "install pdfkit anyway", the hook's prompt caught it. Every other agent gets the MCP entry and the skill from `setup`, but no backstop.

Five more agents have a hook that runs before a shell command. Checked on 2026-10-15 ([agents](../agents.md#hooks-what-an-adapter-could-do)):

| Agent | Event | Can it ask? |
|---|---|---|
| Antigravity CLI | `PreToolUse`, matcher `run_command` | yes: `ask`, and `force_ask`, which ignores cached permissions |
| Copilot CLI | `preToolUse` | yes (the cloud agent treats `ask` as `deny`) |
| Codex CLI | `PreToolUse`, `Bash` | no: `ask` is "parsed but not supported yet", and the call goes on |
| Gemini CLI | `BeforeTool`, matcher `run_shell_command` | no: `allow` or `deny` only |
| Cursor | `beforeShellExecution` | in the schema, but not reliably: the forum reports `ask` running the command unasked (2.4.21, a known issue), and ignored in Auto-review (3.21.16); Cursor staff suggest `deny` instead |

Informing alone doesn't stop the install in those three: Codex's `additionalContext` reaches the model after the call, Gemini CLI's agent never sees `systemMessage`, and Cursor's `ask` may let the command run. Security hooks for Codex and Cursor deny with a reason and give context otherwise (Skylos, a memory tool's Codex design, the Cursor forum's workaround). Their overrides are permanent allowlists or turning the hook off; none found lets the user go ahead once.

## Decision

### On an exact match of an avoid note
"Exact match" and "avoid note" are as in 0024: the install names the note's package exactly, and its Verdict starts with "avoid" or its "Avoid when" section has content. A name-only match only informs, everywhere.

- **The agent can ask** (Claude Code, Antigravity CLI, Copilot CLI): the hook asks, as in 0024. Antigravity CLI gets `force_ask`, so a user's "Always allow `npm install`" doesn't skip the note.
- **The agent can't ask, or not reliably** (Codex CLI, Gemini CLI, Cursor): **the hook denies the first try and lets the same command through on the next.**
  - **The first time,** it denies. The reason, written for the agent, holds the note under [0032](0032-note-text-is-data.md)'s rules (quoted, labelled with whose journal it is, cleaned, capped), then the hook's own advice: show the user this note and ask whether to install anyway or use an alternative; if the user says to go ahead, run the same command again, unchanged, within 10 minutes.
  - **The user also gets a short line** where the agent shows one (Codex's `systemMessage`, Gemini CLI's `systemMessage`, Cursor's `user_message`), for example: `RepoMagpie: stopped npm install pdfkit once: you noted to avoid pdfkit. Your agent should ask you; the same command within 10 minutes goes through.` The pre-check's answers decide the final wording of both texts.
  - **The same command** (same agent, same folder, same command text) within 10 minutes is let through once, then forgotten. It informs like any other match.

**Why not deny every time:** a note is the user's preference, not a security rule. The user must be able to go ahead without editing the note.

### Rules for every adapter
- **Never approves.** An adapter never returns a decision that skips the agent's own confirmation: not `allow` where `allow` means approve, not Antigravity's `auto_approve`, not Codex's `allow` with `updatedInput`. When it only informs, it leaves the decision out if the agent allows that. Where the agent needs one (Antigravity CLI requires `decision`; its `allow` delegates "to the next hook or default policy"), a check on a real agent must show that the agent still asks the user exactly as it does without the hook. **If an adapter can't meet this, it isn't shipped for that agent:** `setup` writes nothing for it, and [agents](../agents.md) says why. That includes Cursor, if its `{}` or empty answer turns out to skip the user's approval.
- **Never exits 2, and fails open.** Any error means no output and exit 0, logged as today. This matters more than for Claude Code: Copilot CLI denies the call on any non-zero exit or a crash, and Gemini CLI blocks on every non-zero exit but 1.
- **`--inform-only` works for every adapter** (unattended runs): it never denies and never asks.
- **The retry record:**
  - It lives in the personal journal's `.cache/` (`hook-retry.json`).
  - Each entry is a SHA-256 of the agent, the folder and the command, with a time. The file holds no command text.
  - Entries older than 10 minutes are dropped on each write. Writes are atomic, and never through a link ([0032](0032-note-text-is-data.md), rule 5).
  - **If the record can't be read or written, the adapter informs instead of denying.** A deny without a record would stop the retry too.
- **Timeout:** where the agent's format has one, `setup` sets it to 10 seconds, so a stuck hook doesn't hold the agent for Codex's default 600 s.

### What `setup` writes (refines 0035)
- **Each agent's hook entry is ours only**, edited as 0035's JSON edits are: a backup first, read back after, refused for a file it can't round-trip.
- **Never an agent-wide switch.** If an agent's hooks are turned off (Codex's `[features] hooks = false`, Gemini CLI's `hooksConfig.enabled: false`), `setup` says so and changes nothing.
- **Codex trust:** Codex skips a new or changed hook until the user trusts it in `/hooks`. Codex keeps that trust in `config.toml` (`[hooks.state."<file>:pre_tool_use:<group>:<handler>"]`, `trusted_hash`), so `doctor` can report whether our entry is trusted; `setup`'s summary says how to trust it. `setup` never writes a trust entry and never suggests `--dangerously-bypass-hook-trust`.
- **Copilot CLI:** any non-zero exit denies the call. If node or the entry file moves, every tool call is denied until `setup` runs again. `doctor` lists a broken Copilot CLI hook path as its first to-do, and the docs say so.
- **The hook's own file for Copilot CLI** is `~/.copilot/hooks/repomagpie.json`. VS Code reads that folder too and maps Copilot CLI's format to its own; whether one file serves both is decided by what VS Code sends it (piece 6 of the brief).
- **How each agent starts the hook command:** every agent but Claude Code takes one command string, run through a shell: Gemini CLI through PowerShell on Windows (its source), Codex through the session's shell or `%COMSPEC% /C` (its source), the others not documented. `setup` writes the fastest form that works with `C:\Program Files\nodejs\node.exe`, measured on Windows as 0035 did for Claude Code (median of 20), with the numbers in [agents](../agents.md).

## Consequences
- An install of a package the user noted to avoid now needs one more step in every agent with a hook: a prompt where the agent can ask, a stopped first try and a retry where it can't.
- In Codex, Gemini CLI and Cursor the agent sees the note before the install, as a tool error, and the user sees a line saying the retry will go through. An agent that retries on its own without asking gets through on the second try; the deny reason tells it not to, and the user's line says what happened.
- The retry record is a new file in `.cache/`: hashes and times, no command text. `SECURITY.md` says what it holds.
- `setup` and `doctor` write and check five more hook entries; `setup` and `doctor` learn Antigravity CLI and Copilot CLI for the MCP entry and the skill too.
- The spec's section 6 becomes the hook contract for every agent: one table of input and output per agent, the retry rule, the "never approves" rule and the exact texts.
- [0024](0024-recall-asks-on-avoid-notes.md) and [0035](0035-setup-and-doctor.md) stay as written; their index rows point here.
