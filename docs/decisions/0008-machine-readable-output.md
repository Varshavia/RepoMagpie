# 0008 — Machine-readable output for every command

**Status:** accepted (2026-10-03)

## Context
[Decision 0002](0002-cli-first.md) says CLI output must be concise and parseable, and to consider a `--json` flag. Agents are main users of the CLI: through RepoMagpie's `SKILL.md` and through the proactive recall hook ([ideas](../ideas.md), idea 1). Parsing text written for humans breaks when the wording changes.

## Decision
- Every `magpie` command offers a machine-readable mode, for example `--json`.
- Human-readable output stays the default.
- The exact flag and output format are defined in the spec (roadmap step 2).

This extends 0002; it does not supersede it.

## Consequences
- `SKILL.md` and agent hooks use the machine-readable mode.
- The machine-readable output is a public interface. Changing it needs the same care as changing a command.
- Tests cover both output modes.
