# RFC 0001: Domains, technology tags and semantic search

- **Date:** 2026-10-24
- **Origin:** the maintainer's idea 2 of 2026-10-24 ("Taxonomy and search engine optimisation: KINDS and TAGS"), [idea 13](../ideas.md#13-taxonomy-and-semantic-search), with idea 3 ([idea 14](../ideas.md#14-just-in-time-context), just-in-time context) where it touches search
- **Touches:** decisions [0001](../decisions/0001-plain-markdown-storage.md) (Markdown is the source of truth), [0006](../decisions/0006-skills-as-searchable-lines.md) (skills as searchable lines), [0009](../decisions/0009-positioning-dependency-memory.md) (positioning: dependency memory), [0018](../decisions/0018-ai-drafts-humans-decide.md) (AI drafts, humans decide), [0030](../decisions/0030-github-topics-become-tags.md) (topics become tags; kinds), [0034](../decisions/0034-the-mcp-server.md) (the MCP server); [spec](../spec.md) §5 (matching) and §7 (caches); [ideas](../ideas.md#rules-every-idea-follows) rule 6 (local-first)

## Status

Accepted in part, 2026-10-24. The maintainer's decisions on §12:

- **D1: yes.** Notes stay about packages and repositories. Rules about a package go in its note; general project rules stay in CLAUDE.md or AGENTS.md.
- **D2: the 12 domains in §4.1, and the name `domains`**, as proposed.
- **D3: decided after Phase 2's eval** (§9): whether Phase 3 happens at all, and which provider comes first.
- **D4: left to Phase 1's decision record.**

Phases: Phase 0 is built on the branch `feat/use-when-at-capture`. Phases 1 and 2 are next, and Phase 3 is later, gated by D3 ([roadmap](../roadmap.md)). Each phase that ships becomes a decision record (§13).

---

## 1. Summary

An agent asks RepoMagpie "how should database security work in this project?". Today, RepoMagpie finds a note only if that note shares words with the question. It doesn't know that the question is about **security** and **databases**, or that a note tagged `postgres` is about PostgreSQL.

This RFC adds three things, in phases, without a server, an account or a bundled model:

1. **Domains:** a fixed, small vocabulary of concerns (security, database, testing, …) on every note. It is a second axis next to today's `kind`, which says what a thing *is*. Domains are the maintainer's "KINDS".
2. **Technology tags with aliases:** tags name technologies (`postgresql`, `nextjs`, `tailwind`), and `tags.md` maps their spellings (`postgres`, `pg` → `postgresql`).
3. **Search that understands structure:**
   - **Phase 1:** the agent turns a question into domains, tags and words. The fixed domain list fits in the MCP tool's schema as an enum, so the agent can map any phrasing, in any language, onto it.
   - **Phase 2:** RepoMagpie ranks with lexical search, fuzzy matching, aliases and structured boosts.
   - **Phase 3, opt-in:** vector search through a local embedding model the user chooses, fused with lexical ranking.

**Recommendation:** do Phases 0–2 now, and decide Phase 3 with numbers from the expanded retrieval eval (§9).

---

## 2. The problem, measured

- `npm run eval:retrieval` has 22 needs in plain words over 33 public repositories (no Verdicts): search finds 18 in the top 5, suggest 17. None of its notes has a "Use when", so the words of a need appear only if the GitHub description happens to use them; the two needs that every method misses are on notes with a vague description ("A fancy self-hosted monitoring tool", "AI-Driven Development").
- **Questions name concerns, notes name packages.** "Database security" never appears in a note on `supabase` that says "use RLS on every table".
- **Spellings differ.** `postgres`, `postgresql`, `pg`; `next.js`, `nextjs`, `next`; `tailwind`, `tailwindcss`.
- **Languages differ.** The maintainer's own journal has Turkish Verdicts, and the agent may be asked in Turkish. Lexical search can't match "veritabanı güvenliği" to "database security".
- **Tags mix two things today.** GitHub topics become tags (decision 0030), and topics mix concerns (`testing`, `auth`, `pdf`) with technologies (`react`, `postgres`). One list can't serve as both a filter by concern and a filter by technology.

---

## 3. Goals and non-goals

**Goals**
- G1. An agent's question about a concern finds the notes that address it, even with no shared words.
- G2. A question about a technology finds its notes under any common spelling.
- G3. It works across languages for concerns (Phase 1) and, opt-in, for free text (Phase 3).
- G4. Results are explainable: each says why it matched (domain, tag, words, meaning).
- G5. Nothing leaves the machine; no runtime dependency in the default install; the budgets in spec §7 hold.
- G6. Existing journals keep working with no migration step required.

**Non-goals**
- **Notes that aren't about a package or repository.** "Never store secrets in localStorage" is a project rule; it belongs in CLAUDE.md or AGENTS.md. RepoMagpie stays dependency memory (decision 0009). Rules *about* a package live in its note: "Supabase: enable RLS on every table" goes in the supabase note's "How to use" or "Avoid when", and this RFC makes that findable as security + database. This is the key design decision: it delivers the idea without changing what a note is. See §12, decision D1.
- A hosted search service, accounts or sync.
- An LLM inside RepoMagpie. The agent is the LLM.

---

## 4. The model: three axes on a note

| Field | Answers | Values | Who sets it | Exists today |
|---|---|---|---|---|
| `kind` | What is it? | `library`, `cli`, `framework`, `app`, `platform`, `plugin`, `skill-pack`, `template`, `awesome-list`, `other` | rules at creation (decision 0030, 0039); the user | yes |
| `domains` | What concern does it address? | fixed vocabulary (§4.1), 0–3 per note | suggested from tags and topics at creation; the user confirms or edits | **new** |
| `tags` | Which technologies? | free, normalised through `tags.md` aliases, at most 8 | topics at creation (0030); the user | yes; **aliases are new** |

`kind` stays: suggest, adopt, the app's sidebar and the graph use it, and "what a thing is" is a real question ("which CLIs do I have?"). The maintainer's KINDS become `domains`. A different name avoids breaking every existing note and every `--kind` filter.

Example:
```yaml
id: pkg:npm/@supabase/supabase-js
kind: library
domains: [database, auth, security]
tags: [supabase, postgresql]
```

### 4.1 The domain vocabulary

It's fixed in code (`src/core/domains.ts`) and documented in note-schema; not user-editable, so every journal, team and agent shares it. It's versioned: a later RepoMagpie may add a domain, never rename or remove one without a migration.

Proposed: 12, each with a one-line definition shown to agents and users. The maintainer's six come first.

| Domain | Covers | Examples |
|---|---|---|
| `architecture` | structure, patterns, state, frameworks | NestJS, Redux, tRPC |
| `security` | vulnerabilities, secrets, hardening, validation | helmet, zod, Socket |
| `performance` | speed, caching, bundles, profiling | vite, sharp, lru-cache |
| `styling` | CSS, design systems, UI components | tailwind, shadcn/ui |
| `database` | databases, ORMs, migrations, storage | prisma, supabase, drizzle |
| `testing` | unit, end-to-end, mocking | vitest, playwright, msw |
| `auth` | sign-in, sessions, permissions | auth.js, clerk |
| `api` | HTTP, RPC, clients, servers | express, axios, hono |
| `devops` | build, deploy, CI, containers | docker, coolify |
| `observability` | logging, metrics, tracing, errors | pino, sentry |
| `ai` | LLMs, agents, embeddings, MCP | langchain, browser-use |
| `tooling` | developer tools, CLIs, docs, editors | eslint, prettier |

A note may have none. More than 3 means the note is a platform; it keeps at most 3, and the UI says so.

### 4.2 How a note gets its domains

The rules are deterministic; no model is involved.
- **At creation**, from topics and tags through a mapping table in `domains.ts`: `testing` → testing; `orm`, `database`, `postgres` → database; `oauth`, `authentication` → auth; `llm`, `ai-agents`, `mcp` → ai. They are written as **suggested**, not final: a `domains_status: suggested` key, or a draft marker in the frontmatter. Pick the representation that the round-trip rules handle best, and record it in the decision.
- **The user** confirms or edits them in the app's inbox review (chips, one click) or with `repomagpie note <x> --domain security`.
- **An agent** may propose domains with the user's OK, like a draft (decision 0018). It never confirms them itself.
- **Existing notes:** a new command, `repomagpie domains --suggest [--journal …] [--dry-run]`, like `repomagpie tags --from-topics`: it adds suggested domains to notes that have none, never removes, and shows the plan first.

Why "suggested" matters: a wrong domain is cheap, since it's only a boost (§6). But the user should see which domains are theirs, as with drafts.

### 4.3 Tag aliases

`tags.md` lists the vocabulary today, one list line per tag with an optional meaning (``- `testing` — tests and end-to-end checks``, [note-schema](../note-schema.md) rule 5). A line gains optional aliases in parentheses after the tag:

```markdown
- `postgresql` (postgres, pg, psql) — the PostgreSQL database
- `nextjs` (next.js, next-js)
- `tailwind` (tailwindcss)
```

Today's parser reads only the tag at the start of a line, so a release without aliases reads these lines as before.

- **Where they apply:** at creation (topic → canonical tag), in filters, and in queries (`--tag postgres` matches `postgresql`).
- **Canonical form:** lowercase kebab-case, as today.
- **A starter alias list** ships for common technologies. A user's `tags.md` line wins over it.
- **`repomagpie tags --merge postgres postgresql`** rewrites a journal's tags to the canonical one, with a plan and `--dry-run`. The maintainer's journal needs this (`ai`, `ai-agents`, `agents`, `agent`; `llm`, `large-language-models`).

---

## 5. How an agent asks: the MCP contract

### 5.1 Today

`search(query, tags?, kind?, journal?, limit?)` → ranked results with Verdict first.

### 5.2 Proposed

```jsonc
// tool: search
{
  "query": "row level security policies",                       // words, preferably in the notes' language
  "domains": ["security", "database"],                           // enum: the 12 values, with definitions in the schema
  "tags": ["postgresql"],                                         // free; aliases and near spellings resolved by the server
  "kind": "library",                                              // optional, as today
  "match": "boost",                                               // "boost" (default) or "filter"
  "journal": "personal",                                          // optional, as today
  "limit": 10,
  "max_chars": 4000                                               // cap on the whole answer's text (idea 3)
}
```

The answer adds `why` to each result, so the agent can say why a note fits, and the user can see it:

```jsonc
{ "name": "supabase", "verdict": "…", "domains": ["database","auth","security"], "tags": ["supabase","postgresql"],
  "why": { "domains": ["security","database"], "tags": ["postgresql"], "words": ["row level security"], "semantic": null },
  "score": 0.82 }
```

A new read-only tool, `vocabulary`, returns the domains with definitions, and the journal's tags with counts and aliases. The agent calls it once per session when it needs to map a question onto tags. Domains don't need it: they're in `search`'s schema as an enum, which is the reason to keep them fixed.

### 5.3 The flow for "Veritabanı güvenliği nasıl olmalı?"

1. The agent reads `search`'s schema and sees the 12 domains with definitions.
2. The agent maps the question: `domains: [security, database]`. This works in Turkish, since mapping meaning onto a short enum is what the model does well. It reads the project's manifest, or calls `vocabulary`, and adds `tags: [postgresql]`. It writes `query` in English: "database security policies".
3. RepoMagpie:
   1. resolves the tags (`postgres` → `postgresql`; a near spelling within edit distance 1 for tags of 5 or more letters);
   2. gathers candidates: notes matching any domain or tag, plus lexical matches for `query`;
   3. ranks them (§6);
   4. returns the top `limit` with `why`, Verdict first, capped at `max_chars`.
4. The agent answers from those notes, quotes the Verdicts, and names why each fits.

The CLI gets the same: `repomagpie search "row level security" --domain security --domain database --tag postgres`. So does the app's search, with domain chips next to the kind and tag filters.

### 5.4 Just-in-time context (idea 3)

The same structure gives cheap, targeted context:
- **`max_chars`** caps an answer. Results are cut whole, never mid-Verdict, and then a line names the rest, as the hook already does (spec §6, "Length").
- **Optional `files`**: paths the agent is editing. RepoMagpie reads their imports (`import … from 'x'`, `require`, Python `import`) with a light parser, recalls those packages, and adds the domains of their notes as a soft boost. No model, no index of the code.

---

## 6. Ranking

### Phase 2: hybrid lexical and structured

```
score(note) = L(note)                      // lexical, normalised to 0..1 over the candidate set
            + 0.30 · D(note)               // domain overlap: |note.domains ∩ q.domains| / |q.domains|
            + 0.25 · T(note)               // tag match: 1 exact or alias, 0.5 near spelling, averaged over q.tags
            + 0.05 · reviewed(note)        // a reviewed note before an inbox note, as today
```

- **L:** MiniSearch (already in the package), BM25-style, with field boosts.
  - **Today** (`src/core/search-index.ts`, spec §5): it indexes name, PURL, tags, Verdict, "Use when", "Avoid when", "What it does", "My notes" and each skill line, with prefix matching on every term, `fuzzy: 0.2` on every term, and boosts name ×3, skill ×3, PURL ×2, tags ×2, Verdict ×2; every other field counts ×1.
  - **Phase 2 changes, a starting point for the eval:** Verdict ×3, "Use when" ×3, "Avoid when" ×2, My notes ×0.5; name ×3 and tags ×2 stay. Fuzzy only for terms of 5 or more letters, prefix only for the last term. The query is expanded with tag aliases.
- **`match: "filter"`** removes notes without at least one requested domain or tag before ranking. `"boost"` keeps everything and only adds D and T.
- **The weights** are starting points, tuned on the eval set (§9), and recorded in the decision with the numbers that chose them.
- **Explainability:** each term that contributed goes into `why`.

### Phase 3: opt-in semantic

```
final = RRF(rank_lexical_structured, rank_vector)   // Reciprocal Rank Fusion, k = 60
```

RRF combines ranks, not scores, so it needs no calibration between two different scales. That's the standard choice for hybrid search. `why.semantic` gets the cosine similarity.

---

## 7. Phase 3: semantic search, opt-in

### 7.1 Where embeddings come from

Off by default. Each provider is opt-in, local, and adds no dependency to the default install.

| Option | What it needs | Size | Languages | Privacy | Recommendation |
|---|---|---|---|---|---|
| **A. Ollama**, if the user already runs it | the Ollama app, and a model pulled by the user (`nomic-embed-text`; a multilingual one for Turkish) | the user's choice | depends on the model | localhost only | **first**: no dependency, the user already chose a local model |
| **B. transformers.js in Node**, an optional package the user installs (`npm i -g @huggingface/transformers`), loaded with dynamic `import()` only when enabled | a model download on first `repomagpie index --semantic` into `<journal>/.cache/models/`, checked against a pinned SHA-256 | about 25 MB (all-MiniLM-L6-v2, English) to about 120 MB (multilingual-e5-small); to verify | English, or multilingual with e5 | local after the download | **second**, for users without Ollama |
| C. A hosted embedding API with the user's key | an API key | none | many | **note text leaves the machine** | not proposed; it contradicts rule 6 |

**Configuration** goes in the config file, `~/.magpie/config.yaml` ([decision 0016](../decisions/0016-journal-locations-and-config.md), spec §3), which today holds `personal_journal`:

```yaml
semantic:
  provider: ollama
  model: nomic-embed-text
```

`doctor` reports it, and whether it works.

### 7.2 What gets embedded

One vector per note, from a fixed template:

```
{name}. {kind}. Domains: {domains}. Tags: {tags}. Verdict: {verdict}. Use when: {use_when}. Avoid when: {avoid_when}. {what_it_does}
```

Plus one vector per skill line (decision 0006), so a skill can match on its own. My notes and Related aren't embedded: they're long and personal, and lexical search covers them.

### 7.3 Storage: a cache, not a database

- **`<journal>/.cache/vectors.bin` plus `vectors.json`:**
  - `vectors.bin` holds Float32 vectors;
  - `vectors.json` holds an index of note file name, mtime, size and offset;
  - the header holds the provider, the model id, the dimension and the template version.
- Rebuilt per changed note, like the other caches (spec §7). A changed model or template means a full rebuild. Written whole and renamed into place, as the other caches are.
- **Search is brute-force cosine** over the vectors.
  - 10,000 notes × 384 dimensions × 4 bytes is about 15 MB, scanned in a few milliseconds.
  - Journals are far smaller: the maintainer's has 39 notes; the benchmark uses 2,000.

**Why not SQLite plus a vector extension:**
- Notes are the source of truth, and caches must be rebuildable files (decision 0001). A database would be a second source of truth.
- `sqlite-vec` is a native extension: per-platform binaries, which `check:build` and the "no runtime dependencies" promise rule out.
- `node:sqlite` is built in, but its stability across our Node range (22.12+) must be checked first.
- Brute force is exact and fast at this scale.

Revisit only if a real journal passes about 50,000 vectors.

### 7.4 Cost and budgets

- **Indexing** is the slow part: Ollama embeds tens of notes per second on a laptop. It happens on `repomagpie index --semantic` and on note changes. **The hook never embeds**: recall and the hook stay lexical and exact, under 150 ms.
- **A query** costs one embedding (tens of ms locally) plus the scan. `search` with semantic on gets its own budget, proposed at 800 ms cold, 300 ms warm in the MCP server, measured in `npm run bench` with a fake provider.
- When the provider is down, search falls back to Phase 2 and says so in `why`, never failing.

---

## 8. The app and the CLI

- **The sidebar** gains a Domains section with counts, under Kinds and Tags.
- **Notes:**
  - domain chips under the Verdict, with suggested ones marked;
  - one click confirms, × removes, + adds from the fixed list.
- **Inbox review:** suggested domains are pre-shown; Ctrl/Cmd+Enter confirms them with the Verdict.
- **Search:** domain filters; results show `why` as small labels ("security · database · postgresql").
- **Graph:** a "colour by domain" option. Domains, like tags, could be hub nodes; decide in the graph decision, not here.
- **CLI:**
  - `search --domain`, `--tag`, `--match filter` (`search` has `--tag` and `--kind` today);
  - `note --domain` (repeatable, user-confirmed);
  - `domains --suggest` (a new command);
  - `tags --merge` (`tags` has only `--from-topics` today);
  - `index --semantic` (a new command).

---

## 9. Evaluation: the gate for every phase

`npm run eval:retrieval` today has 22 needs and 33 notes, all English, with no domains. It is too small and too narrow to tune weights or justify embeddings.

**Expand it to about 80 needs over about 60 notes:**
- 20 concern questions ("how should I secure database access?");
- 20 technology questions with different spellings ("postgres ORM");
- 20 use-case questions in plain words (as today);
- 20 Turkish questions, some concern-based, some free text.

**Each need is labelled:**
- the expected notes;
- the structured form a good agent would send (domains, tags, query). That lets the eval measure RepoMagpie's ranking separately from the agent's parsing;
- a split: about 60 for tuning, 20 held out.

**Report recall@5, recall@10 and MRR for:**
1. today's search;
2. with aliases and fuzzy matching;
3. with domains and tags, structured;
4. with "Use when" present (the data-quality effect);
5. with semantic search, Ollama, on a machine that has it (a manual run).

**The gates:**
- Phase 2 ships if run 3 beats run 1 on the held-out set.
- Phase 3 ships only if run 5 beats run 3 by a margin the maintainer sets (for example +10 points recall@5 on held-out Turkish and concern questions).

The agent's own parsing is measured separately, in the skill-compliance eval ([idea 17](../ideas.md#17-measuring-skill-compliance)).

---

## 10. Phases

| Phase | Contents | Size | Depends on |
|---|---|---|---|
| **0. Data** | "Use when" and "Avoid when" at capture: CLI flags, the MCP `note` inputs, the review form (branch `feat/use-when-at-capture`) | small | none |
| **1. Structure** | `domains` field and vocabulary; suggestion from topics and tags; `domains --suggest`; tag aliases in `tags.md` and `tags --merge`; MCP `search` gains `domains`, `tags` and `match`; the `vocabulary` tool; UI chips and filters; eval expansion (§9) | medium | decision D1, D2 |
| **2. Ranking** | field boosts, fuzzy and prefix, alias expansion, structured boosts, `why`, `max_chars`, optional `files` | small–medium | Phase 1 and its eval |
| **3. Semantic** | providers A then B, the vector cache, RRF, `index --semantic`, doctor and bench | medium–large | the Phase 2 eval numbers; decision D3 |

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| The domain list is wrong: too coarse, too fine, overlapping | Start with 12, each with a definition. Measure misclassification in the eval. Adding a domain is allowed; renaming needs a migration. |
| Suggested domains are wrong | They're marked suggested, only boost by default, and are one click to fix. |
| Tag aliases collide (`next` the framework vs. "next" the word) | Aliases match tags only, never free text, except in query expansion, where an alias is only expanded when the query term is exactly the alias. |
| `domains` grows into "rules notes" | Non-goal, in the decision record (D1). The app and CLI never create a note without a package or repository identity. |
| Embedding models are big, slow or English-only | Opt-in; Ollama first; a multilingual model listed; fallback to Phase 2. |
| Budgets slip | `npm run bench` gains structured and semantic search; the hook and recall never use either. |
| More fields make notes harder to write | All new fields are optional and suggested. The one-line `repomagpie note x "verdict"` stays the whole story for a user who wants nothing else. |

---

## 12. Decisions needed from the maintainer

Decided on 2026-10-24; see [Status](#status).

- **D1. Notes stay about packages and repositories.**
  - Rules about a package go in its note.
  - General project rules stay in CLAUDE.md or AGENTS.md.
  - Domains make package notes findable by concern.

  **Recommended: yes.** It keeps RepoMagpie's position (decision 0009) and still answers "how should database security work?" from the notes that matter. The alternative, "rule notes" without a package, makes RepoMagpie a general agent-memory tool in a crowded field, and needs its own RFC.
- **D2. The domain list (§4.1):** keep, edit or replace. The maintainer's six are in. Add or remove before Phase 1. Also: **the name**, `domains` (recommended, since `kind` exists) or something else (`areas`, `concerns`).
- **D3. Phase 3 at all, and which provider first.** Recommended: decide after the Phase 2 eval; Ollama first if yes.
- **D4. "Suggested" representation.** A frontmatter key (`domains_suggested: true`) or per-value marking. This is technical; the agent proposes it in Phase 1's decision record.

---

## 13. What changes where

- **Schema:** `domains` (list), its suggested marker; `tags.md` alias syntax.
- **Code:**
  - `src/core/domains.ts` (vocabulary, mapping, suggestion);
  - `tags.md` parsing;
  - search (`search-index.ts`, `search.ts`): fields, boosts, fuzzy, filters, `why`;
  - `suggest`, which gains domains from the project's dependencies' notes;
  - MCP `search` and `vocabulary`;
  - CLI flags;
  - the app.
  - Phase 3: `src/core/semantic/` with a provider interface and the vector cache.
- **Docs:**
  - note-schema;
  - spec §2, §5 and §7;
  - `docs/ui.md`;
  - the skill: when asked about a concern, pass domains; call `vocabulary` for tags;
  - README: "Ask your agent" gains a concern question.
- **Decision records**, numbered in order when written (0040 is the next free number today):
  - domains as a second axis (D1, D2, D4);
  - structured search and ranking;
  - opt-in semantic search (D3).
