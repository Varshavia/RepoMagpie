# 0018 — AI drafts, humans decide

**Status:** accepted (2026-10-03). Supersedes [0005](0005-human-written-usefulness.md).

## Context
[Decision 0005](0005-human-written-usefulness.md) said the user always writes "When it's useful" and the tool leaves it empty. Writing every note by hand may be the biggest risk to adoption: H1 (note-taking friction) is still open after desk research, and the v0.1 beta tests it ([decision 0014](0014-step-1-5-desk-research.md)). What sets RepoMagpie apart is the user's judgment, not the prose around it.

## Decision
- AI may draft **What it does** and **Use when** from a repository's README. Drafts are marked as drafts.
- The **Verdict** is human-only. The tool never writes it.
- A note without a Verdict stays `status: inbox`.
- In `magpie import`, an explicit `verdict:` in the line counts as human-written.

## Consequences
- The note schema's ownership and status rules change to match (note schema v1).
- How a draft is marked, and how it stops being a draft, is defined in the note schema.
- Search keeps ranking `inbox` notes below `reviewed` notes.
