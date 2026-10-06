# Standards and ecosystem

What we adopt, why, and how firmly. Researched October 2026.

## Agent Skills (`SKILL.md`) — **adopt**

- Open standard published by Anthropic on 2025-12-18, now at <https://agentskills.io>. A skill is a folder with a `SKILL.md` (YAML frontmatter + Markdown instructions) and optional `scripts/`, `references/`, `assets/`.
- Around 40 compatible clients as of mid-2026, including Claude Code, OpenAI Codex, GitHub Copilot, VS Code, Cursor and Gemini CLI.
- Progressive disclosure: agents load only the short description until the skill is needed.

**For RepoMagpie:**
- We ship our own `SKILL.md` that teaches agents to call the `magpie` CLI (roadmap v0.1): [`skills/repomagpie/`](../skills/repomagpie/SKILL.md), name `repomagpie`. Checked against the [specification](https://agentskills.io/specification) on 2026-10-06: `name` 1–64 characters, lowercase letters, digits and single hyphens, equal to the folder's name; `description` 1–1,024 characters; optional `license`, `compatibility` (up to 500), `metadata` and `allowed-tools`; `SKILL.md` under 500 lines, with longer material in `references/`, one level deep. `src/cli/skill.test.ts` checks these rules, and checks every command, flag and `--json` field the skill names against `magpie --help` and the [spec](spec.md).
- The note schema treats skills as first-class: we detect `SKILL.md` files when adding a repo and list them under "Notable skills".

## skills.sh and the `skills` CLI — **distribute through**

- Vercel's directory and installer: `npx skills add <owner/repo>`. Ranking is based on anonymous install telemetry from the CLI.
- README badge: `[![skills.sh](https://skills.sh/b/<owner>/<repo>)](https://skills.sh/<owner>/<repo>)`.

- Discovery (its README, checked 2026-10-06): the repository root, `skills/` and agent folders such as `.claude/skills/`, up to three levels deep; a recursive search only when none of these has a skill. A skill installs under its frontmatter `name`. `npx skills add ./ --list` in this repository finds one skill, `repomagpie`.

**For RepoMagpie:** `npx skills add Varshavia/RepoMagpie` installs our skill. Publish it on skills.sh at launch; add the badge to the README.

## CLI vs. MCP — **CLI first, MCP later**

See [decision 0002](decisions/0002-cli-first.md). Summary: the Playwright team recommends CLI + skills for coding agents on token-efficiency grounds; an independent measurement (Checkly) found roughly equal token use. We pick CLI for simplicity and portability, and add a thin MCP wrapper later for clients without a shell.

## DESIGN.md — **use, but loosely**

- Google's open format (Apache 2.0, from Stitch) for describing a design system to AI agents: YAML tokens plus prose rationale. Still alpha; Google says to expect changes.
- Ready-made examples: <https://github.com/VoltAgent/awesome-design-md>.

**For RepoMagpie:** our own [`DESIGN.md`](../DESIGN.md) is written before any UI code, the logo, the landing page and any other visual work. It follows the format's stable core (the token groups and the section order of the [spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md), version `alpha` on 2026-10-04) and avoids alpha-only details. Don't build tooling that depends on the exact spec.

## AGENTS.md / CLAUDE.md — **adopt**

Agent instructions live in `CLAUDE.md`; `AGENTS.md` points to it so other agents find the same rules.
