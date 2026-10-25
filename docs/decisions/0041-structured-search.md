# 0041 — Structured search: domains, tags, aliases and `why`

**Status:** accepted (2026-10-25, from [RFC 0001](../rfcs/0001-domains-tags-and-search.md)'s Phase 1 and the structured part of Phase 2). Uses [0040](0040-domains-a-second-axis.md)'s domains; changes what `search --tag` does (spec §2); adds a read-only tool to [0034](0034-the-mcp-server.md)'s server.

## Context
Search matched words only (spec §5). A question about a concern found a note only when the note shared its words, and a technology only under the spelling the note used: `postgres` missed a note tagged `postgresql`. `--tag` was a filter that kept only notes with every tag given, and a result didn't say why it matched.

RFC 0001 proposed that the agent, which is the LLM, turns a question into domains, tags and words, and that RepoMagpie ranks with those. The weights were starting points, to be tuned on the expanded retrieval eval and recorded here.

## Decision
1. **Tag aliases.** A `tags.md` line may give other spellings in parentheses after the tag: `` - `postgresql` (postgres, psql) — the PostgreSQL database ``. A release without aliases reads the line as before.
   - A starter list of 34 tags ships in code (`src/core/tag-aliases.ts`): well-known spellings only, none of them a common English word (`next`, `node`, `go`, `express` and `pg` are left out).
   - `tags.md` wins: a tag whose line gives aliases keeps only those; a spelling `tags.md` lists as its own tag is never an alias.
   - Aliases apply when a topic becomes a tag (0030), in `--tag`, in search's tag matching, and in query expansion. A query word expands only when it is exactly an alias, never a part of one.
   - `repomagpie tags --merge <from> <to> [--journal …] [--dry-run] [--json]` rewrites `from` to `to` in every note of a journal (no duplicate when a note has both; the order kept), adds `from` as an alias on `to`'s `tags.md` line and removes `from`'s own line. It shows the plan first and asks in a terminal.
2. **The query.** `repomagpie search "<q>" [--domain d]... [--tag t]... [--kind k] [--match boost|filter]`, and the same inputs on the MCP `search` tool (`domains`, `tags`, `match`) and the app's `/api/search`.
   - `boost`, the default: domains and tags raise the notes that have them, and a note that has one is a candidate even without the query's words.
   - `filter`: only notes with at least one requested domain or tag.
   - **This changes `--tag`:** it was a filter keeping notes with every tag; it's now a boost, and `--match filter` keeps notes with any of them.
   - A note found by domains or tags alone is a result; its skill lines (0006) come only with words.
3. **The score:** `L + 0.30 · D + 0.25 · T`.
   - L: the lexical score, normalised to 0..1 over every lexical hit. MiniSearch's field boosts, prefix and fuzzy settings stay as spec §5 has them; the RFC's Phase 2 field changes aren't made.
   - D: the share of requested domains the note has, 1 each when confirmed, 0.5 when only suggested.
   - T: the share of requested tags it has, 1 each by name or alias, 0.5 for a near spelling (one edit apart, both 5 letters or more).
   - Reviewed notes still come before inbox notes (spec §5); the project's result still sits next to the personal one (spec §3).
4. **The weights**, chosen on the eval's tuning split only (41 of 82 needs; the structured run, no Use when), from a grid of domain 0, 0.15, 0.30, 0.45, 0.60 and tag 0, 0.10, 0.25, 0.40:
   - tag 0.25 is best with any domain weight from 0 to 0.45 (MRR 0.919); the structured query with neither weight gives 0.894;
   - the domain weight doesn't change MRR in that range; 0.60 lowers it a little (0.915). It stays at the RFC's 0.30, which gives a note found by its domain alone a score above zero;
   - the defaults stay: 0.30, 0.25, and a suggested domain at half.

   Results on the held-out split (41 needs):

   | Run | recall@5 | recall@10 | MRR |
   |---|---|---|---|
   | today (the need as the query, no aliases) | 30/41 | 34/41 | 0.62 |
   | aliases | 30/41 | 34/41 | 0.61 |
   | structured (domains, tags, query) | 41/41 | 41/41 | 0.92 |
   | structured, with one Use when item a note | 41/41 | 41/41 | 0.93 |

   By category, all 82 needs, MRR today → structured: concern 0.26 → 0.97, Turkish 0.39 → 0.95, use case 0.66 → 0.84, technology 0.97 → 0.91.

   The structured forms were written with the needs, by the same author, so they are an upper bound on what an agent sends; [idea 17](../ideas.md#17-measuring-skill-compliance)'s eval measures the agent's side.
5. **`why`.** Each result gains `domains`, `domains_suggested` (known values only) and `why: { domains, tags, words }`: the requested domains and tags the note has (a near spelling under the note's own tag) and the query's words found in it. It's in the shared document (spec §2); the app shows it as "Matched: …".
6. **MCP.**
   - `search`'s `domains` is an enum of the 12 values, with each definition in the schema. Its description tells the agent to map the question onto domains whatever language the user writes in, pass the technologies as tags, and write `query` in the notes' language.
   - `max_chars` caps the answer's JSON: results are dropped whole from the end, then `rest` names the ones left out (at most 500 characters), as the hook does (spec §6).
   - A new read-only tool, `vocabulary`: the domains with definitions, and the journals' tags with note counts and aliases, most used first (at most 500). It has no CLI command: `repomagpie tags` lists the tags for people.
   - The `note` tool gains `domains`: only the ones the user confirmed (0040).
   - A value outside the enum is refused by the schema, never stored.
7. **Budgets:** structured search and `vocabulary` are in `npm run bench`, within search's budgets (spec §7). The hook and `recall` don't use domains, tags or aliases for matching: they match exact identities.

## Consequences
- A concern question finds its notes in any language the agent can map, without a model inside RepoMagpie. On the held-out split, recall@5 goes from 73 % to 100 %; concern and Turkish questions gain most.
- Technology questions lose a little (MRR 0.97 → 0.91), while recall stays 20/20. The cause isn't measured; a likely one is that a tag boost also lifts other notes with the same tag.
- A script that relied on `--tag` as an every-tag filter adds `--match filter`, which now means any tag. The CHANGELOG says so.
- Aliases fix spellings in tags; on their own they don't move the eval (its needs rarely use a bare alias), so the gain comes from the structured form.
- The search index carries domains (cache version 4), and the note list carries them for the app (version 3); both rebuild once.
- Phase 3 (semantic search) is decided later, with these numbers as the baseline (RFC D3).
