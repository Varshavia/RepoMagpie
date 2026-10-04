# 0022 — Frontend stack

**Status:** accepted (2026-10-04). The maintainer approved the dependencies below on 2026-10-04 (CLAUDE.md, section 9).

## Context
The local app ([0021](0021-local-ui-server.md)) needs a frontend. It is served by `magpie ui` as a static bundle, so frontend libraries are bundled at publish time: they are **devDependencies**, and the npm package's runtime dependencies don't grow.

The maintainer explored repositories that shape how the app is built ([seed repositories](../seed-repos.md); [UI](../ui.md), "Design process"). Two of them assume a stack: `vercel-labs/agent-skills` (`react-best-practices`) and `Leonxlnx/taste-skill`.

Budgets the stack must meet ([UI](../ui.md), "Budgets"): at most 200 kB gzipped for the UI bundle; first render with 2,000 notes under 1 s on a mid-range laptop; long lists virtualised.

## Decision
- **React 19, TypeScript and Vite.** Plain CSS, with the [`DESIGN.md`](../../DESIGN.md) tokens as CSS custom properties.
- **No component framework, UI kit, CSS framework or animation library** at first. A small set of our own components, built from `DESIGN.md`.
- **List virtualisation is our own** (fixed row heights, windowing), not a library.
- **Icons:** inline SVG components, no icon font. The paths are copied from Phosphor Icons (MIT, regular weight), only for the icons we use, with the licence notice kept next to them. Nothing is drawn by hand, and nothing is added as a package.
- **Fonts:** the system font stack and a system monospace. No remote fonts, no bundled font files.
- **End-to-end tests:** `@playwright/test`, in one CI job, Chromium only. During development, the agent uses `playwright-cli` (a tool on the agent's machine, not a project dependency) to drive the running app and take screenshots.

**Dependencies, approved by the maintainer on 2026-10-04** (figures from the npm registry, 2026-10-04):

| Package | Version | Licence | Runtime deps | Kind | Why |
|---|---|---|---|---|---|
| `react` | 19.3.0 | MIT | none | dev (bundled) | UI library |
| `react-dom` | 19.3.0 | MIT | `scheduler` | dev (bundled) | DOM renderer |
| `vite` | 8.3.2 | MIT | postcss, rolldown, picomatch, tinyglobby, lightningcss | dev | Bundler and dev server |
| `@vitejs/plugin-react` | 6.1.1 | MIT | `@rolldown/pluginutils` | dev | JSX and Fast Refresh |
| `@types/react` | 19.3.0 | MIT | `csstype` | dev | Types |
| `@types/react-dom` | 19.3.0 | MIT | none | dev | Types |
| `@playwright/test` | 1.63.0 | Apache-2.0 | `playwright` | dev | End-to-end tests in CI |

Plus, not a package: the SVG paths of the Phosphor icons we use (`@phosphor-icons/core` 2.1.1, MIT), copied into `ui/` with the licence.

**Measured** (2026-10-04, gzip level 9 of the published files): `react` 19.3.0 production build 4.5 kB; `react-dom` 19.3.0 client production build 107.9 kB; `scheduler` 2.4 kB. React 19 publishes these files unminified, so about 115 kB is an upper bound before the bundler minifies them. Even that fits the 200 kB budget; the real bundle is checked on `feat/ui-app`. For comparison, Preact 11.0.0's core is 4.8 kB gzipped.

### Alternatives
| Option | For | Against | Verdict |
|---|---|---|---|
| **React 19** | `react-best-practices` and `taste-skill` are written for it; the largest pool of examples and contributors | The largest of the three | **Chosen** |
| Preact (with `preact/compat`) | About 5 kB core; React-like API | React-targeted guidance and libraries need the compat layer, which has edge cases; one more thing to explain to contributors | Fallback if the bundle budget is ever at risk |
| Svelte 5 | Small output, no virtual DOM | None of the skills we chose target it; a compiler and a different mental model for contributors; 15 dependencies in the compiler | Rejected |

### What we take from `taste-skill`, and what we skip
Verified against its `skills/taste-skill/SKILL.md` on 2026-10-04. Its own scope is "landing pages, portfolios, and redesigns. Not dashboards, not data tables", so it guides the app's character, not its dense lists.

| `taste-skill` says | We |
|---|---|
| Tailwind v4 by default | **Skip.** Plain CSS with `DESIGN.md` tokens: one fewer dependency, and the tokens stay the single source |
| Motion (`motion/react`) for animation | **Skip.** Short CSS transitions only, off under `prefers-reduced-motion` |
| Next.js and Server Components | **Skip.** A static bundle served locally has no server rendering |
| An icon library; "never hand-roll SVG icons"; one family per project | **Adopt the intent:** one family (Phosphor), real icon paths, nothing drawn by hand. Copied as inline SVG instead of installed |
| Self-hosted fonts; avoid Inter as a reflex default; Geist suggested | **Partly.** No remote fonts, as it says; but the system stack instead of a bundled font, for the bundle budget and native feel |
| Avoid the "AI purple glow", generic gradients, three equal cards | **Adopt.** Neutral greys, one accent ([`DESIGN.md`](../../DESIGN.md)) |
| One corner-radius scale, with a documented rule | **Adopt** ([`DESIGN.md`](../../DESIGN.md), Shapes) |
| Skeleton loaders shaped like the content; composed empty states that say how to start | **Adopt** ([UI](../ui.md), "States") |
| Button, form and focus contrast checked against WCAG AA | **Adopt.** Every token pair in `DESIGN.md` is checked |
| Emoji discouraged | **Adopt** |
| Hero, landing-page and portfolio rules | **Later**, for the landing page in v0.1 Launch |

## Consequences
- The npm package's runtime dependencies stay as they are; the app ships as files in `dist/ui/`.
- `npm ci` gets heavier for contributors (Vite, Playwright browsers in the e2e job only).
- A bundle-size check runs before each UI pull request; if React plus our code ever passes 200 kB gzipped, Preact is the first fallback to evaluate.
- The icon paths are third-party content under MIT: the licence notice travels with them.
