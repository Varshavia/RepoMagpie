# Roadmap

Each step leaves something usable on its own and should be committed in small pieces. A step is done only when its **acceptance criteria** are met. Update the status column as steps complete.

Parts marked *Obsidian extras (optional)* need Obsidian. Notes, the CLI, search and the agent skill must work without it.

| # | Step | Status |
|---|---|---|
| 0 | Repository skeleton | ✅ done |
| 1 | Agent instructions (`CLAUDE.md`) | ✅ done |
| 2 | Spec and tech-stack decision | ⬜ |
| 3 | Note template + example vault | ⬜ |
| 4 | Dataview queries (no-code search), Obsidian extra | ⬜ |
| 5 | `magpie add <url>` | ⬜ |
| 6 | Search (keyword → semantic) | ⬜ |
| 7 | Agent layer (`SKILL.md`, skills.sh) | ⬜ |
| 8 | Optional UI + `DESIGN.md` | ⬜ |
| 9 | Public launch | ⬜ |

---

## 0. Repository skeleton
README, LICENSE (MIT), `.gitignore`, project docs.
**Done when:** the repo explains what RepoMagpie is in under 30 seconds of reading, and the license is detected by GitHub.

## 1. Agent instructions
`CLAUDE.md`, `AGENTS.md`, `.claude/settings.json` (git allowlist hook in `.claude/hooks/` + deny list).
**Done when:** an agent asked to "commit this" refuses and prints a suggested commit message instead.

## 2. Spec and tech-stack decision
Answer the open questions below and record each answer as a decision record.
Open questions:
- Implementation language: TypeScript (Node, publishable to npm, matches the skills ecosystem) or Python?
- Where does the vault live and how does the CLI find it? (config file, env var, flag)
- Embeddings for semantic search: local model or API? Default must work offline.
- Minimum viable command set for v0.1.
- When the GitHub API reports no license, should `magpie add` read license statements from the README / `SKILL.md` files? Leaning: record `unknown` (add it to the allowed license values if accepted) rather than `none`, and let the user verify. A wrong `none` is worse than no answer.
**Done when:** `docs/spec.md` exists and every open question has a decision record.

## 3. Note template + example vault
Finalise [note-schema.md](note-schema.md), write `examples/vault/` with the [seed repositories](seed-repos.md), and create `examples/vault/tags.md` with a starter tag list.
*Obsidian extras (optional):* the Templater template in `examples/vault/_templates/`; the example vault opens cleanly in Obsidian.
**Done when:** every note in `examples/vault/` validates against the schema.

## 4. Dataview queries
*Obsidian extras (optional).* Ready-made Dataview queries in `examples/vault/` (by kind, by tag, tried vs. not tried, recently added).
**Done when:** a user can answer "which skill packs have I tried?" without writing any code.

## 5. `magpie add <url>`
Fetch description, language, license, topics and README from the GitHub API; turn topics into tag suggestions; detect `SKILL.md` files and write one skill line per skill; write a draft note with an empty "When it's useful" section. A skill URL creates or updates the parent repository note ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).
**Done when:** running it on every seed repository produces valid drafts, and it never overwrites human-owned fields or sections of an existing note.

## 6. Search
`magpie search "<query>"`. Keyword (frontmatter + text) first; semantic search over "What it does" and "When it's useful" second. Each completed skill line is its own result.
**Done when:** for a fixed set of 10 test questions, the expected note is in the top 3.

## 7. Agent layer
Ship a `SKILL.md` that teaches agents to use the CLI; publish to skills.sh; optional thin MCP server for clients without a shell.
**Done when:** in a fresh Claude Code session, "what do I have for browser testing?" triggers the skill and returns the right notes.

## 8. Optional UI
Only if steps 0–7 are solid. Write a `DESIGN.md` (Obsidian-inspired, dark-first) before any UI code.

## 9. Launch
See [marketing.md](marketing.md).
