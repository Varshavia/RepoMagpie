# Competitive landscape

Researched 2026-10-03 ([strategy](strategy.md), §5). Sources were checked on that date; re-check before launch. RepoMagpie's position is set in [decision 0009](decisions/0009-positioning-dependency-memory.md).

## A. Star managers: "find my stars again"

| Product | What it does | Gap for RepoMagpie |
|---|---|---|
| [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | Syncs starred repositories, AI summaries and tags, semantic search, release tracking. Desktop and web, MIT. | Bulk import and AI summaries; no role at install time |
| [Starcat](https://github.com/starcat-app/Starcat) | Native macOS app (macOS 15+, Apple Silicon). Local knowledge base of repositories the user adds, with notes and AI features. A separate [`starcat-cli`](https://github.com/starcat-app/starcat-cli) provides a CLI and MCP runtime over that local store, so agents can query it. Core features free; Pro features through in-app purchase or a direct license. | The app is macOS only and keeps its own database; nothing triggers at install time |
| Obsidian plugins: [GitHub Integration](https://community.obsidian.md/plugins/github), [GitHub Stars Manager](https://community.obsidian.md/plugins/github-stars-manager) | Import starred repositories into a vault as notes, or browse and tag them inside Obsidian | No agent role |

**Consequence:** a curated journal that agents can query is no longer unique. Starcat covers most of it on macOS.

## B. Install-time security for agents: "is it malicious?"

| Product | What it does |
|---|---|
| [Socket Firewall Free](https://github.com/SocketDev/sfw-free) (`sfw`) | Wraps npm, yarn, pnpm, pip, uv and cargo, and blocks malicious dependencies before they install. PolyForm Shield License 1.0.0, which forbids providing a competing product. Collects anonymous usage telemetry ([The Register, 2025-09-30](https://theregister.com/2025/09/30/socket_will_block_it_with)). |
| [Aikido Safe Chain](https://help.aikido.dev/ai-and-dev-tools/securing-ai-generated-code) | Validates packages before install, blocks versions younger than 24 hours, offers MCP for agents. |
| [SafeInstall](https://github.com/Mickdownunder/SafeInstall) | Checks agent installs against threat data. |
| [Prismor](https://github.com/PrismorSec/immunity-agent) (formerly Immunity Agent) | Self-hosted runtime security for coding agents: intercepts tool calls and scores package installs against threat intelligence. |
| [Agentinel](https://www.producthunt.com/p/agentinel) | Local, hook-level guard that intercepts hallucinated and malicious packages for JavaScript, Python and Rust before the agent installs them. |
| [SafeDep MCP](https://safedep.io/mcp) | MCP server that checks packages for agents. |

**Consequence:** a crowded field with funded companies. RepoMagpie builds no malware detection. It composes with these tools.

## C. Skill security and pinning: "is this skill safe, did it change?"

| Product | What it does |
|---|---|
| [Snyk Agent Scan](https://github.com/snyk/agent-scan) | Scans agent components on a machine, including a single `SKILL.md`, for prompt injection, tool poisoning and other issues. |
| [Cisco Skill Scanner](https://github.com/cisco-ai-defense/skill-scanner) | Scans agent skills for prompt injection, data exfiltration and malicious code: pattern rules, code analysis, optional LLM review. Apache 2.0. |
| [NVIDIA SkillSpector](https://docs.nvidia.com/skills/scanning-agent-skills) | Open-source scanner that reads a skill (directory, zip, single `SKILL.md` or Git URL) and returns findings and a risk score; optional LLM analysis. |
| [Vercel `skills` CLI](https://github.com/vercel-labs/skills) | Writes a project `skills-lock.json` with a SHA-256 hash of each skill's files ([`src/local-lock.ts`](https://github.com/vercel-labs/skills/blob/main/src/local-lock.ts)). |
| [Sentry dotagents](https://github.com/getsentry/dotagents) | Manages a project's agent skills with a lockfile. |
| [skiletto](https://github.com/kumekay/skiletto) | Package manager for agent skills: a manifest, and a lockfile pinned to commit SHAs. |

**Consequence:** vet and drift as first planned would rebuild existing tools. They are reduced to recording your own review and integrating these tools ([decision 0011](decisions/0011-vet-and-drift-reduced.md)).

## D. The empty square

| | Knows the world (CVEs, malware, popularity) | Knows *you* (your verdicts, your team's history) |
|---|---|---|
| **Before install** | Socket, Aikido, SafeDep, SafeInstall… | **Nobody: RepoMagpie** |
| **Browsing later** | GitHub search, star managers | Starcat (macOS), notes apps |

## Adjacent

- **[`vercel skills`](https://vercel.com/docs/cli/skills)** detects a project's framework and notable `package.json` dependencies and recommends skills from Vercel's catalog. It suggests from a public catalog; `magpie suggest` suggests from your own journals.
- **skills.sh and the `skills` CLI** (Vercel): a public directory and installer for agent skills. It solves *install*, not *remember why*.
- **Awesome lists**, for example VoltAgent's: curated by someone else, not by you.

## Where RepoMagpie differs

1. **Your verdict at install time.** Recall shows what you or your team decided, before the agent installs a package.
2. **Personal and project journals.** A private personal journal, and a project journal committed with the code, so a team shares its history through git ([decision 0013](decisions/0013-two-journal-scopes.md)).
3. **Plain Markdown you own.** Not an app database, not plugin data. Git-versionable, editor-agnostic, cross-platform.
4. **Composes with security tools.** It never claims to detect malware and never installs anything. The docs recommend running a firewall such as Socket Firewall Free alongside it; there is no integration ([strategy](strategy.md), §6).

## Risks

- **A star manager adds install-time recall**, Starcat most likely. Answer: cross-platform, plain Markdown, project journals through git; ship fast.
- **"I can just write 'avoid pdfkit' in CLAUDE.md."** True for five lines. RepoMagpie is structured, cross-project, searchable, shared with the team, and triggered at install. The pitch must answer this directly.
- **People don't write notes.** One-line capture, `import`, and drafts from manifests; only the verdict is required.
- **Overlap with security vendors.** Compose, don't compete; never claim to detect malware.

## Open questions

- `sfw` is only recommended in the docs. If RepoMagpie ever calls or bundles it, check first what the PolyForm Shield License's noncompete clause allows.
- Two tools named in the strategy research, stillrunning and skillsrc, had no source found on 2026-10-03. They are left out until one is found.
