# 0009 — Positioning: what you learned, shown before install

**Status:** accepted (2026-10-03)

## Context
The first positioning was a curated journal of repositories and skills that your coding agent can search ([vision](../vision.md)). Desk research in October 2026 ([strategy](../strategy.md), §5) found two things:
- Star managers already cover most of that. Starcat, for example, has a CLI and a local MCP service so agents can query it.
- Install-time security tools (Socket, Aikido, SafeDep and others) judge a package against global data: malware, CVEs, popularity.

Nobody shows a developer's or a team's own verdict at the moment an agent installs a package. That is the "empty square" in strategy §5 D.

## Decision
- The one-liner is: **"RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one."**
- RepoMagpie takes the empty square: *before install* × *knows you*.
- It composes with security tools and never claims to detect malware.

## Consequences
- Proactive recall ([ideas](../ideas.md), idea 1) is the core of the product. The scope that follows is in [0010](0010-v0-1-scope.md).
- `vision.md`, `competitors.md` and the README describe this positioning. The earlier candidate one-liner in `ideas.md` is replaced.
- Risk: a star manager such as Starcat could add install-time recall. RepoMagpie's answer is cross-platform plain Markdown and shared project journals ([0013](0013-two-journal-scopes.md)).
- The step 1.5 interviews may still change this record.
