# RepoMagpie — Strategy (accepted, 2026-10-03)

**Status:** accepted (2026-10-03). The maintainer approved all four decisions in §14, with the additions in §15. No user interviews were run; step 1.5 closed with desk research (§10, [decision 0014](decisions/0014-step-1-5-desk-research.md)). The v0.1 beta may still change it. It is the basis for vision, ideas and roadmap.

---

## 1. One-liner

> **RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.**

Short form for the README and the Show HN title:

> Socket tells you if a package is malicious. Magpie tells you if it's a mistake you already made.

---

## 2. Problem

Coding agents now install packages on their own. Two different questions come up at that moment:

1. **Is this package dangerous?** The supply-chain security industry answers this well (§5).
2. **Have we been here before, and what did we decide?** Nobody answers this.

The second answer exists, but it is scattered: in someone's head, in a daily note, in an old Slack thread, in a wiki page nobody finds. So it gets lost:

- **Illustrative scenario** (from synthetic interview S1, not evidence; see §10): a developer reinstalls a PDF library they abandoned years earlier for the same reason, and only remembers ten minutes into fighting it again. This is the "pdfkit moment" the product is designed around. Desk research has no direct data on repeat installs (Q4), so the v0.1 beta has to show whether it happens.
- In the same synthetic scenario, the developer checks every agent-suggested package by hand (registry, downloads, last commit, author), every single time.
- Industry voices describe AI agents installing packages that no one on the team decided to adopt, with no clear owner of that decision ([The New Stack](https://thenewstack.io/?p=22824572)).

---

## 3. Why now

- **Agents install code autonomously.** Every install an agent runs is a decision nobody consciously made.
- **The malware question is getting solved.** Free tools such as Socket Firewall Free block known-malicious packages at install time. That frees us to focus on the question nobody covers.
- **Agent hooks exist.** Claude Code's `PreToolUse` can inject context into the agent before a shell command runs. That lets a memory surface at the exact moment it matters.
- **The skills ecosystem exploded.** Skills are now a supply chain of their own, which raises the stakes of "what did we already learn about this?"

---

## 4. Insight

> **Security scanners know the world. Nobody knows you.**

Every existing tool judges a package against global data: CVEs, malware databases, popularity. The most valuable signal for a specific developer or team is local and personal: *"we tried it, it hurt, use X instead."* That signal is cheap to write down, almost never findable, and never shown at the moment of decision.

---

## 5. Competitive landscape (researched 2026-10-03)

### A. Star managers: "find my stars again"

| Product | What it does | Gap for us |
|---|---|---|
| [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | Syncs stars, AI summaries and tags, semantic search, release tracking. Desktop and web, MIT. About 1.4k stars per [SourcePulse](https://www.sourcepulse.org/projects/11396072); the README says the app is entirely AI-written. | Bulk import, AI summaries; no install-time role |
| [Starcat](https://github.com/starcat-app/Starcat) | Native macOS app, very active (v1.6). Local-first RAG over repos the user adds, notes, AI suggests rather than decides, **plus a CLI and local MCP service so agents can query it**. Mac App Store with Pro in-app purchase. | macOS only, app database, not triggered at install time |
| Obsidian plugins (GitHub Integration, GitHub Stars Manager) | Import stars into a vault | No agent role |

**Consequence:** our original positioning ("curated, agent-queryable repo journal") is **no longer unique**. Starcat already covers most of it on macOS.

### B. Install-time security for agents: "is it malicious?"

| Product | What it does |
|---|---|
| [Socket Firewall Free](https://github.com/SocketDev/sfw-free) (`sfw`) | Wraps npm, yarn, pnpm, pip, uv and cargo; blocks known-malicious packages. Free, PolyForm Shield licence, anonymous telemetry ([The Register, 2025-09-30](https://theregister.com/2025/09/30/socket_will_block_it_with)). |
| [Aikido Safe Chain](https://help.aikido.dev/ai-and-dev-tools/securing-ai-generated-code) | Validates packages before install, blocks versions younger than 24 h, MCP for agents. |
| [SafeInstall](https://github.com/Mickdownunder/SafeInstall), Immunity Agent, Agentinel, stillrunning, [SafeDep MCP](https://safedep.io/mcp) | Hooks or MCP servers that check agent installs against threat data, several for Claude Code and Cursor. |

**Consequence:** this is a crowded field with funded companies. **We do not build malware detection.** We compose with it.

### C. Skill security and pinning: "is this skill safe, did it change?"

| Product | What it does |
|---|---|
| Snyk agent-scan, Cisco skill-scanner, NVIDIA SkillSpector, many OSS scanners | Static and semantic scanning of `SKILL.md` and scripts |
| Vercel `skills` CLI (`skills-lock.json`), Sentry [dotagents](https://github.com/getsentry/dotagents), skiletto, skillsrc | Lockfiles with content hashes or pinned commits; can report changed skills |

**Consequence:** idea 2 (vet and drift) as originally planned would rebuild existing tools. **Downgrade it** (§7).

### D. The empty square

| | Knows the world (CVEs, malware, popularity) | Knows *you* (your verdicts, your team's history) |
|---|---|---|
| **Before install** | Socket, Aikido, SafeDep, SafeInstall… | **Nobody → RepoMagpie** |
| **Browsing later** | GitHub search, star managers | Starcat (macOS), notes apps |

---

## 6. Solution

### The core loop
1. **Capture in one line.** `magpie note pdfkit "avoid: async streams painful; use puppeteer"`. Ten seconds, no template to fill.
2. **Recall at install.** When the agent runs `npm install pdfkit`, a hook shows the verdict to the agent and the user. It never denies: an avoid note asks the user to confirm; other notes only inform ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)).
3. **Cold start from your manifests.** `magpie init` reads `package.json`, `pyproject.toml` and `Cargo.toml` and creates draft notes for the dependencies you already use. The journal is never empty, and it starts from real decisions instead of stars.

### Two journal scopes, one format
- **Personal journal:** a folder outside any repo, for everything you've learned.
- **Project journal:** `.magpie/` inside a project repository, committed with the code. **Teams get sharing, history and review through git, with no server.** This is the team journal (old idea 8), moved from "later" to the core, at almost no extra cost.

### Compose, don't compete
- Socket Firewall Free (`sfw`) is a recommended companion tool, mentioned in the docs, not an integration. Their answer is "malicious or not"; ours is "your history with it". Recall never installs a package or hands an install to another tool.
- For skills: record *your* review and the commit you reviewed in the note, and link scanner output. Don't build a scanner.

### Note format (hypothesis to test)
Synthetic interview S1 (not evidence) suggested tool notes with a one-line **decision** with scope ("default for new projects, don't touch legacy"). The hypothesis to test in real interviews (Q8 in `docs/validation.md`) is this note format:
- **Verdict:** one line. This is what recall shows first.
- **Use when / Avoid when:** negative knowledge is what recall needs most.
- Everything else is optional. Plain Markdown, any language.

---

## 7. What happens to the ten approved ideas

| # | Idea | New status | Why |
|---|---|---|---|
| 1 | Proactive recall | **Core, v0.1** | The empty square in §5 D |
| 8 | Team journal | **Core, v0.1** (as the project journal) | Git gives sharing for free; strongest pain in industry reports (§2); supported by desk research (§10, Q4) |
| 5 | Gap detection | **v0.1** (as `magpie init` and `magpie gaps`) | Solves the empty-journal problem from real manifests |
| 2 | Vet and drift | **Reduced, v0.2** | Record your review and the reviewed commit; integrate existing scanners and lockfiles; no own scanner |
| 4 | Context-aware suggest | v0.3 | Useful once journals have content |
| 3 | Nests and follow | v0.3 | Needs users first |
| 7 | `/uses` generator | v0.3 | Marketing feature |
| 6 | Resurfacing digest | Later | Nice to have |
| 9 | Daily find | Later | Distraction from the core |
| 10 | Graph views | Marketing only | Desk research (Q7, secondhand): graph views are widely reported as not useful for real work |

Dropped from v0.1: semantic search (keyword search is enough at first), the MCP server, Dataview queries, and the Obsidian graph preset.

---

## 8. Who it's for, in order

1. **Claude Code power users** who let the agent install dependencies. Hook mode works best there (see `docs/ideas.md`, hook support table). This is the launch audience.
2. **Small teams** using any coding agent with a shared repository: the project journal.
3. Later, other agent clients through skill mode, as their hook support matures.

---

## 9. Business model (honest version)

RepoMagpie is MIT open source and stays that way. There is no revenue plan for 2026. If teams adopt project journals, a later paid layer could exist (for example org-wide policy, cross-repo views). That is not a goal now, and nothing in v0.1 depends on it. The real goals for the next six months are adoption, a strong open-source portfolio piece, and the maintainer's own daily use.

---

## 10. Validation so far

- **No interviews.** Step 1.5 closed with desk research instead ([decision 0014](decisions/0014-step-1-5-desk-research.md)). Findings, sources and limits per question are in `docs/validation.md`, "Desk research".
- **What the desk research shows:**
  - Stars become forgotten bookmarks (Q1).
  - Trust in AI output is falling: 46% of developers distrust its accuracy, up from 31% (Q3). Code LLMs still suggest non-existent packages: 19.7% on average in 2025, 4.6–6.1% for 2026 frontier models (Q3).
  - Extensions are a live supply-chain risk: a poisoned VS Code extension led to a breach of ~3,800 GitHub repositories in 2026 (Q5).
  - Teams lose the "why" behind choices, and library-level decisions fall below the threshold for a decision record (Q4). That is the gap the project journal fills.
  - Graph views are widely reported as not useful (Q7).
  - No evidence either way on whether developers write notes about tools (Q8).
- **Hypotheses:** H1 open (tested by the v0.1 beta), H2 real but crowded, H3 supported, H4 confirmed (secondhand).
- **Limits:** secondhand, self-selected sources; none of them are RepoMagpie's users.
- **Synthetic material** (interview S1, hypotheses H1–H4) stays in `docs/validation.md` and is not evidence.
- **Competitor research** in §5 is what changed the positioning.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Starcat adds install-time recall | Cross-platform, plain Markdown, project journals via git; ship fast |
| "I can just write 'avoid pdfkit' in CLAUDE.md" | True for five lines. Magpie is structured, cross-project, searchable, shared with the team, and triggered automatically at install. The pitch must answer this objection directly. |
| People don't write notes (H1) | One-line capture; `init` pre-fills drafts; only the verdict is needed |
| Hooks differ between agents | Launch on Claude Code, be honest in the README, skill mode as fallback |
| Overlap with security vendors | Explicit "compose, don't compete"; never claim to detect malware |
| No user interviews; the evidence is secondhand desk research | The v0.1 beta is the first contact with users and tests H1 ([decision 0014](decisions/0014-step-1-5-desk-research.md)); its results may still change this strategy |

---

## 12. Next six weeks

| Week | Work | Branch |
|---|---|---|
| 1 | Approve this strategy; close step 1.5 with desk research ([decision 0014](decisions/0014-step-1-5-desk-research.md)); update vision, ideas, competitors and roadmap | `docs/strategy` |
| 2 | Step 2: tech stack (leaning TypeScript, published to npm), spec for `note`, `recall`, `init`, `search` | `docs/spec` |
| 3–4 | `magpie note`, `magpie search` (keyword), journal format, project journal | `feat/core` |
| 4–5 | `magpie recall` and the Claude Code hook; `magpie init` from manifests | `feat/recall`, `feat/init` |
| 6 | `v0.1.0-beta.1` to early testers; demo GIF of the "pdfkit moment"; README rewrite | `release/v0.1` |

New interview questions (ask the original eight first, then these, then it's fine to show the one-liner and record the reaction):
- "Has your team ever adopted a dependency it had already rejected before? How did you find out?"
- "Where would someone on your team look to find out why you chose a library?"

**Success metric for the beta:** at least one tester reports a real install-time recall that changed what they did. Stars are a secondary signal.

---

## 13. Branch workflow

- `main` is always consistent and releasable. Release tags are created on `main` only.
- All work happens on a branch: `docs/...`, `feat/...`, `fix/...`, `spike/...` (experiments that may be thrown away).
- **The maintainer** creates branches, opens pull requests on GitHub and merges them. Agents can't: git-guard blocks `git switch`, `git branch`, `gh pr create` and `gh pr merge`.
- **The agent** reports the current branch at the start of every task (`git status`) and stops if it's on `main` when the task needs a branch.
- Merge with **"Rebase and merge"** or a merge commit, not squash, so the small commits stay visible on `main`.
- The agent drafts the pull-request description (summary, files, evidence) at the end of a branch.

---

## 14. Decisions requested from the maintainer

1. Adopt the new one-liner and the "empty square" positioning (§1, §5 D)?
2. Narrow v0.1 to `note`, `search`, `recall` with the Claude Code hook, `init`, and the project journal (§6, §7)?
3. Downgrade vet and drift to "record and integrate" (§7)?
4. Adopt the branch workflow (§13)?

Once approved, the agent applies the strategy to vision, ideas, competitors, roadmap and validation, and writes decision records for 1 to 3, on the `docs/strategy` branch.

---

## 15. Additions (approved 2026-10-03)

The maintainer approved §14 with these additions. Where they differ from §6, §7 or §14, the additions apply.

### A. Personal journal is first-class
The personal journal is equal to the project journal. It holds anything the user explored and judged (repositories, skills, tools), not only the dependencies they use. It is private by default. Search, suggest and recall all work across both journals.

### B. `magpie import <file>`
Generic bulk add. One line per item:

```
- <url> — verdict: ... | use: ... | avoid: ...
```

The free text after the URL becomes the draft Verdict, Use when and Avoid when.

### C. `magpie suggest`
When the user starts or works on a project, magpie shows what they already have that fits.
- **Input:** the project's manifests and README, or a free-text description ("a TypeScript CLI with tests").
- **Output:** matching notes from both journals, Verdict first.
- **In v0.1, no embeddings:** magpie narrows the candidates by keyword and tags, and the coding agent makes the semantic choice, guided by `SKILL.md`.

### D. `magpie adopt <name>`
Copies a note from the personal journal into the project's `.magpie/` and prints the install command. It never installs anything itself.

### E. Final v0.1 scope
- `note`, `import`, `search` (keyword), `suggest`, `adopt`
- `recall` with the Claude Code hook
- personal and project journals

`init` (draft notes from manifests) goes in v0.1 if time allows, otherwise in v0.2. The positioning stays as in §14 decision 1; the README may add one line about suggest.
