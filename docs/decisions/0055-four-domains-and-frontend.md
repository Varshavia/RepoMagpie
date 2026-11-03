# 0055 — Four domains, and `styling` becomes `frontend`

**Status:** accepted (2026-10-31, from the maintainer's brief, §4). Changes [0040](0040-domains-a-second-axis.md)'s vocabulary (D2, rule 2) and mapping, [0045](0045-discover.md)'s `DOMAIN_TOPICS` (rule 3) and [0043](0043-the-graph-colours-by-domain.md)'s tokens (rule 2). Those records stay as written for everything else; their index rows point here.

## Context
The 12 domains of RFC 0001 left common concerns out. A mobile library, an analytics dashboard, a documentation generator or a payments SDK got no domain, or one that missed the point (`documentation-tool` counted as `tooling`). `styling` covered CSS and design systems but not the UI frameworks people pick a frontend by: `react` and `vue` mapped to nothing. `docker` mapped to nothing too, so `docker/compose` had no domain. Discover's `--domain` could only search what the vocabulary had.

## Decision
1. **Four domains**, after the twelve:

   | Domain | Definition | Topics and tags that name it |
   |---|---|---|
   | `mobile` | Android, iOS and cross-platform mobile apps. | `mobile`, `mobile-app`, `mobile-development`, `android`, `ios`, `react-native`, `flutter`, `swiftui`, `jetpack-compose` |
   | `data` | Analytics, data visualization and ETL pipelines. | `data-science`, `data-engineering`, `data-analysis`, `data-visualization`, `dataviz`, `analytics`, `etl`, `data-pipeline`, `pandas`, `dataframe`, `business-intelligence` |
   | `docs` | Documentation sites, generators and API references. | `documentation`, `docs`, `documentation-tool` (from `tooling`), `documentation-generator`, `api-documentation`, `technical-writing` |
   | `payments` | Payments, checkout and billing. | `payments`, `payment`, `payment-gateway`, `payment-processing`, `stripe`, `billing` |

   Databases stay `database`: `data` is what you do with data, not where you keep it. `tooling`'s definition drops "docs": "Developer tools, CLIs, linters, formatters and editors." The new domains have no README terms (decision 0046) yet; one is added only when `npm run eval:classification` shows it helps.
2. **`styling` becomes `frontend`:** "UI frameworks, components, CSS and design systems." Its rows stay, and `frontend`, `react`, `vue` and `ui` join them. `react` and `vue` are an exception to 0040's rule that a technology's name maps to nothing: what they are for is the frontend.
3. **`styling` stays as an alias,** so existing notes and links keep working. It is read as `frontend` in a note's `domains` and `domains_suggested`, in `--domain` (`note`, `search`, `suggest`, `discover`), in `/api/notes?domain=`, `/api/discover?domain=`, `POST /api/note` and the PATCH's `domains`. `doctor` doesn't report it as unknown. RepoMagpie writes `frontend` when it rewrites the list `styling` is in; a list it edits as text (taking one suggestion out) keeps the others' text, `styling` included. The MCP schema's enum lists the current names only: an agent reads it each session. The caches that hold domains rebuild once (search index version 5, graph 4, note list 4).
4. **`docker` names `devops`.** `docker-compose` and `dockerfile` still name nothing alone.
5. **`DOMAIN_TOPICS`, counted again** on 2026-10-31 by 0045's rule (of the topics `DOMAIN_MAP` maps to the domain alone, the 3 with the most repositories of 10 stars or more, one search each):

   | Domain | Topics | Next |
   |---|---|---|
   | `frontend` | `react` 35,012, `vue` 11,806, `css` 11,770 | `tailwindcss` 8,647 |
   | `devops` | `docker` 21,781, `kubernetes` 10,305, `devops` 4,609 | `github-actions` 4,298 |
   | `mobile` | `android` 31,200, `ios` 15,797, `flutter` 10,886 | `react-native` 6,893 |
   | `data` | `data-science` 6,203, `data-visualization` 3,199, `data-analysis` 2,509 | `pandas` 2,095 |
   | `docs` | `documentation` 4,020, `docs` 1,144, `documentation-tool` 344 | `api-documentation` 284 |
   | `payments` | `stripe` 1,009, `payment` 708, `payments` 680 | `payment-gateway` 458 |

   The other ten domains keep 0045's topics.
6. **Colours.** `domain-frontend` keeps `styling`'s colour. Four tokens join it, dark / light: `mobile` #A8B7F0 / #264AD9, `data` #D7B5E3 / #9A46B9, `docs` #CD827A / #B95246, `payments` #F0A8BB / #D92656. Each is at least 6.42:1 on the dark canvas and 4.61:1 on the light one (0043's floors are 5.55:1 and 4.51:1), and at least as far from every other domain colour as the closest pair of the twelve (OKLab distance 0.063 against 0.048). All sixteen move from `styles.css` to the graph's lazily loaded `GraphPage.css`: only the graph shows them. The domain chips on a note and in the review are neutral, so nothing outside the graph needed a colour.

