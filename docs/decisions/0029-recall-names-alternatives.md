# 0029 — Recall names alternatives

**Status:** accepted (2026-10-08). Builds on [0027](0027-alternatives-active.md) (the `alternatives` relation) and [0024](0024-recall-asks-on-avoid-notes.md) (the hook asks on avoid notes); changes neither.

## Context
When the agent is about to install pdfkit, the hook says the user noted to avoid it. It doesn't say what to use instead, even when the journal knows: v0.2 part 1 made `alternatives` an active field, and one side of the relation is enough ([0027](0027-alternatives-active.md)).

A note is shown before a decision in four places: `magpie recall`, the Claude Code hook, `magpie suggest` and "Check a package" in the local app. Each of them is the moment the user could pick another package, so each should name the alternatives the user already wrote down.

The roadmap's part 3 said "alternatives and neighbours". Same-tag notes and `[[links]]` in the body are related, but they don't answer "what should I use instead?". At install time they add noise and no decision.

## Decision
- **Only the `alternatives` field counts, from both sides.** The alternatives of X are the targets in X's own `alternatives`, plus every note in the same journal that lists X in its `alternatives`. Same-tag notes and `[[links]]` are not shown. The Verdict's free text ("use puppeteer") is never parsed.
- **Resolved within the same journal, with the link rules:** the file stem, then a unique name, ignoring case ([glossary](../glossary.md): link). An unresolved target, missing or ambiguous, is still shown by the name as written, with no Verdict. A target that has a note only in the other journal is unresolved: alternatives don't cross journals.
- **Each alternative shows:**
  - its name;
  - its Verdict, or `[inbox] no verdict yet`;
  - `(you also noted to avoid it)` when it is itself an avoid note;
  - its journal and path, when it has a note.
- **Order:** reviewed alternatives that aren't avoid notes first, then inbox ones, then avoid ones, then unresolved ones; ties by name.
- **Once each.** A target named on both sides, or twice with a different case or label, counts once. A note is never its own alternative.
- **The hook still asks only on exact avoid matches** ([0024](0024-recall-asks-on-avoid-notes.md)). Alternatives never change whether it asks; they only add text. Name-only matches list no alternatives.
- **Limits:** at most 3 alternatives per match in the hook's texts and the CLI card, then `+N more`. `--json` and `--full` list them all.
- **Recording:** `magpie note <name> --alternative <target>` writes the field only from the user's words, as for the Verdict ([0018](0018-ai-drafts-humans-decide.md)). The agent offers once to record an alternative the user named ("use puppeteer instead of pdfkit") and records it only with their OK.

## Consequences
- Recall's entries carry each note's raw `alternatives`, so the recall cache's version goes up and an old cache is rebuilt once.
- Recall resolves targets with the same rules as the link index, without loading `src/core/links.ts`: the hook's chunk must stay small. The rule moves into `src/core/wikilinks.ts` (the link syntax, the `alternatives` field and the resolver; it imports nothing), and both use it. One rule in one place can't drift; a second copy with a test that the two agree would have to be kept in step by hand. The hook loads 1.8 kB more.
- `RecallMatch` gains an `alternatives` list, in `magpie recall --json`, `magpie suggest --json` (`candidates[]` and `in_use_avoid[]`) and the API. It is an addition to the JSON contract, not a breaking change ([0023](0023-api-is-the-json-contract.md)).
- The recall card gains an "Alternatives" row, the hook's prompt and context name the alternatives, and suggest's human output adds an "Instead:" line under each `in_use_avoid` item.
- `magpie note` gains `--alternative`, written through the round-trip-safe frontmatter edit, so the rest of the file stays byte for byte.
- The skill tells the agent to name the alternatives with their Verdicts, ask whether to install one instead, recall it before installing, and never pick one for the user.
- The roadmap's part 3 item says "alternatives", not "alternatives and neighbours".
