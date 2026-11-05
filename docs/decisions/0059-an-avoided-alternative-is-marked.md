# 0059 — An avoided alternative is marked

**Status:** accepted (2026-11-05, from the maintainer's brief for `feat/mcp-registry`). Changes [0029](0029-recall-names-alternatives.md) in two places: its avoid mark reads both journals, and its words. How alternatives are found, resolved, ordered and capped stays 0029's.

## Context
Seen in testing on `0.2.0`: the project journal's note on date-fns listed moment in its `alternatives`, and moment's own project note said to avoid it. When date-fns was installed, the hook's line for the user read:

```
RepoMagpie: date-fns (project journal): "default for dates in new projects". Alternatives: "moment"
```

That reads as a recommendation of moment. Two gaps made it:

- **The line for the user dropped the mark.** 0029's mark, "(you also noted to avoid it)", reached the agent's text and the permission prompt, but not the hook's short line for the user (`systemMessage`).
- **The mark read one journal.** 0029 resolves an alternative in the note's own journal only, so moment's avoid note in the other journal was never seen: a project note's alternative that you noted to avoid in your personal journal had no mark at all.

0029's words, "you also noted to avoid it", are also wrong for a project note, which the team wrote, not you.

## Decision
- **The mark reads both journals.** An alternative is marked when either journal has an avoid note on it ([0024](0024-recall-asks-on-avoid-notes.md)'s rule: a Verdict that starts with "avoid", or Avoid when text). A note on it is found the same way in both: the same `id` when the alternative has a note in its own journal, else its name as written, by the link rules (file stem, then a unique name). Nothing else crosses journals: an alternative with no note in its own journal stays unresolved there, with no Verdict and no path, as 0029 says; it just carries the mark.
- **The data:** each alternative in `recall --json`, `suggest --json`, the MCP tools and the API gains `avoid_in`, the journals whose note on it is an avoid note, project first (`[]` when none). `avoid` is now `true` when `avoid_in` isn't empty. Both are additions to the JSON contract's shape and meaning in the direction of caution, not breaking changes ([0023](0023-api-is-the-json-contract.md)).
- **The words for people,** wherever alternatives are shown (the hook's line for the user, the recall card, suggest's Instead line, the app's Check a package and Suggest): after the name, `(your notes say avoid)`. For example `Alternatives: "moment" (your notes say avoid)`.
- **The words for the agent** (the hook's context and the permission prompt) say which journal: "you also noted to avoid it" or "this journal also says to avoid it" for the match's own journal, as before, and "your personal journal says to avoid it" or "this project's journal says to avoid it" for the other one.
- **The alternative stays listed.** The note's author wrote it; the mark only says what the journals say about it. The order is 0029's: an avoided alternative sorts with the avoid ones, an unresolved one stays last.
- **The hook still asks only on exact avoid matches** (0024, 0029). A marked alternative adds text and never changes whether it asks.

## Consequences
- Six of the Claude Code hook's golden cases change, each only in the user's line, which gains the mark. The agent's text is byte for byte the same where both notes are in one journal.
- Recall reads the other journal's notes for each alternative it lists. Each journal's avoid ids are kept in 0029's alternative index, built once per journal read; the hook loads no new module.
- `docs/spec.md` (recall's `--json`, the card) and the skill name `avoid_in`.
