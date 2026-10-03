# Roadmap

This file is the single source of truth for project status. It has two parts:
- **Foundation** (steps 0, 1, 1.5, 2): what must exist before any product code.
- **Release milestones** (v0.1 to v0.4, then Later): what each release ships. Milestone scope is a **candidate** until step 1.5 (validation) confirms it.

Each task is a checkbox. Tick it when the work is done. A step or milestone is done only when its **Done when** criteria are met. Work is committed in small pieces.

Parts marked *Obsidian extra (optional)* need Obsidian. Notes, the CLI, search and the agent skill must work without it.

## Now / Next / Later

- **Now:** step 1.5, validation. The maintainer's work: interviews, competitor review, demo scenario, decisions. Agent work pauses until the interview results arrive.
- **Next:** step 2, spec and tech-stack decision.
- **Later:** v0.1 Remember, then v0.2 Trust, v0.3 Share, v0.4 Assist.

| Part | Status |
|---|---|
| 0. Repository skeleton | ✅ done |
| 1. Agent instructions | ✅ done |
| 1.5. Validation | 🔶 in progress |
| 2. Spec and tech-stack decision | ⬜ |
| v0.1 Remember | ⬜ |
| v0.2 Trust | ⬜ |
| v0.3 Share | ⬜ |
| v0.4 Assist | ⬜ |
| Later: Teams | ⬜ |

---

# Foundation

## 0. Repository skeleton
- [x] README, LICENSE (MIT), `.gitignore`
- [x] Project docs: vision, note schema, standards, competitors, marketing, seed repositories, decision records
- [x] Glossary and architecture
- [x] Community files: `CONTRIBUTING.md`, `SECURITY.md` (private vulnerability reporting enabled)
- [x] Ideas document: the approved ideas with target releases
- [x] Product document: surfaces and graph specification; decisions 0007 (proposed) and 0008
- [x] [Release process](release.md) and `CHANGELOG.md`
- [x] [Validation](validation.md) template for step 1.5

**Done when:** the repo explains what RepoMagpie is in under 30 seconds of reading, and the license is detected by GitHub.

## 1. Agent instructions
- [x] `CLAUDE.md` rulebook and `AGENTS.md` pointer
- [x] git-guard hook in `.claude/hooks/`: read-only git allowlist, with tests
- [x] Read-only gh allowlist in git-guard, with tests
- [x] Backup deny list in `.claude/settings.json` for the most damaging git and gh commands
- [x] Private work log in `.worklog/`
- [x] Live check that git-guard blocks commits sent through the PowerShell tool

**Done when:** an agent asked to "commit this" refuses and prints a suggested commit message instead.

## 1.5. Validation
The maintainer's work. Agent work pauses until the interview results arrive.
- [ ] Interview at least 3 developers, one per profile: a heavy coding-agent user, a security-minded engineer, a student. Add more if the patterns are unclear. Notes go in [validation.md](validation.md). Don't pitch the idea during interviews.
- [ ] Hands-on review of competitors: GithubStarsManager, the Obsidian "GitHub Integration" plugin, and Starcat (README only; it's macOS-only).
- [ ] Write the 30-second demo scenario.
- [ ] Decide: soften [decision 0005](decisions/0005-human-written-usefulness.md) (AI suggests, human confirms)?
- [ ] Decide: import stars as inbox suggestions?
- [ ] Decide: the v0.1 command set and the release themes.

Interview questions (they ask about past behaviour, not hypothetical use):
1. When did you last go back to a repository you starred? How did you find it?
2. Where do you look when you need a new tool or library?
3. Do you ask your coding agent for tool recommendations? Do you trust them?
4. Have you ever installed a package again after forgetting it went badly the first time? When was the last time?
5. If a skill you installed changed after you reviewed it, how would you find out? What would you do?
6. Whose opinion do you rely on when choosing a tool? Whose recommendation did you last act on?
7. Do you use Obsidian's graph view, or any graph view? What do you actually do with it?

**Done when:** `docs/validation.md` has the interview notes and the competitor review, `vision.md` is updated from the findings, and every decision above has a decision record.

## 2. Spec and tech-stack decision
Answer each open question and record the answer as a decision record. The v0.1 command set is decided in step 1.5, not here.
- [ ] Implementation language: TypeScript (Node, publishable to npm, matches the skills ecosystem) or Python?
- [ ] Where does the vault live and how does the CLI find it? (config file, env var, flag)
- [ ] Embeddings for semantic search: local model or API? The default must work offline.
- [ ] When the GitHub API reports no license, should `magpie add` read license statements from the README / `SKILL.md` files? Leaning: record `unknown` (add it to the allowed license values if accepted) rather than `none`, and let the user verify. A wrong `none` is worse than no answer.
- [ ] Write `docs/spec.md`.

**Done when:** `docs/spec.md` exists and every open question has a decision record.

---

# Release milestones

Scope and themes are candidates until step 1.5 confirms them. Each feature is described in [ideas](ideas.md). Each release is also a marketing moment: one headline feature, one GIF, one short post.

## v0.1 Remember
The first public release.

### Example vault and template
- [ ] Finalise [note-schema.md](note-schema.md).
- [ ] Write example notes in `examples/vault/` from the [seed repositories](seed-repos.md).
- [ ] Create `examples/vault/tags.md` with a starter tag list.
- [ ] *Obsidian extra (optional):* the Templater template in `examples/vault/_templates/` matches the final schema (a draft exists).
- [ ] *Obsidian extra (optional):* the example vault opens cleanly in Obsidian.

**Done when:** every note in `examples/vault/` validates against the schema.

### Dataview queries
*Obsidian extra (optional).*
- [ ] Ready-made Dataview queries in `examples/vault/`: by kind, by tag, tried vs. not tried, recently added.

**Done when:** a user can answer "which skill packs have I tried?" without writing any code.

### `magpie add <url>`
- [ ] Fetch description, language, license, topics and README from the GitHub API.
- [ ] Turn topics into tag suggestions.
- [ ] Detect `SKILL.md` files and write one skill line per skill.
- [ ] Write a draft note with an empty "When it's useful" section.
- [ ] A skill URL creates or updates the parent repository note ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).

