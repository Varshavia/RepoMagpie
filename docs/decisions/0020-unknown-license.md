# 0020 — Unknown licence

**Status:** accepted (2026-10-03)

## Context
When `magpie note <url>` finds no licence through the GitHub API, the note schema so far recorded `none`. Some repositories state a licence only in the README or in `SKILL.md` files; `vercel-labs/agent-skills`, for example, says MIT in its README but has no LICENSE file ([seed repositories](../seed-repos.md)).

## Decision
- When no licence is found, the tool records `unknown`, never `none`.
- A wrong "no licence" is worse than no answer. The user can replace `unknown` after checking.

## Consequences
- `unknown` joins the allowed values of the `license` field in the note schema.
- Reading licence statements from the README or `SKILL.md` files is not part of this decision.
