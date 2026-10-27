# 0047 — Kind rules, measured

**Status:** accepted (2026-10-27). Changes [0030](0030-github-topics-become-tags.md)'s rule 10 and adds three rules to its order (3a, 7a, 8a). [0046](0046-classification-signals.md)'s rule 12 keeps its place. Discover's estimated kind ([0045](0045-discover.md), point 5) follows the new rules that need no file.

## Context
After 0046, `npm run eval:classification` got the kind right for 24 of 69 repositories. Of the 45 wrong, 27 came out `other` because no rule fired. Six came from 0030's rule 10 (three folders with a `SKILL.md` make a skill pack): playwright, prisma, trpc, vercel/ai, firecrawl and chakra-ui ship skills for their users, but skills aren't their main content. The labels followed no written definition, and every rule had been tuned on the same 69 repositories, so a better score could mean a better fit to those 69 and nothing more.

## Decision
1. **Definitions first.** Each kind has one deciding question, and six rules settle a tie ([note schema](../note-schema.md#kind-values)). The maintainer approved them, and two of the 69 labels changed to follow them (apify/crawlee to `framework`, ollama/ollama to `app`), before any rule changed.
2. **A held-out set.** `scripts/fixtures/classification-holdout.json` holds 30 more repositories, spread over every kind, each with its label and the reason for it. They were labelled at 22:31 on 2026-10-27, before any request about them, and their signals were recorded afterwards. Rules were tuned on the 69 only. `npm run eval:classification -- --holdout` reports both sets.
3. **One new fact, no new request:** the root's folders, not hidden ones, from the file list `note` already reads (`rootFolders` in `src/core/github.ts`). They were recorded for all 99 repositories on 2026-10-27 (`root_folders` in both fixtures); nothing else was recorded again.
4. **The rules.** The first that matches decides. 0030's numbers stay; the new rules are 3a, 7a and 8a:

   | # | Kind | Signals | Why here |
   |---|---|---|---|
   | 1 | `awesome-list` | the topic `awesome-list` | unchanged |
   | 2 | `template` | the topic `template`, `starter` or `boilerplate`, or GitHub's template flag | unchanged |
   | 3 | `skill-pack` | the repository's name contains `skill` | unchanged |
   | 3a | `other` | a root `action.yml` or `action.yaml`: a GitHub Action | New. The schema has no kind for an Action, so it is `other`. Before rule 4, because Actions carry the topics of what they run: docker/build-push-action has `docker`, which gave `app`. After rule 3, so a skill pack whose name says so stays one. |
   | 4 to 7 | `platform`, `app`, `skill-pack`, `framework` | the topics of 0030 | unchanged |
   | 7a | `framework` or `library` | the topic `testing-framework` (`framework`), `ui-library` or `orm` (`library`) | New. These topics name the kind, as `framework` does in rule 7, so they come where it does: before a command or a package, which say how it's shipped. |
   | 8 | `cli` | the root `package.json` has `bin` | unchanged |
   | 8a | `platform`, `framework` or `library` | what the README's first heading or first sentence calls it: "platform for building" or "development platform" (`platform`); "a framework for", "testing framework" or "CSS framework" (`framework`); "JavaScript library" or "component library" (`library`) | New. After a command, before a package: publishing a package is how it's shipped, not what it is (tie rule 3). langflow publishes one. |
   | 9 | `library` | it publishes a registry package | unchanged |
   | 10 | `skill-pack` | 3 or more `SKILL.md` folders outside hidden folders, **and** the root has a `skills/` folder and no `src/`, `packages/`, `lib/` or `apps/` folder | Changed. Tie rule 2: a library, framework or app that ships skills for its users isn't a skill pack, and its code sits next to the skills. When the file list couldn't be read, this rule doesn't apply. |
   | 11 | `plugin` | the root has `.claude-plugin/plugin.json` or `marketplace.json` | unchanged |
   | 12 | `awesome-list`, `template` or `cli` | 0046's README rule, only for what would be `other` | unchanged |
   | 13 | `other` | nothing above | |

5. **Measured one rule at a time** on the 69, each step against the one before (right, newly right, newly wrong):

   | Step | Right | Newly right | Newly wrong |
   |---|---|---|---|
   | main's rules | 24 | | |
   | rule 10 needs a root `skills/` and no `src/`, `packages/`, `lib/`, `apps/` | 24 | 0 | 0 |
   | + 3a: an Action is `other` | 26 | 2 (actions/checkout, docker/build-push-action) | 0 |
   | + 8a: the seven phrases, one each | 33 | 7 (langflow, supabase, playwright, vitest, tailwindcss, puppeteer, radix-ui/primitives) | 0 |
   | + 7a: the three topics | 37 | 4 (cypress, chakra-ui, prisma, drizzle-orm) | 0 |
   | **final against main** | **37** | **13** | **0** |

   The new rule 10 fixes no kind on its own: it takes the 6 repositories above out of `skill-pack`, which lets rules 7a and 8a decide playwright, prisma and chakra-ui. trpc, vercel/ai and firecrawl become `other`, still wrong but no longer a confident wrong kind.
6. **Tried and dropped,** on the 69:

   | Rule | Result |
   |---|---|
   | Rule 10 blocked by a kind word ("library", "framework", "app", "platform") at the README's start | 24; moved only playwright out of `skill-pack` |
   | Rule 10's layout without `apps/` | firecrawl (`skills/` next to `apps/`) stays a skill pack |
   | 3a after rule 7 | 25: build-push-action keeps `app` from `docker` |
   | "open-source platform" | 0 right; grafana `other` to `platform` (it is an `app`) |
   | "backend-as-a-service", "web framework", "a library for", "Python library", "TypeScript library" | no effect |
   | The phrases only where the result would be `other` (0046's rule 12's place) | 32: langflow publishes a package |
   | The phrases before rule 8 | 33, the same; after rule 8 keeps a command first |
   | The topics `react-components` (chakra-ui again), `web-framework`, `css-framework`, `component-library`, `sdk` | no new kind |

7. **The held-out result: the bar was missed.** The bar was 8 points more on the held-out set (17 of 30); the rules gain 3.3 (15 of 30).

   | Set | main | after | Newly right | Newly wrong |
   |---|---|---|---|---|
   | first 69 | 24 (34.8%) | 37 (53.6%) | 13 | 0 |
   | held-out 30 | 14 (46.7%) | 15 (50.0%) | 1 (mastra) | 0 |
   | all 99 | 38 (38.4%) | 52 (52.5%) | 14 | 0 |

   - 11 of the 12 new rules fired on no held-out repository. "a framework for" fired on two: mastra became right, and serde moved from `other` to `framework` ("a framework for serializing"; it is a `library`). Rule 10's layout moved remotion from `skill-pack` to `other` (it is a `framework`). Both are wrong either way.
   - Nothing turned wrong on either set, so dropping rules couldn't raise the held-out score; it would only lower the first set's. The maintainer chose to keep all 12 rules (2026-10-27).
   - The held-out set's misses are of another sort: apps, libraries and command-line tools with no telling topics or phrases come out `other` or by how they're shipped (jellyfin, zed, date-fns, TanStack/query, fzf, ripgrep, uv).
   - **The held-out set has now been seen.** It can't judge the next round of rules; that round needs a new set of 30, labelled before any rule changes.
   - Domain precision (51/75) and recall (51/60) are unchanged.

   The largest wrong cells on all 99, expected → got:

   | Cell | main | after |
   |---|---|---|
   | `app` → `other` | 9 | 10 (+ firecrawl) |
   | `library` → `other` | 12 | 10 |
   | `cli` → `other` | 5 | 5 |
   | `framework` → `other` | 6 | 4 |
   | `library` → `skill-pack` | 4 | 0 |
   | `framework` → `skill-pack` | 3 | 0 |
   | `cli` → `library` | 3 | 3 |

## Consequences
- No new request: one more fact from the file list `note` already reads.
- Discover's estimate gains rule 7a; rule 3a needs a file, which a search result doesn't show. A `library` search keeps a result estimated `library` (the topic `orm` or `ui-library`) or with no estimate. The kinds a search can't name are the same five, so its "approximate" notice stays as it is.
- The phrases are narrow: each fixed one repository of the 69, and none fired on the held-out set except "a framework for", which was right once and wrong once. They are untested on new repositories.
- Existing notes keep their kind, as before (0030, [0018](0018-ai-drafts-humans-decide.md)). Showing the kind the current rules would draft for an existing note is a candidate ([ideas](../ideas.md#19-discover)), as is the next round: kind signals from files for repositories without telling topics.
- New kind rules need the eval run before and after, on the 69 and on a held-out set nobody has seen.
