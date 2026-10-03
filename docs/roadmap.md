# Roadmap

This file is the single source of truth for project status. It has two parts:
- **Foundation** (steps 0, 1, 1.5, 2): what must exist before any product code.
- **Release milestones** (v0.1 to v0.3, then Later): what each release ships. Scope follows the accepted [strategy](strategy.md) and [decision 0010](decisions/0010-v0-1-scope.md); the step 1.5 interviews may still change it.

Each task is a checkbox. Tick it when the work is done. A step or milestone is done only when its **Done when** criteria are met. Work is committed in small pieces.

Parts marked *Obsidian extra (optional)* need Obsidian. Notes, the CLI, search and the agent skill must work without it.

## Now / Next / Later

- **Now:** step 1.5, validation (the maintainer's work): more interviews, including the two new questions. The accepted strategy is being applied to the docs.
- **Next:** step 2, spec and tech-stack decision, including the note format and the two journals.
- **Later:** v0.1 Remember, then v0.2 Trust, v0.3 Share.

| Part | Status |
|---|---|
| 0. Repository skeleton | ✅ done |
| 1. Agent instructions | ✅ done |
| 1.5. Validation | 🔶 in progress |
| 2. Spec and tech-stack decision | ⬜ |
| v0.1 Remember | ⬜ |
| v0.2 Trust | ⬜ |
| v0.3 Share | ⬜ |
| Later | ⬜ |

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
- [x] [Strategy](strategy.md), accepted, with decisions 0009–0013

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
- [x] Decide: the v0.1 command set and the release themes ([decision 0010](decisions/0010-v0-1-scope.md)).

Interview questions (they ask about past behaviour, not hypothetical use):
1. When did you last go back to a repository you starred? How did you find it?
2. Where do you look when you need a new tool or library?
3. When did you last install something your coding agent suggested? Did you check it first? How?
4. Have you ever installed a package again after forgetting it went badly the first time? When was the last time?
5. When did you last check what an installed extension, plugin or skill actually does? What made you check?
6. Whose opinion do you rely on when choosing a tool? Whose recommendation did you last act on?
7. Do you use Obsidian's graph view, or any graph view? What do you actually do with it?
8. Where did you last write something down about a tool you found? Can you show me?

Then, after the eight:

9. Has your team ever adopted a dependency it had already rejected before? How did you find out?
10. Where would someone on your team look to find out why you chose a library?

Only after these may the interviewer show the one-liner and record the reaction.

**Done when:** `docs/validation.md` has the interview notes and the competitor review, `vision.md` is updated from the findings, and every decision above has a decision record.

## 2. Spec and tech-stack decision
Answer each open question and record the answer as a decision record. The v0.1 command set is decided in step 1.5, not here.
- [ ] Implementation language: TypeScript (Node, publishable to npm, matches the skills ecosystem) or Python?
- [ ] Where does the vault live and how does the CLI find it? (config file, env var, flag)
- [ ] Embeddings for semantic search: local model or API? The default must work offline.
- [ ] When the GitHub API reports no license, should `magpie note <url>` read license statements from the README / `SKILL.md` files? Leaning: record `unknown` (add it to the allowed license values if accepted) rather than `none`, and let the user verify. A wrong `none` is worse than no answer.
- [ ] Note format (Verdict, Use when, Avoid when) and how a note is identified: by package or by repository ([decision 0010](decisions/0010-v0-1-scope.md)).
- [ ] How `magpie` finds the personal and project journals, and how it labels results from each ([decision 0013](decisions/0013-two-journal-scopes.md)).
- [ ] Write `docs/spec.md`.

**Done when:** `docs/spec.md` exists and every open question has a decision record.

---

# Release milestones

Scope follows [decision 0010](decisions/0010-v0-1-scope.md) and [strategy](strategy.md) §7 and §15; the step 1.5 interviews may still change it. Each feature is described in [ideas](ideas.md). Each release is also a marketing moment: one headline feature, one GIF, one short post.

## v0.1 Remember
The first public release: capture what you learned, find it again, and see it before your agent installs a dependency.

### Journals and example vault
- [ ] Finalise [note-schema.md](note-schema.md) with the format from the step 2 spec.
- [ ] Personal journal: a folder outside any repository, private by default ([decision 0013](decisions/0013-two-journal-scopes.md)).
- [ ] Project journal: `.magpie/` inside a project repository, committed with the code.
- [ ] Write example notes in `examples/vault/` from the [seed repositories](seed-repos.md).
- [ ] Create `examples/vault/tags.md` with a starter tag list.
- [ ] *Obsidian extra (optional):* the Templater template in `examples/vault/_templates/` matches the final schema (a draft exists).

**Done when:** every note in `examples/vault/` validates against the schema.

### `magpie note <name-or-url> "text"`
- [ ] Capture a verdict in one line, for example `magpie note pdfkit "avoid: async streams painful; use puppeteer"`. No template to fill.
- [ ] Given a GitHub URL, fetch description, language, license, topics and README, and turn topics into tag suggestions.
- [ ] Detect `SKILL.md` files and write one skill line per skill. A skill URL creates or updates the parent repository note ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).

