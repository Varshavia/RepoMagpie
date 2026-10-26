# 0042 — The Stop reminder: an opt-in nudge to offer a note

**Status:** accepted (2026-10-25). Adds to [0035](0035-setup-and-doctor.md) (a second entry `setup` writes in Claude Code's settings) and to the skill's "After a dependency decision" step; the PreToolUse hook ([0024](0024-recall-asks-on-avoid-notes.md), [0036](0036-hooks-in-other-agents.md)) is unchanged.

## Context
The skill asks the agent to offer a note at the end of a task that chose, replaced or dropped a dependency. Agents often skip that step: the task is done, the answer is written, and the offer is the last thing the skill asks. The pre-check (2026-10-15) saw agents run `recall` before an install every time, but saw no offer after one unless the user asked.

Claude Code runs a `Stop` hook when the agent finishes its turn. The hook gets the session's transcript path, and its answer can make the agent continue ([agents](../agents.md), checked 2026-10-25). A hook there can see what was installed or removed, and remind the agent before the user reads the answer.

The trade-off: a reminder makes the agent continue, which costs a model turn and can add a question the user didn't want. Done badly, it turns the agent into a nag at every stop.

## Decision
1. **`repomagpie hook claude-code-stop`** reads the Stop input and the transcript, and answers at most once per session. It reminds only when all of these hold:
   - the session ran a Bash or PowerShell command that installs or removes a named package (the install detector of spec §6, and a removal detector with each tool's verbs: `npm uninstall`, `pip uninstall`, `cargo remove`, …), and that command didn't fail;
   - the change came after the agent's last mention of RepoMagpie, its last `note` call (MCP or CLI), and its last message;
   - at least one of those packages has no note in the user's journals (`recall`'s matching);
   - `stop_hook_active` isn't `true`, the event is `Stop` (not `SubagentStop`), and the input isn't Cursor's;
   - this session wasn't reminded before.
2. **The answer is `hookSpecificOutput.additionalContext`, not `decision: "block"`.** Claude Code's docs: additional context is "shown in the transcript as hook feedback rather than a hook error", and goes through the same loop protections as a block. A block would show the user an error for what is a reminder. The text names the packages (parsed from the command, cut and cleaned, never text from the transcript) and leaves the choice to the agent: offer once, in the user's language, never write the Verdict; say nothing if the change was routine, the user already answered, or no user is there.
3. **Once per session.** The session id is kept as a SHA-256 hash in `<personal journal>/.cache/stop-reminder.json` for 30 days, as the retry record is (0036). With no journal to record it in, the hook answers nothing: never a reminder at every stop.
4. **It fails open.** Bad input, a transcript that isn't an absolute `.jsonl` file, an unreadable file, or any error: no answer, exit 0. It reads at most the last 32 MB of the transcript, from the first whole line. No network.
5. **Opt-in, personal.** `repomagpie setup --capture-reminder` adds a `Stop` entry (no matcher; the exec form, as the hook's) to `~/.claude/settings.json`. It's off by default and never written in a project's settings (`--project` with it is a usage error): whether to be reminded is each person's choice. Once there, `setup` keeps it up to date like the hook, `--remove` takes it out, and `repomagpie doctor` reports it under "Claude Code Stop reminder".
6. **Claude Code only, for now.** Codex CLI, Cursor, Gemini CLI, Copilot CLI and Antigravity CLI each have a turn-end event that can make the agent continue ([agents](../agents.md)); none has an adapter. Their inputs and loop guards differ, and none was tried.

## Consequences
- A session that installs an unnoted package gets one extra model turn, once. Most of the time the agent then asks one question or says nothing.
- The reminder can't tell a deliberate choice from an incidental install; the agent decides, from the conversation, and the text says to stay quiet when it was routine.
- The transcript format isn't documented by Claude Code. The reader takes only what it knows (assistant `tool_use` blocks, `tool_result` errors, assistant text) and skips the rest; a format change makes it answer nothing, not wrongly.
- The budget is the hook's: under 150 ms median for a 2,000-line transcript on 2,000 notes (spec §7, `npm run bench`).
