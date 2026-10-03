# 0016 — Journal locations and config resolution

**Status:** accepted (2026-10-03)

## Context
[Decision 0013](0013-two-journal-scopes.md) set up two journals, a personal one and a project one, and left it to step 2 to decide where they live and how `magpie` finds them.

## Decision
- **Personal journal:** `~/.magpie/` by default (Windows: `%USERPROFILE%\.magpie`), the same convention as `~/.claude`.
- **Project journal:** a `.magpie/` folder, found by walking up from the working directory the way git finds `.git`. The walk stops at the git root or the filesystem root.
- **Precedence** for the personal journal location: command-line flag > `MAGPIE_HOME` environment variable > config file (`~/.magpie/config.yaml`) > default.
- Considered and rejected for v0.1: XDG base directories. They differ per operating system and are harder to explain.

## Consequences
- The walk-up must never treat the personal journal as a project journal. Without a git root, a walk from a folder under the home directory would otherwise find `~/.magpie/`.
- Decision 0003 still holds: this repository contains only the example vault.
- Details (flag names, the config file's keys, a flag to point at a project journal) are defined in the spec.
