# 0011 — Vet and drift: record and integrate, no scanner

**Status:** accepted (2026-10-03)

## Context
Idea 2 planned `magpie vet`, which would read `SKILL.md` and scripts and flag risky actions, and `magpie drift`, which would show what changed upstream since review ([ideas](../ideas.md)). Existing tools already do both ([strategy](../strategy.md), §5 C):
- Skill scanners: static and semantic scanning of `SKILL.md` and scripts.
- Skill lockfiles: content hashes or pinned commits that can report a changed skill.

Building another scanner would compete with them instead of adding what they lack: the user's own review.

## Decision
- RepoMagpie builds no scanner of its own.
- Vet becomes: record **your** review and the commit you reviewed in the note, and link the output of existing scanners.
- Drift becomes: compare the reviewed commit with upstream, using existing lockfiles where they exist.
- Target: v0.2.

## Consequences
- The `reviewed_commit` field stays planned for v0.2 ([note schema](../note-schema.md), "Planned fields").
- RepoMagpie makes no security claims about a package or skill. It shows what the user and their team recorded.
- Open: which scanners and lockfile formats to integrate first.
