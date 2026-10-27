# 0046 — Classification signals beyond topics

**Status:** accepted (2026-10-26). Adds to [0030](0030-github-topics-become-tags.md) (a last kind rule, and keywords where its rules read topics) and [0040](0040-domains-a-second-axis.md) (half votes for domains). Both keep their order and their rules.

## Context
Until 0.2.0-beta.13, a new note's kind and suggested domains came from its GitHub topics and a few files ([0030](0030-github-topics-become-tags.md), [0040](0040-domains-a-second-axis.md)). A repository with few topics gets `other` and no domain: `langchain-ai/langchainjs`, `actions/checkout` and `sorrycc/awesome-javascript` have none. Discover ([0045](0045-discover.md)) adds notes for repositories the user doesn't know yet, so the drafts matter more. The repository says more than its topics in two places `note` already has, or can have with one request: its manifests' keywords, and the start of its README.

## Decision
1. **The README's start.** One more read-only request when a note is made from GitHub: `GET /repos/<owner>/<repo>/readme`, raw. Its first 3,000 characters are kept after removing code blocks, HTML comments and tags, images, link targets, inline code marks and emphasis, entities, and lines that are only punctuation; each line is cleaned as note text is ([0032](0032-note-text-is-data.md)). It is used for the kind's last rule, for the domains (rule 4) and, when the repository has no description, for the "What it does" draft (the first sentence of the first line of prose, marked as a draft, [0018](0018-ai-drafts-humans-decide.md)). It is never written to the note. A 404 means no README, silently; any other failure adds a warning and the note is written without it.
2. **Manifest keywords,** from the root manifests `note` already reads: `package.json` `keywords`, `pyproject.toml` `[project] keywords`, `Cargo.toml` `keywords` and `categories` (`a::b` gives `a` and `b`). Lowercased, cleaned, spaces and `_` as `-`, at most 50 characters each and 20 in all. They count as topics: in 0030's kind rules 1 to 7, as a full vote for a domain, and for tags only in a slot the topics leave and only when the keyword is already in `tags.md` or on another note (0030's rule for topics).
3. **One file that says something:** a root `action.yml` or `action.yaml` makes the repository a GitHub Action. That is half a vote for `devops`, not a kind: note-schema has no kind for an Action, so it stays whatever the other rules give. A `.github/workflows` folder alone doesn't count; most repositories have one. A `Dockerfile` still decides nothing.
4. **How the votes add up, for domains:**
   - a topic or a keyword is one vote, read through the tag aliases as before;
   - each README term (`README_TERMS` in `src/core/domains.ts`) found is half a vote, once per README, as whole words, ignoring case, a space and a hyphen alike;
   - the Action file is half a vote for `devops`;
   - a domain is suggested with at least one full vote, or two halves;
   - the order, the bare `ai` rule and the limit of 3 stay as in beta.13.
5. **The README terms are few and unambiguous,** a list per domain, and they were narrowed by measurement (rule 7). Each phrase below was taken out because, on the fixture, it appeared in READMEs at least as often for what a project works with or offers on the side as for what it is for:

   | Phrase (domain) | Right / wrong on the fixture |
   |---|---|
   | "AI agents" (`ai`) | 4 / 4 (playwright, caddy, trpc, appwrite) |
   | "MCP server" (`ai`) | 3 / 3 |
   | "model context protocol" (`ai`) | 1 / 1 |
   | "REST API", "GraphQL API", "OpenAPI" (`api`) | 0 / 5 |
   | "observability" (`observability`) | 1 / 4 (langflow, dify, n8n, nest) |
   | "developer tools" (`tooling`) | 1 / 2 |
   | "VS Code extension" (`tooling`), "two-factor authentication" (`auth`), "bundle size" (`performance`) | 0 / 1 each |

   "Rate limiting" is left out too: it names an `api` concern and a `security` one alike (0040's rule for a word with two meanings). For the same rule, `profiling` leaves `DOMAIN_MAP`: as a keyword it put `performance` on `open-telemetry/opentelemetry-js`, where it means tracing and metrics. `profiler` stays.
6. **The kind:** 0030's order stays. Keywords join the topics in rules 1 to 7. A new rule 12, the weakest, applies only to what would be `other`: the README's first heading or first sentence says "awesome list", "starter template", "CLI" or "command-line tool" (as whole words), or the first heading starts with "Awesome", the title the awesome lists' own rules ask for. `other` becomes rule 13.
7. **Measured, not tuned in the dark:** `npm run eval:classification` scores 69 public repositories (`scripts/fixtures/classification.json`: topics, description, keywords, file facts and the README's start, recorded on 2026-10-26). Their expected kind and domains were written by hand before the new code ran. Two runs: before (topics and files, as beta.13) and after (all the signals). It reports only, and isn't in CI. On 2026-10-26:

   | Run | Kind | Domain precision | Domain recall | Exact domain sets |
   |---|---|---|---|---|
   | before | 21/69 (30.4%) | 49/73 (67.1%) | 49/60 (81.7%) | 42/69 |
   | after | 24/69 (34.8%) | 51/75 (68.0%) | 51/60 (85.0%) | 44/69 |

   The kinds fixed: two awesome lists without the topic (heading rule) and `honojs/hono` (`framework` from its keywords). The domains added: `ai` for langchainjs (README terms "LLM" and "LLMs") and `devops` for actions/checkout (the Action file and "GitHub Action"), with no new wrong one. Before `profiling` left the map (rule 5), the after run had one more: `performance` for opentelemetry-js, 51/76 (67.1%).

## Consequences
- `note` from GitHub makes one more request. SECURITY.md lists it; the README's text is never stored.
- Notes from repositories with few topics get a kind and domains more often; a note's drafts can now differ from Discover's estimates, which see only the description and topics.
- A keyword is as strong as a topic, so a manifest's loose keywords can add a wrong domain on their own, as `profiling` did on a telemetry library. A word like that leaves `DOMAIN_MAP`, as `profiling` did, and a topic with it no longer suggests `performance` either; the keywords' weight can change only with a new record.
- 0030's rule 10 (three folders with a `SKILL.md` make a skill pack) is what most kinds the eval gets wrong come from: 6 of the 7 repositories it calls skill packs are frameworks, libraries or apps that ship skills for their users (playwright, prisma, trpc, vercel/ai, firecrawl, chakra-ui). This record doesn't change it.
- New README terms need the eval run before and after, as here.
