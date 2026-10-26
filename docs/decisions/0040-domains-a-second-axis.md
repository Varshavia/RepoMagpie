# 0040 — Domains: a second axis on a note

**Status:** accepted (2026-10-25, from [RFC 0001](../rfcs/0001-domains-tags-and-search.md)'s Phase 1; D1 and D2 decided by the maintainer on 2026-10-24, D4 proposed here as the RFC asked). Adds to [0030](0030-github-topics-become-tags.md), whose `kind` and tags stay as written; keeps [0009](0009-positioning-dependency-memory.md)'s positioning.

## Context
Questions name concerns ("how should database security work?"); notes name packages. A note on `supabase` that says "enable RLS on every table" shares no word with that question, and in Turkish it shares none with any question. `kind` says what a thing is (0030), and tags mix concerns with technologies, so neither can be a filter by concern.

RFC 0001 proposed a fixed vocabulary of concerns on every note. The maintainer decided:
- **D1:** notes stay about packages and repositories;
- **D2:** the RFC's 12 domains, named `domains`;
- **D4:** how a suggested domain is written was left to this record.

## Decision
1. **Notes stay about packages and repositories (D1).** A rule about a package goes in its note ("How to use", "Avoid when"); a general project rule stays in CLAUDE.md or AGENTS.md. No command creates a note without a package or repository identity. Domains make package notes findable by concern; they don't make RepoMagpie a store of rules.
2. **The vocabulary (D2):** `architecture`, `security`, `performance`, `styling`, `database`, `testing`, `auth`, `api`, `devops`, `observability`, `ai`, `tooling`, each with a one-line definition, fixed in `src/core/domains.ts` and listed in [note-schema](../note-schema.md). It isn't user-editable, so every journal, team and agent shares it. A later release may add a domain; renaming or removing one needs a migration and a new record.
3. **Two fields (D4):**
   - `domains`: the domains the user confirmed, at most 3. Only the user writes them: `repomagpie note <x> --domain <d>`, the app, or the MCP `note` tool's `domains`, which an agent passes only when the user confirmed them in the conversation (0018).
   - `domains_suggested`: the domains RepoMagpie suggested, at most 3, written only by RepoMagpie and never by an agent.
   - Confirming a suggested domain moves it from `domains_suggested` to `domains`. Removing one deletes it from whichever field holds it. An emptied field stays as `[]`, so `repomagpie domains --suggest` doesn't fill it again.
   - Both are flow lists after `tags`, written only when not empty.

   Two fields instead of a marker on each value: each stays a plain YAML list that every Markdown tool, Obsidian and the round-trip rules (spec §9) read as they read `tags`, and "suggested" can't be lost when a value is copied.
4. **Suggestion** is deterministic: a table of topics and tags that clearly name a concern (`DOMAIN_MAP`, about 180 rows, each tested), read through the tag aliases ([0041](0041-structured-search.md)). A word that names a technology without naming what it is for (`react`, `supabase`) maps to nothing; so does a word that could mean two concerns (`validation`). It fills `domains_suggested`:
   - at creation: `repomagpie note`, `repomagpie import`, the app's Add and the MCP `note` tool. Never `domains`;
   - on existing notes, with `repomagpie domains --suggest [--journal …] [--dry-run] [--json]`, only on notes that have neither field. It never removes and never touches `domains`; it shows the plan first, asks in a terminal, and a second run changes nothing.
5. **Unknown values** (a typo, a domain from a later release) are kept in the file, never dropped. Search, the app and agent-facing output use known values only. `repomagpie doctor` reports each as "Unknown domain in … : x. Use one of: …".
6. **Search** uses both fields; a suggested domain counts half as much as a confirmed one ([0041](0041-structured-search.md)).

## Consequences
- An existing journal needs no migration: notes without the fields read as before, and `domains --suggest` is optional.
- A note on a platform that covers more than 3 concerns keeps 3; the user picks them.
- A wrong suggestion costs little: it only boosts by default, it's shown as suggested (outlined in the app), and it's one click to confirm or remove.
- The vocabulary fits in the MCP `search` tool's schema as an enum with definitions, so an agent can map a question in any language onto it.
