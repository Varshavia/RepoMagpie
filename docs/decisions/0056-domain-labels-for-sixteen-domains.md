# 0056 — Domain labels for the sixteen domains, and the mappings measured

**Status:** accepted (2026-11-03, from the maintainer's briefs). Changes [0055](0055-four-domains-and-frontend.md)'s rule 2 (`react`, `vue` and `ui` no longer suggest `frontend`) and rule 1's `mobile` row (`flutter` no longer suggests it). 0055's `DOMAIN_TOPICS` (rule 5) is unchanged. 0055 stays as written for everything else.

## Context
[0055](0055-four-domains-and-frontend.md) added `mobile`, `data`, `docs` and `payments` and renamed `styling` to `frontend`. Domain precision on `npm run eval:classification` fell from 68.0 % to 57.8 %. The fixtures' labels had been written for the twelve domains, so part of the fall could be the labels: a suggestion can be wrong by an old label and right by the new definitions. 0055's consequences left the relabelling to the maintainer, and noted that `react` and `ui` suggest `frontend` on libraries that only support React.

## Decision
1. **The labels, rewritten for the sixteen domains,** on 2026-11-03 at 20:15 (UTC+3), before the classifier ran for this decision. Each label comes from the repository's recorded description, topics and README only, held against the definitions in `src/core/domains.ts`, with the old rules: at most 3, only the concerns a project is for. A label changed only where a new domain or a changed definition fits. The writer had seen 0055's table of the suggestions that changed, which names some of these repositories.
   - `classification.json`, 2 of 69: `umami-software/umami` none → `data` ("a privacy-first web and product analytics platform"); `grafana/grafana` `observability` → `observability`, `data` ("the open and composable observability and data visualization platform").
   - `retrieval.json`, 1 of 82 needs, from the need's words only: "privacy-friendly website analytics without cookies" `observability` → `data`.
   - Checked and kept, with the reason: `immich-app/immich` (photo management with a phone app; not for building mobile apps), `appwrite/appwrite` (a backend with mobile SDKs), `open-webui/open-webui` (an app with a UI, not a UI framework), `better-auth/better-auth` (a Stripe plugin, not a payments library), `jgm/pandoc` (a markup converter, not a documentation tool), `pmndrs/zustand` (state management stays `architecture`), `vercel-labs/agent-skills` (skills on several concerns, none it is for), and the scrapers (scraping is not ETL).
2. **The held-out set gets domains.** Its 30 repositories had kinds only. Each now has its domains, written the same way and at the same time. `npm run eval:classification -- --holdout` reports them: precision, recall and exact sets, and the misses.

   | Repositories | Domains |
   |---|---|
   | pydantic, serde, date-fns, remotion, jellyfin, logseq, AppFlowy, superpowers, scientific-agent-skills, awesome-python | none |
   | TanStack/query, django | `architecture`, `api` |
   | fastapi, strapi, public-apis | `api` |
   | directus | `database`, `api` |
   | mastra, agent-browser | `ai` |
   | zed, ripgrep, fzf, uv, vim-fugitive, prettier-vscode | `tooling` |
   | Dokploy, actions/setup-node, action-gh-release | `devops` |
   | trailofbits/skills | `security` |
   | Next-js-Boilerplate | `architecture`, `frontend` |
   | cookiecutter-django | `architecture` |

3. **`react`, `vue` and `ui` leave `DOMAIN_MAP`** (`src/core/domains.ts`), the maintainer's choice after the measurements below. Libraries that only work with React or Vue, and apps with a UI, carry them. `frontend`'s other rows (`frontend`, `css`, `tailwindcss`, `design-system`, `ui-components`, `component-library` and the rest) still name it.
4. **One rule for every mapping 0055 added:** a mapping leaves `DOMAIN_MAP` if it takes part in no right suggestion and in at least 2 wrong ones, on the first 69 and the held-out 30 together, with the new labels. A mapping takes part when its word is among a repository's tags, topics or keywords and its domain is suggested. It counts as right if the label has the domain and as wrong if not. Counts are taken on the map after rule 3; `react`, `vue` and `ui` are counted on the map as merged.

   | Mapping | Right | Wrong | Repositories (wrong ones in italics) | Outcome |
   |---|---|---|---|---|
   | `react` → `frontend` | 4 | 7 | shadcn/ui, radix, chakra, Next-js-Boilerplate, *next-auth*, *trpc*, *zustand*, *vercel/ai*, *appwrite*, *TanStack/query*, *remotion* | dropped (rule 3) |
   | `vue` → `frontend` | 0 | 3 | *prettier*, *vercel/ai*, *TanStack/query* | dropped (rule 3) |
   | `ui` → `frontend` | 2 | 1 | shadcn/ui, radix, *open-webui* | dropped (rule 3) |
   | `frontend` → `frontend` | 1 | 1 | taste-skill, *Dokploy* | kept |
   | `docker` → `devops` | 5 | 4 | coolify, trivy, docker/compose, build-push-action, Dokploy, *Stirling-PDF*, *uptime-kuma*, *appwrite*, *cookiecutter-django* | kept |
   | `flutter` → `mobile` | 0 | 3 | *immich*, *appwrite*, *AppFlowy* | **dropped** |
   | `mobile-app` → `mobile` | 0 | 1 | *immich* | kept |
   | `android`, `ios`, `react-native` → `mobile` | 0 | 1 each | *appwrite* | kept |
   | `data-visualization` → `data` | 1 | 1 | grafana, *directus* | kept |
   | `analytics` → `data` | 2 | 0 | umami, grafana | kept |
   | `business-intelligence` → `data` | 1 | 0 | grafana | kept |
   | `data-analysis` → `data` | 0 | 1 | *scientific-agent-skills* | kept |
   | `documentation` → `docs` | 0 | 1 | *AppFlowy* | kept |
   | `stripe` → `payments` | 0 | 1 | *better-auth* | kept |
   | `mobile`, `mobile-development`, `swiftui`, `jetpack-compose`, `data-science`, `data-engineering`, `dataviz`, `etl`, `data-pipeline`, `pandas`, `dataframe`, `docs`, `documentation-tool`, `documentation-generator`, `api-documentation`, `technical-writing`, `payments`, `payment`, `payment-gateway`, `payment-processing`, `billing` | 0 | 0 | none in the fixtures | kept |

   Participation counts a vote, not its effect. `react`'s 4 right ones would still be suggested without it, through their other topics, so dropping it costs nothing.
5. **Discover keeps them.** Classification and Discover's search already use two maps: `DOMAIN_MAP` for suggestions, and `DOMAIN_TOPICS` (`src/core/discover.ts`) for the topics `discover --domain` searches. `DOMAIN_TOPICS` is unchanged: `frontend` still searches `react`, `vue` and `css`, and `mobile` searches `android`, `ios` and `flutter`. Its test now accepts a topic that `DOMAIN_MAP` maps to the domain, or one of the three search-only topics (`react`, `vue`, `flutter`), which `DOMAIN_MAP` must not have. 0045's rule for counting a domain's topics again reads from both.

## Measurements
`npm run eval:classification -- --holdout` and `npm run eval:retrieval`, on 2026-11-03, on one machine. The twelve domains are `src/core/domains.ts` before 0055 (at 26feff8, the parent of 0055's code commit 61a8bdd); the old labels are the fixtures as merged with 0055. The rows between the merged and the final map put the dropped rows back at run time.

| First 69 | Kind | Domain precision | Domain recall | Exact domain sets |
|---|---|---|---|---|
| Old labels, twelve domains (0055's baseline) | 37/69 (53.6 %) | 51/75 (68.0 %) | 51/60 (85.0 %) | 44/69 |
| Old labels, sixteen domains (0055 as merged) | 37/69 (53.6 %) | 52/90 (57.8 %) | 52/60 (86.7 %) | 37/69 |
| New labels, sixteen domains (0055 as merged) | 37/69 (53.6 %) | 54/90 (60.0 %) | 54/62 (87.1 %) | 38/69 |
| New labels, no `react` or `ui` | 37/69 (53.6 %) | 54/85 (63.5 %) | 54/62 (87.1 %) | 41/69 |
| **New labels, final** (no `react`, `ui`, `vue` or `flutter`) | 37/69 (53.6 %) | 54/84 (64.3 %) | 54/62 (87.1 %) | 42/69 |

| Held-out 30 | Kind | Domain precision | Domain recall | Exact domain sets |
|---|---|---|---|---|
| Old labels (kinds only) | 15/30 (50.0 %) | none written | none written | none written |
| New labels, sixteen domains (0055 as merged) | 15/30 (50.0 %) | 13/32 (40.6 %) | 13/24 (54.2 %) | 11/30 |
| New labels, no `react` or `ui` | 15/30 (50.0 %) | 13/31 (41.9 %) | 13/24 (54.2 %) | 12/30 |
| **New labels, final** | 15/30 (50.0 %) | 13/29 (44.8 %) | 13/24 (54.2 %) | 12/30 |

Kind doesn't depend on domains: all 99, 52/99 in every row. Retrieval is the same for the old labels on the merged map, the new labels on the merged map and the new labels on the final map, at every decimal: the need as the query 57/82 at 5, 63/82 at 10, MRR 0.57; with aliases 57, 63, 0.57; structured 81, 82, 0.92; with Use when 82, 82, 0.94; suggest 56, 58, 0.56; the catalog 7,384 characters. The one relabelled need already ranks umami first.

**From 0055 as merged to the final map,** 9 wrong suggestions go and no right one: `frontend` on open-webui, next-auth, trpc, zustand, vercel/ai, appwrite and, held out, TanStack/query and remotion; `mobile` on held-out AppFlowy. prettier keeps the same three domains in another order.

**Relabelling explains little of 0055's fall.** It gives back 2.2 of the 10.2 points (57.8 → 60.0 %). By the new labels, the sixteen domains as merged were right 3 more times than the twelve (umami and grafana `data`, docker/compose `devops`) and wrong 12 more times (24 → 36), in the first 69. The final map takes 6 of those 12 away. The other 6 stay: `devops` from `docker` on Stirling-PDF, uptime-kuma and appwrite, `mobile` on immich and appwrite, and `payments` on better-auth from `stripe`. Each is a mapping with 1 wrong suggestion, or with right ones too.

## Consequences
- The eval measures the sixteen domains against labels written for them, on both sets. The held-out set has domains for the first time. Its kinds were seen in 0047, but its domains had not been labelled or scored before. Now that rule 4 was decided on it, it has been seen for domains too: the next mapping change needs new repositories to judge it.
- A new note on a React-only or Vue-only library (an auth library's hooks, a state library, an AI SDK's UI helpers) or a Flutter app is no longer suggested `frontend` or `mobile` by those topics. A UI library still gets `frontend` from its other topics (`ui-components`, `component-library`, `tailwindcss`, `design-system`). A note's existing `domains_suggested` stay as written. Running `repomagpie domains --suggest` suggests from the current map.
- `discover --domain frontend` and `--domain mobile` search the same topics as before. A result's `suggested_domains` come from `DOMAIN_MAP`, so a React library found by `topic:react` may show no `frontend` suggestion.
- The rule leaves mappings with one wrong suggestion and no right one (`stripe`, `mobile-app`, `android`, `ios`, `react-native`, `data-analysis`, `documentation`). The fixtures hold too few repositories on those concerns to judge them.
