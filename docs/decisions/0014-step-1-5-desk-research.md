# 0014 — Close step 1.5 with desk research instead of interviews

**Status:** accepted (2026-10-03)

## Context
Roadmap step 1.5 planned at least three real developer interviews ([validation](../validation.md)). None were run. The earlier user-level signals are synthetic: hypotheses H1–H4 and interview S1 are not evidence. The maintainer decided not to run interviews.

## Decision
- Step 1.5 is closed with desk research: surveys, papers, incident reports, articles and forum threads, recorded per question in [validation.md](../validation.md), "Desk research". It is secondhand evidence, from self-selected sources, about people who are not RepoMagpie's users.
- Hypothesis status after desk research: H1 open, H2 real but crowded, H3 supported, H4 confirmed (secondhand).
- H1 (note-taking friction) will be tested by the v0.1 beta instead of by interviews.
- The two step 1.5 decisions that are still open, softening [0005](0005-human-written-usefulness.md) (AI suggests, human confirms) and importing stars as inbox suggestions, move to step 2.

## New insight
Decision-record practice says a routine library choice does not warrant an ADR ([Catio, 2026](https://www.catio.tech/blog/architecture-decision-record)), and teams still end up unable to answer "why did we choose X?". Library-level decisions fall below the ADR threshold. That is the gap the project journal ([0013](0013-two-journal-scopes.md)) fills: a one-line verdict in `.magpie/`, where a full decision record would be too heavy.

## Consequences
- The roadmap marks step 1.5 done; step 2 is next.
- Positioning ([0009](0009-positioning-dependency-memory.md)) and v0.1 scope ([0010](0010-v0-1-scope.md)) rest on desk research, not on users. The v0.1 beta is the first contact with users.
- The v0.1 beta goes to early testers, since there are no interviewees.
- The interview plan and questions stay in `validation.md` for reference.
