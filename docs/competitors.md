# Competitive landscape

Researched October 2026. Re-check before launch.

## Direct competitors: AI-assisted GitHub star managers

### GithubStarsManager
<https://github.com/AmintaCCCP/GithubStarsManager>
Syncs starred repos with a GitHub token, uses an OpenAI-compatible model to generate summaries, tags and categories, offers semantic search and release tracking. A hosted deployment option exposes the star data to AI assistants over MCP. Launched on Product Hunt.

### Starcat
<https://github.com/starcat-app/Starcat>
Native, local-first macOS app. Tags, notes, reading status, full-text and semantic search, AI summaries, natural-language questions over a curated library. Bring-your-own AI provider. Launched on Product Hunt.

## Obsidian plugins

- **GitHub Integration** — imports starred repos into the vault as notes with metadata and automatic language/topic tags; incremental sync. <https://community.obsidian.md/plugins/github>
- **GitHub Stars Manager** (Obsidian) — browse and tag stars inside Obsidian; notes stored in plugin data. <https://community.obsidian.md/plugins/github-stars-manager>
- **GitHub Stars** — shows star counts next to GitHub links in notes. <https://community.obsidian.md/plugins/github-stars>

## Adjacent

- **skills.sh / `skills` CLI** (Vercel) — public directory and installer for agent skills. Solves *install*, not *remember why*.
- **Awesome lists** (e.g. VoltAgent's) — curated by someone else, not by you.

## What they share

All of them start from **bulk import of stars** and let AI write the summary. The user's own judgment is optional.

## Where RepoMagpie differs

1. **Deliberate entry.** Nothing is "reviewed" until the user writes when it's useful.
2. **Plain Markdown you own.** Not an app database, not plugin data. Git-versionable, editor-agnostic.
3. **Skill-level granularity.** None of the above record individual skills inside a skill pack.
4. **Agent-native by default.** CLI + `SKILL.md` following the open standard, so any compatible coding agent can query it.
5. **A daily-habit story** ("magpie find of the day") that doubles as marketing.

## Risks

- Competitors could add Markdown export or skill awareness. Our moat is the workflow and the habit, not a feature.
- "Write it yourself" is friction. The `add` command must make everything except that one section effortless.
