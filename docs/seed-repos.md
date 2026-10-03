# Seed repositories

The first repositories explored for this project (2026-10-01). They become the example vault in roadmap v0.1. "Use when" lines below are **drafts** — the maintainer rewrites them in his own words before they become notes.

---

## Egonex-AI/Understand-Anything
- **URL:** https://github.com/Egonex-AI/Understand-Anything
- **Kind:** plugin (skill-pack) · **License:** MIT
- **What it does:** Turns a codebase (or a knowledge base / docs) into an interactive knowledge graph stored as JSON in the repo, then lets you query and explore it from a coding agent.
- **Use when (draft):** understanding an unfamiliar or large repo quickly; onboarding onto a new project; seeing the impact of a diff.
- **Notable skills:** `understand`, `understand-chat`, `understand-explain`, `understand-onboard`, `understand-diff`, `understand-domain`, `understand-knowledge`, `understand-dashboard`.
- **Install:** `/plugin marketplace add Egonex-AI/Understand-Anything` then `/plugin install understand-anything`
- **Role in RepoMagpie:** maintainer's tool for exploring repos before writing notes. Once v0.1 code exists, it maps the RepoMagpie codebase and helps onboard contributors (v0.1 and later). Later: try `understand-knowledge` on the vault itself.

## multica-ai/andrej-karpathy-skills
- **URL:** https://github.com/multica-ai/andrej-karpathy-skills
- **Kind:** skill-pack · **License:** none found at repo root
- **What it does:** A single set of coding-agent guidelines (think before coding, simplicity, surgical changes, goal-driven execution), derived from Andrej Karpathy's observations on LLM coding pitfalls.
- **Use when (draft):** stopping an agent from over-engineering or touching unrelated code.
- **Role in RepoMagpie:** inspiration for `CLAUDE.md` (rewritten in our own words; credited).

## mattpocock/skills
- **URL:** https://github.com/mattpocock/skills
- **Kind:** skill-pack · **License:** MIT
- **What it does:** 30+ small, composable engineering skills used by Matt Pocock daily.
- **Use when (draft):** turning a vague idea into a spec; TDD with an agent; code review; protecting git from agents.
- **Notable skills:** `grill-me` (interrogates your plan), `to-spec`, `tdd`, `code-review`, `codebase-design`, `diagnosing-bugs`, `git-guardrails-claude-code`, `handoff`.
- **Install:** `/plugin install mattpocock-skills` (managed) **or** `npx skills@latest add mattpocock/skills` (editable copy). Don't install both.
- **Role in RepoMagpie:** `tdd` while implementing v0.1, and `code-review` before each pull request; principles credited in `CLAUDE.md`.

## microsoft/playwright-cli
- **URL:** https://github.com/microsoft/playwright-cli
- **Kind:** cli · **License:** Apache-2.0
- **What it does:** Playwright browser automation as a CLI with an accompanying skill, designed for coding agents.
- **Use when (draft):** letting an agent test a web UI end-to-end and take screenshots.
- **Install:** `npm install -g @playwright/cli@latest` then `playwright-cli install --skills`
- **Role in RepoMagpie:** reference design for "CLI + SKILL.md" (decision 0002); end-to-end checks and screenshots of the landing page, and screenshots for the README (v0.1 Launch); later nests and, if built, the graph.

## Leonxlnx/taste-skill
- **URL:** https://github.com/Leonxlnx/taste-skill
- **Kind:** skill-pack · **License:** MIT
- **What it does:** Frontend design skills that push agents away from generic, templated-looking UI. Scoped to landing pages, portfolios and redesigns — explicitly not dashboards or data tables.
- **Notable skills:** `taste-skill`, `redesign-skill`, `minimalist-skill`, `brutalist-skill`, `image-to-code-skill`.
- **Install:** `npx skills add Leonxlnx/taste-skill`
- **Role in RepoMagpie:** landing page, README hero, social preview and logo direction (v0.1 Launch). Not for the CLI or data-dense views; its own scope excludes dashboards.

## VoltAgent/awesome-design-md
- **URL:** https://github.com/VoltAgent/awesome-design-md
- **Kind:** awesome-list · **License:** MIT
- **What it does:** ~70 ready-made `DESIGN.md` files extracted from real sites (Linear, Notion, Raycast, Vercel, Supabase…).
- **Use when (draft):** giving an agent a consistent visual language before it builds UI.
- **Role in RepoMagpie:** reference when writing our own `DESIGN.md` (v0.1 Launch). Reference only; no brand is copied.

## vercel-labs/agent-skills
- **URL:** https://github.com/vercel-labs/agent-skills
- **Kind:** skill-pack · **License:** MIT (stated in the README and in 4 of 9 `SKILL.md` files; no other license declared. There is no LICENSE file, so GitHub detects none.)
- **What it does:** Vercel's official skills: React/Next.js performance rules, UI/accessibility audit, writing guidelines, Vercel deploy and optimisation.
- **Notable skills:** `react-best-practices`, `web-design-guidelines`, `writing-guidelines`, `composition-patterns`, `deploy-to-vercel`.
- **Install:** `npx skills add vercel-labs/agent-skills`
- **Role in RepoMagpie:** `web-design-guidelines` to review every HTML surface (the landing page in v0.1 Launch; later nests and, if built, the graph); `writing-guidelines` for README and docs copy (v0.1 Launch).

## open-lakehouse/open-lakehouse
- **URL:** https://github.com/open-lakehouse/open-lakehouse
- **Kind:** platform · **License:** Apache-2.0
- **What it does:** Local Docker lakehouse demo stack — Spark 4.1 (Spark Connect), Kafka, Airflow, Iceberg/Delta, Unity Catalog OSS, MLflow — designed to be set up and torn down by an AI agent.
- **Use when (draft):** learning or demoing a modern open data stack locally.
- **Role in RepoMagpie:** none — catalogue entry only. Useful as an example of a non-skill note.