## Measurements
`npm run eval:classification` and `npm run eval:retrieval`, before (the twelve domains) and after, on the same machine on 2026-10-31. The fixtures' expected `styling` became `frontend`; no other label changed.

| Classification, first 69 | Kind | Domain precision | Domain recall | Exact domain sets |
|---|---|---|---|---|
| Before | 37/69 (53.6 %) | 51/75 (68.0 %) | 51/60 (85.0 %) | 44/69 |
| After | 37/69 (53.6 %) | 52/90 (57.8 %) | 52/60 (86.7 %) | 37/69 |

Kind is unchanged: held-out 15/30, all 99 52/99, before and after. Retrieval is unchanged at two decimals: the need as the query 57/82, 63/82, MRR 0.57; structured 81/82, 82/82, MRR 0.92; with Use when 82/82, 82/82, MRR 0.94; suggest 56/82, 58/82, MRR 0.56; the catalog 7,384 characters.

Domain precision falls because 15 more domains are suggested and 1 more is right by the labels. The labels were written for the twelve, so some of the "wrong" ones fit the new vocabulary (umami is analytics, immich has a phone app); others don't (`react` on an auth or API library).

**Repositories whose suggested domains change** (new suggestion; the label where there is one):

| Set | Repository | Before → after | Label |
|---|---|---|---|
| classification | open-webui/open-webui | ai, api → ai, api, frontend | ai |
| classification | Stirling-Tools/Stirling-PDF | none → devops | none |
| classification | umami-software/umami | none → data | none |
| classification | immich-app/immich | none → mobile | none |
| classification | louislam/uptime-kuma | observability, api → observability, devops, api | observability |
| classification | better-auth/better-auth | auth → auth, payments | auth |
| classification | nextauthjs/next-auth | auth → auth, frontend | auth |
| classification | grafana/grafana | observability, database → data, observability, database | observability |
| classification | trpc/trpc | api → api, frontend | api |
| classification | docker/compose | none → devops | devops |
| classification | pmndrs/zustand | architecture → architecture, frontend | architecture |
| classification | prettier/prettier | tooling, styling, api → frontend, tooling, api (the order only: `ui` adds a vote) | tooling |
| classification | vercel/ai | ai → ai, frontend | ai |
| classification | appwrite/appwrite | none → mobile, devops, frontend | database, auth |
| held-out | TanStack/query | api, performance → api, frontend, performance | none written |
| held-out | remotion-dev/remotion | none → frontend | none written |
| held-out | AppFlowy-IO/AppFlowy | none → docs, mobile | none written |
| held-out | directus/directus | database, api → database, api, data | none written |
| held-out | Dokploy/dokploy | database, devops → database, devops, frontend | none written |
| held-out | K-Dense-AI/scientific-agent-skills | none → data | none written |

The retrieval fixture's 60 repositories change the same way for the 12 they share with the list above (open-webui, Stirling-PDF, umami, immich, uptime-kuma, better-auth, next-auth, grafana, trpc, docker/compose, zustand, vercel/ai), from their topics alone.

**Notes whose suggested domains change**, of the 19 in `examples/vault/` and the skill eval's fixture journal: `open-lakehouse/open-lakehouse` none → `data`, and `vercel-labs/agent-skills` none → `frontend`. No note in the repository holds `styling`.

## Consequences
- A note on a mobile, data, docs or payments project gets a domain, and `discover --domain` searches those concerns.
- `react` and `ui` suggest `frontend` on many libraries that only support React (an auth library's React hooks, an AI SDK's UI helpers). Suggestions are only suggested: the person confirms or dismisses them. The labels predate these domains; relabelling the fixtures for the sixteen would measure the new domains fairly, and is left to the maintainer.
- A journal with `styling` in its notes needs no migration; the files change only when RepoMagpie writes those lists again.
- The first files lose the twelve domain tokens; the graph's chunk gains sixteen. The first files stay at 103.9 kB of 0048's 104.0.
