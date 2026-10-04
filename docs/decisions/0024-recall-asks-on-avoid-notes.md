# 0024 — Recall asks on avoid notes

**Status:** accepted (2026-10-04). Refines [0010](0010-v0-1-scope.md)'s line "It informs and never blocks" for the Claude Code hook.

## Context
[0010](0010-v0-1-scope.md) made proactive recall inform-only: the hook returns the note as `additionalContext` for the agent and `systemMessage` for the user, and never sets a permission decision.

Checked against the [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) on 2026-10-04:
- A PreToolUse hook's `additionalContext` is "added to Claude's context alongside the tool result". The agent sees the note only after the install has run, which is too late to change its mind.
- `permissionDecision` accepts `"allow"`, `"deny"`, `"ask"` and `"defer"`. `"ask"` "prompts the user to confirm", and `permissionDecisionReason` is, for `"ask"`, "shown to the user in the permission prompt". The prompt is labelled with the hook's source (`[settings]`), and a hook's `"ask"` "also forces a permission prompt in auto mode".
- In a `-p` run where nobody can answer a prompt, Claude Code denies the call, and "Claude reads the reason in the tool result instead" (see also the [headless docs](https://code.claude.com/docs/en/headless#turn-off-permission-prompts-in-unattended-runs)).

A note that says to avoid a package is exactly the case where the user should see it before the install, not after.

## Decision
- **Avoid notes ask.** When an install matches **exactly** a note whose Verdict starts with "avoid", or whose "Avoid when" section has content, the hook returns `permissionDecision: "ask"`. A name-only match (a weaker match, possibly another package) never asks. The reason is the note: name, journal, Verdict, "Avoid when" and path. The user decides in Claude Code's own permission prompt.
- **magpie never denies.** It never returns `"deny"` and never exits with code 2. The strongest thing it does is ask.
- **Every other match informs only**, as before: `additionalContext` for the agent and `systemMessage` for the user, with no permission decision.
- **Fails open**, as before: no match, an unparsable command or any error means no output and exit 0.
- **`--inform-only` for unattended runs.** `magpie hook claude-code --inform-only` never asks; avoid notes are reported like any other match. It is the setting for unattended `-p` runs, where Claude Code would turn an ask into a denial.
- Skill mode (other clients) is unchanged: the agent runs `magpie recall` itself, before installing.

## Consequences
- An install of a package the user noted to avoid now needs one confirmation in Claude Code, including in auto mode. Other installs run as before.
- In unattended `-p` runs, where nobody can answer the prompt, Claude Code denies such an install and the agent reads the note as the reason. That is Claude Code's handling of any prompt in those runs, not a magpie block, but the effect is that the install doesn't happen. Setups for such runs use `--inform-only`.
- The spec's hook contract ([spec](../spec.md), section 6) and every doc that said "informs and never blocks" change to "asks on avoid notes, otherwise informs; never denies".
- [0010](0010-v0-1-scope.md) stays as written (it is merged); its index row points here.
