# 0002 — CLI first, SKILL.md, MCP later

**Status:** accepted (2026-10-01)

## Context
Agents can reach tools via MCP servers or via CLIs described by a `SKILL.md`. The Playwright team recommends CLI + skills for coding agents, citing token efficiency. An independent measurement (Checkly, 2026) found MCP and CLI+skill flows used roughly the same tokens for the same task. The debate is open.

## Decision
- The core is a CLI (`magpie`).
- We ship a `SKILL.md` that teaches agents how to use it.
- An MCP server is added later as a thin wrapper over the same core, for clients without shell access (e.g. Claude.ai, Claude Desktop).

We choose CLI first for **simplicity and portability**, not because of the token argument.

## Consequences
- Humans and agents use the exact same interface.
- CLI output must be concise and parseable (consider a `--json` flag).
- Business logic must live in a core module, not in CLI argument handling, so MCP can reuse it.
