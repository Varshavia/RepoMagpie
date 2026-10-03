# 0019 — No star import in v0.1

**Status:** accepted (2026-10-03)

## Context
Step 1.5 left open whether `magpie` should import GitHub stars as inbox suggestions ([decision 0014](0014-step-1-5-desk-research.md)). Star managers such as GithubStarsManager and Starcat already do that job ([competitors](../competitors.md)).

## Decision
- v0.1 has no star import.
- The cold start in v0.1 is `magpie import` (a list the user wrote) and `magpie init` (draft notes from a project's manifests).
- A later `magpie import --stars` into the inbox remains possible.

## Consequences
- Every note in v0.1 starts from something the user wrote or a dependency they use, not from a bulk import of stars.