**Done when:** a note can be captured with one command in about ten seconds and validates against the schema; running it on every seed repository URL produces valid drafts; and it never overwrites human-owned fields or sections of an existing note.

### `magpie import <file>`
- [ ] The bulk form of `magpie note`, one line per item: `- <url> — verdict: ... | use: ... | avoid: ...`.
- [ ] The free text becomes the draft Verdict, Use when and Avoid when.

**Done when:** importing a file with one line per seed repository produces one valid note per line.

### `magpie search`
- [ ] Keyword search over frontmatter and text, across both journals.
- [ ] Each completed skill line is its own result ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).

**Done when:** for a fixed set of 10 test questions, the expected note is in the top 3.

### `magpie suggest`
- [ ] Input: a project's manifests and README, or a free-text description.
- [ ] Narrow candidates from both journals by keyword and tags; no embeddings.
- [ ] Output: matching notes, verdict first. The coding agent makes the semantic choice, guided by `SKILL.md`.

**Done when:** for three sample projects, the notes the maintainer expects are among the candidates.

### `magpie adopt <name>`
- [ ] Copy a note from the personal journal into the project's `.magpie/`.
- [ ] Print the install command. Never install anything.

**Done when:** after `adopt`, the project journal holds the note and nothing was installed.

### Proactive recall
- [ ] `magpie recall <package>` on the CLI, across both journals.
- [ ] Map package names to notes (how: step 2 spec).
- [ ] Hook mode: a Claude Code `PreToolUse` hook that runs recall before a package install. Recall informs and never blocks.
- [ ] Skill mode: `SKILL.md` tells agents in other clients to run `magpie recall` before installing.

**Done when:** in Claude Code, installing a package that has a note shows that note to the agent and the user, and the install still goes ahead.

### Agent skill
- [ ] Ship a `SKILL.md` that teaches agents to use the CLI: note, search, suggest, adopt, recall.
- [ ] Publish it to skills.sh and add the badge to the README.

**Done when:** in a fresh Claude Code session, "what do I have for browser testing?" triggers the skill and returns the right notes.

### `magpie init` (if time allows; otherwise v0.2)
- [ ] Read `package.json`, `pyproject.toml` and `Cargo.toml`, and create draft notes for the dependencies already in use.

### Launch
See [marketing.md](marketing.md).
- [ ] README rewrite for the accepted positioning, with one line about suggest
- [ ] `v0.1.0-beta.N` pre-release for the validation interviewees ([release process](release.md))
- [ ] 30-second demo GIF: the "pdfkit moment"
- [ ] Social preview image
- [ ] Logo: a magpie, legible at 16 px
- [ ] Five "good first issue" issues
- [ ] Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) with a private contact.
- [ ] Soft launch in niche communities
- [ ] Show HN
- [ ] Product Hunt

## v0.2 Trust
- [ ] `magpie init`, if it missed v0.1.
- [ ] Vet, reduced ([decision 0011](decisions/0011-vet-and-drift-reduced.md)): record your review and the reviewed commit in the note; link the output of existing scanners.
- [ ] `magpie drift`: lists notes whose upstream changed since the reviewed commit, using existing lockfiles where they exist.
- [ ] `magpie gaps`: dependencies used in a project but missing from the journals.

## v0.3 Share
- [ ] Write `DESIGN.md` (Obsidian-inspired, dark-first) before any HTML surface. Use `VoltAgent/awesome-design-md` as reference only.
- [ ] `magpie publish`: a static "nest" site from notes marked public.
- [ ] `magpie follow <nest-url>`: another user's public notes in your search results, attributed.
- [ ] `/uses` page generator.
- [ ] Semantic search, also for `suggest`.

## Later
- [ ] Resurfacing digest.
- [ ] `magpie today`: one optional daily find.
- [ ] A thin MCP server for clients without a shell ([decision 0002](decisions/0002-cli-first.md)).
- [ ] *Obsidian extra (optional):* ready-made Dataview queries in `examples/vault/`.

## Not scheduled
- Graph views: marketing only ([ideas](ideas.md), idea 10). The Obsidian graph preset and `magpie graph` are built only as a shareable visual, if at all.
