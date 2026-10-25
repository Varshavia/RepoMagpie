# 0043 — The graph colours by domain on request, and fetches its data while its code loads

**Status:** accepted (2026-10-25). Adds to [0028](0028-the-graph-page.md) (a second fill encoding, off by default; when the data is fetched) and uses the domains of [0040](0040-domains-a-second-axis.md).

## Context
The graph fills each note by its kind group (0028). Domains (0040) say what concern a note addresses, which is often the question when you look at a journal as a whole: where are my notes on auth, on testing? The kind group answers a different question, and both on one node would need a second mark (a ring or a hollow centre) that the node program doesn't have.

The 2,000-note graph's cold first open grew from 1,966 ms to 2,200 ms over the betas; the test reports it and doesn't fail on it. Profiled on 2026-10-25 (headless Chromium, SwiftShader): about 300 ms went to loading the graph's chunk before the fetch started, about 560 ms to the server's cold graph data, about 1,300 ms to the layout, and 7 ms to sigma's first frame. The graph code changed by 4 lines since beta.5.

## Decision
1. **"Colour by domain", a Draw option, off by default.** With it on, a note takes its first confirmed domain's colour; with none, its first suggested domain's colour, dimmer (40% toward the canvas); with neither, the neutral "other" colour. The inbox fade is off in that mode, so a dim node means one thing. Tags, edges and missing notes keep their colours. The kind-group colours stay the default.
2. **12 domain tokens** in [`DESIGN.md`](../../DESIGN.md), `--domain-<id>`, dark and light. Each full colour is checked against the canvas: at least 5.55:1 in dark and 4.51:1 in light, above the 3:1 the graph's tokens need. The dimmer one is under 3:1 on purpose, as the inbox fade is: the fact it carries is also in words.
3. **Never colour alone** (0028): the legend lists the domains drawn, "Dimmer: a suggested domain" and "Grey: no domain"; the neighbours list and the search box name each note's domain ("security (suggested)", "No domain").
4. **The graph data carries `domain` and `domain_suggested`** on each note node: the first known confirmed domain, else the first known suggested one, else `null`. The graph cache's version goes to 3, so an older cache is rebuilt.
5. **The data is fetched when the graph is asked for**, not when its chunk has loaded: the app's navigation starts the request, and the page takes it once it mounts (or fetches its own when the journal changed in between). Nothing else about the layout or the first frame changes, so the graph looks the same.

## Consequences
- The cold first open went from 2,255, 2,223 and 2,211 ms to 1,931, 1,950 and 2,046 ms (three runs each, same machine); warm from 1,480, 1,537 and 1,467 ms to 1,424, 1,524 and 1,614 ms, within noise. Cold is near 2 s, not safely under it.
- What's left of the cold cost is the layout (its 300 iterations set the look) and the server's cold build, which reads and parses each note twice, once for the link index and once for the graph cache. Parsing once across both caches is the next fix; it isn't part of this decision.
- Domains are new (0040): on most journals today, colour by domain is mostly grey until notes get their domains. `repomagpie domains --suggest` fills the suggested ones.
- Two encodings for fill means a user who switches has to read the legend again. The toggle is in Draw, next to what it changes, and the legend follows it.