**Done when:** running it on every seed repository produces valid drafts, and it never overwrites human-owned fields or sections of an existing note.

### Search
- [ ] `magpie search "<query>"`: keyword search over frontmatter and text.
- [ ] Semantic search over "What it does" and "When it's useful".
- [ ] Each completed skill line is its own result.

**Done when:** for a fixed set of 10 test questions, the expected note is in the top 3.

### Agent skill
- [ ] Ship a `SKILL.md` that teaches agents to use the CLI.
- [ ] Publish it to skills.sh and add the badge to the README.
- [ ] *Optional:* a thin MCP server for clients without a shell ([decision 0002](decisions/0002-cli-first.md)).

**Done when:** in a fresh Claude Code session, "what do I have for browser testing?" triggers the skill and returns the right notes.

### Proactive recall
- [ ] `magpie recall <package>` on the CLI.
- [ ] `magpie add` detects package names from manifests (`package.json`, `pyproject.toml`, `Cargo.toml`) into a tool-owned `packages` field.
- [ ] An agent hook and `SKILL.md` instructions that run recall before a package install. Recall informs and never blocks the install.

**Done when:** installing a package that has a note in the journal shows that note to the user, and the install still goes ahead.

### Obsidian graph preset
*Obsidian extra (optional).*
- [ ] Ship `examples/vault/.obsidian/graph.json` with colour groups per `kind` group.
- [ ] Commit only `graph.json` and the minimum other config; `git check-ignore` confirms workspace and cache files are ignored.

**Done when:** the example vault opens in Obsidian with the graph coloured by `kind` group.

### Launch
See [marketing.md](marketing.md).
- [ ] `v0.1.0-beta.N` pre-release for the validation interviewees ([release process](release.md))
- [ ] 30-second demo GIF
- [ ] Social preview image
- [ ] Logo: a magpie, legible at 16 px
- [ ] Five "good first issue" issues
- [ ] Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) with a private contact.
- [ ] Soft launch in niche communities
- [ ] Show HN
- [ ] Product Hunt

## v0.2 Trust
- [ ] Write `DESIGN.md` (Obsidian-inspired, dark-first) before any HTML surface. Use `VoltAgent/awesome-design-md` as reference only.
- [ ] `magpie vet <repo-or-skill>`: risk summary of a skill's `SKILL.md` and scripts; records the reviewed commit on approval.
- [ ] `magpie drift`: lists notes whose upstream changed since review.
- [ ] `magpie graph`: a self-contained, interactive HTML graph of the journal.

## v0.3 Share
- [ ] `magpie publish`: a static "nest" site from notes marked public, with the graph.
- [ ] `magpie follow <nest-url>`: another user's public "When it's useful" lines in your search results, attributed.
- [ ] `/uses` page generator.

## v0.4 Assist
- [ ] `magpie suggest`: notes that fit the current project.
- [ ] Gap detection: tools used in your projects but missing from the journal.
- [ ] Resurfacing digest.
- [ ] `magpie today`: one optional daily find.

## Later
- [ ] Team journal: a shared vault for a team's vetted tools.
