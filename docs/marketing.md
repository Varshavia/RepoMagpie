# Marketing and launch plan

Marketing starts now, not at launch. Researched October 2026.

## Core message

> Your coding agent remembers the repos you've tried, and what you thought of them.

RepoMagpie is your personal journal of the open-source repos and tools you've tried (libraries, CLIs, MCP servers, agent skills), with your own verdict on each. Your coding agent checks it before it picks a tool: it suggests what worked for you, and it stops on what you ruled out ([decision 0060](decisions/0060-positioning-your-journal-checked-before-your-agent-picks.md)).

- **Three parts, in this order:** Remember (write your verdict on every repo and tool you try: when to use it, when to avoid it, what to use instead), Recall (your agent checks those verdicts before it picks a tool; the hook stops an install you ruled out), Discover (find new repos on GitHub and add them with your take).
- **Proof:** the hook's output, seven agents, everything local (plain files, no account, no hosted server).
- **Teams second:** the same notes can live in the repository and be shared through git. After the individual story, never in the tagline.
- **What it isn't:** session or conversation memory; a star list or an awesome list.
- **Words:** "repos and tools" in the opening. "Package" only where it is about package managers: the hook, install commands.

Lead with the habit, not the features: *every day, find one repo worth keeping, write one sentence about when you'd use it.*

## Assets (build alongside the product)

| Asset | When | Notes |
|---|---|---|
| README as landing page | Step 0, refined every step | Many developers read the README and never visit a website. Show the output. |
| 30-second demo GIF | Before launch | The "pdfkit moment": `repomagpie note` → the agent runs an install → the verdict appears before it installs. |
| Social preview image | Before launch | GitHub repo settings → Social preview. |
| Logo | Before launch | A magpie. Simple, works at 16px. |
| "Good first issue" set | Before launch | 5 small, well-described issues. |
| skills.sh badge | v0.1 (agent skill) | Install-count social proof. |
| README translations | Before launch: Turkish, German, Spanish, Simplified Chinese, Japanese | In `docs/readme/` (`README_tr.md`, `README_de.md`, `README_es.md`, `README_zh-CN.md`, `README_ja.md`), with one language line at the top of every README. Each translation names the date of the English README commit it was translated from. The English README is the reference. |

## The daily content engine: "Magpie find of the day"

Once the example vault exists (roadmap v0.1), the maintainer posts one short item per working day (X, LinkedIn, dev.to):
- repo name + link
- one sentence: when it's useful
- optional: a notable skill inside it

This builds an audience before launch, and every post is a real journal entry — using the product *is* the marketing. Later, link posts to the public example vault.

## Launch sequence

1. **Soft launch in niche communities first** (not r/programming): Obsidian forum / r/ObsidianMD, Claude Code and agent-skills communities, Turkish developer communities.
2. Fix what they find. Collect a few quotes.
3. **Show HN.** Commonly recommended timing: Tuesday around 13–15 UTC. Plan to answer comments all day.
4. **Product Hunt** (both direct competitors launched there).
5. Submit to curated lists: awesome-agent-skills, awesome-obsidian, awesome-cli-apps.
6. If an Obsidian plugin exists by then: submit to the Obsidian community plugin directory.

## Rules

- No star farming, no fake accounts, no paid stars.
- Credit every project we build on or learned from.
- Respond to every issue within 48 hours during the first month after launch.

## Tools to consider

Agent skills for launch copy exist (e.g. `varnan-tech/opendirectory` "oss-launch-kit", Gingiris open-source playbook). Review them as journal entries before using them.
