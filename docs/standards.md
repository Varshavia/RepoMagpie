# Standards and ecosystem

What we adopt, why, and how firmly. Researched October 2026.

## Agent Skills (`SKILL.md`) — **adopt**

- Open standard published by Anthropic on 2025-12-18, now at <https://agentskills.io>. A skill is a folder with a `SKILL.md` (YAML frontmatter + Markdown instructions) and optional `scripts/`, `references/`, `assets/`.
- Around 40 compatible clients as of mid-2026, including Claude Code, OpenAI Codex, GitHub Copilot, VS Code, Cursor and Gemini CLI.
- Progressive disclosure: agents load only the short description until the skill is needed.

**For RepoMagpie:**
- We ship our own `SKILL.md` that teaches agents to call the `magpie` CLI (roadmap step 7).
- The note schema treats skills as first-class: we detect `SKILL.md` files when adding a repo and list them under "Notable skills".

## skills.sh and the `skills` CLI — **distribute through**

- Vercel's directory and installer: `npx skills add <owner/repo>`. Ranking is based on anonymous install telemetry from the CLI.
- README badge: `[![skills.sh](https://skills.sh/b/<owner>/<repo>)](https://skills.sh/<owner>/<repo>)`.

**For RepoMagpie:** publish our skill there at launch; add the badge to the README.

## CLI vs. MCP — **CLI first, MCP later**

See [decision 0002](decisions/0002-cli-first.md). Summary: the Playwright team recommends CLI + skills for coding agents on token-efficiency grounds; an independent measurement (Checkly) found roughly equal token use. We pick CLI for simplicity and portability, and add a thin MCP wrapper later for clients without a shell.

## DESIGN.md — **use, but loosely**

- Google's open format (Apache 2.0, from Stitch) for describing a design system to AI agents: YAML tokens plus prose rationale. Still alpha; Google says to expect changes.
- Ready-made examples: <https://github.com/VoltAgent/awesome-design-md>.

**For RepoMagpie:** write our own `DESIGN.md` before any UI work (roadmap step 8). Don't build tooling that depends on the exact spec.

## AGENTS.md / CLAUDE.md — **adopt**

Agent instructions live in `CLAUDE.md`; `AGENTS.md` points to it so other agents find the same rules.
