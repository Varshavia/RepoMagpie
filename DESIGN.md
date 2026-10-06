---
name: RepoMagpie
description: A calm, dark-first journal for the dependencies you judged. Black and white, with one iridescent blue-green accent, used sparingly.
colors:
  # Dark theme (the default)
  canvas: "#0E1012"
  surface-1: "#15181B"
  surface-2: "#1C2024"
  surface-3: "#252A2F"
  hairline: "#2A3036"
  hairline-strong: "#3B434B"
  border-input: "#5F6973"
  ink: "#E6E8EB"
  ink-muted: "#A8AFB7"
  ink-subtle: "#8B939C"
  accent: "#3CC8B4"
  accent-text: "#5FD6C4"
  on-accent: "#06201C"
  accent-wash: "#10302B"
  focus: "#5FD6C4"
  danger: "#F0857A"
  warning: "#E2B54A"
  success: "#5CC98A"
  # Light theme
  light-canvas: "#FAFAF9"
  light-surface-1: "#F2F3F4"
  light-surface-2: "#E9EBED"
  light-surface-3: "#DEE1E4"
  light-hairline: "#DADDE1"
  light-hairline-strong: "#BCC2C8"
  light-border-input: "#7D868F"
  light-ink: "#15181B"
  light-ink-muted: "#4A525A"
  light-ink-subtle: "#566069"
  light-accent: "#0B7A6E"
  light-accent-text: "#0A6E63"
  light-on-accent: "#FFFFFF"
  light-accent-wash: "#DDF1EE"
  light-focus: "#0A6E63"
  light-danger: "#B03A2E"
  light-warning: "#875700"
  light-success: "#1B6B3C"
typography:
  headline-md:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  verdict:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1.5
  title-sm:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
  label-sm:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.04em
  mono-sm:
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 48px
  row-height: 32px
  list-row-height: 52px
  list-row-tall-height: 72px
  sidebar-width: 232px
  list-width: 360px
components:
  sidebar:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    width: 232px
  sidebar-item:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 28px
    padding: 0 8px
  sidebar-item-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  sidebar-item-active:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
  sidebar-count:
    textColor: "{colors.ink-subtle}"
    typography: "{typography.label-md}"
  list-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    height: 52px
    padding: 0 12px
  list-row-hover:
    backgroundColor: "{colors.surface-1}"
  list-row-selected:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.ink}"
  list-row-secondary:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
  list-row-why:
    textColor: "{colors.ink-subtle}"
    typography: "{typography.body-sm}"
  note-title:
    textColor: "{colors.ink}"
    typography: "{typography.headline-md}"
  verdict-hero:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.verdict}"
    rounded: "{rounded.lg}"
    padding: 16px
  verdict-empty:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.verdict}"
    rounded: "{rounded.lg}"
    padding: 16px
  section-label:
    textColor: "{colors.ink-subtle}"
    typography: "{typography.label-sm}"
  section-label-avoid:
    textColor: "{colors.danger}"
    typography: "{typography.label-sm}"
  draft-badge:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.warning}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 0 8px
  status-inbox:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.warning}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 0 8px
  status-reviewed:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.success}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 0 8px
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    height: 22px
    padding: 0 8px
  chip-selected:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent-text}"
  metadata-chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.full}"
    height: 22px
    padding: 0 8px
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 28px
    padding: 0 12px
  button-primary-hover:
    backgroundColor: "{colors.accent-text}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 28px
    padding: 0 12px
  button-secondary-hover:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 28px
    padding: 0 8px
  button-ghost-hover:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 0 12px
  text-input-placeholder:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
  text-input-error:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.danger}"
  verdict-editor:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.verdict}"
    rounded: "{rounded.lg}"
    padding: 12px
  command-palette:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    width: 640px
  kbd:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.sm}"
    padding: 0 4px
  banner-conflict:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.warning}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  banner-read-only:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  toast:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 8px 12px
  skeleton:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.sm}"
  empty-state:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-md}"
---

# RepoMagpie design system

This file describes how RepoMagpie looks and reads: the local app (`magpie ui`), and later the landing page, the social preview and the demo GIF. It follows the [DESIGN.md format](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md) (version `alpha` on 2026-10-04): tokens above, reasons below. Only the format's stable core is used: the token groups and the section order. How the app uses it: [docs/ui.md](docs/ui.md); why this stack: [decision 0022](docs/decisions/0022-frontend-stack.md).

## Overview

**Character:** a quiet place to decide. Obsidian-inspired: a calm dark canvas, information-dense but unhurried, keyboard-first. Text carries the interface; chrome stays out of the way.

**Identity:** a magpie is black and white, with a blue-green sheen on its wings and tail that shows only in the right light. The interface does the same: near-black and near-white, and one iridescent blue-green accent for the few things that matter: the selected row, the focused control, the primary action. Everything else is grey.

**Principles**
- **The Verdict is the hero.** Every list row and every note leads with it ([decision 0018](docs/decisions/0018-ai-drafts-humans-decide.md)). A note without one says so plainly.
- **Dense, not cramped.** Two-line list rows of 52 px, 14 px body text, generous line height inside the note.
- **Keyboard-first.** Every action has a key, focus is always visible, and the command palette (Ctrl/Cmd+K) reaches everything.
- **Colour carries meaning only** (inbox, reviewed, draft, avoid, selection, focus), and never alone: every coloured item also has a word or a shape.
- **Dark first.** Dark is the default; light is a full theme, not an afterthought. Both follow `prefers-color-scheme`.

## Colors

The palette is two neutral ramps (dark and light) with one accent and three semantic colours. Token names without a prefix are the dark theme; `light-` names are the light theme. In CSS, each token becomes a custom property (`--canvas`, `--ink`, …), and the light theme redefines them under `prefers-color-scheme: light` or an explicit theme setting.

### Brand & Accent
- **Accent (`accent`, dark #3CC8B4; light #0B7A6E):** the magpie's blue-green. Used for the primary button, the selected row's wash and edge, the focus ring, selected filters, and the Verdict's edge. Never for large areas, never as a gradient.
- **Accent text (`accent-text`):** the accent when it is text on a surface; a step lighter (dark) or darker (light) so it passes AA.
- **Accent wash (`accent-wash`):** the selected row's background. Text on it stays `ink`.
- **On accent (`on-accent`):** text on the accent: deep green-black on dark, white on light.

### Surface
- **Canvas:** the page and the note pane.
- **Surface 1–3:** the sidebar (1), raised controls and chips (2), hovered or active items and keyboard keys (3). Each step is a small, even lift; there are no shadows on surfaces.
- **Hairline / hairline-strong:** dividers between panes and rows. Decorative only.
- **Border input:** the outline of inputs and the Verdict editor, at 3:1 or more against `canvas` and `surface-1`, which is where inputs are placed.

### Text
- **Ink:** primary text and the Verdict.
- **Ink muted:** secondary text: list metadata, sidebar items, "Use when" bullets.
- **Ink subtle:** tertiary text: section labels, counts, placeholders. Still AA on every surface it is used on.

### Semantic
- **Warning (amber):** `inbox` and drafts: things still waiting for your judgment.
- **Success (green):** `reviewed`.
- **Danger (coral red):** the "Avoid when" label and errors. The same colour role the CLI gives "Avoid when" ([spec](docs/spec.md), section 8).

### Contrast
Checked with the WCAG 2 relative-luminance formula on 2026-10-04. Text needs 4.5:1 (AA), inputs and the focus ring 3:1.

| Pair | Dark | Light |
|---|---|---|
| `ink` on `canvas` | 15.53 | 17.06 |
| `ink-muted` on `surface-1` | 8.05 | 7.14 |
| `ink-subtle` on `surface-3` (the lowest pair) | 4.65 | 4.89 |
| `accent-text` on `canvas` | 10.81 | 5.87 |
| `on-accent` on `accent` | 8.21 | 5.22 |
| `danger` on `canvas` | 7.57 | 5.76 |
| `warning` on `surface-2` | 8.54 | 5.18 |
| `success` on `surface-2` | 7.94 | 5.47 |
| `border-input` on `canvas` (3:1) | 3.41 | 3.54 |
| `focus` on `canvas` (3:1) | 10.81 | 5.87 |

## Typography

### Font Family
- **Sans:** the system stack (`ui-sans-serif`, `system-ui`, then platform fonts). It renders instantly, matches the operating system, and costs nothing in the bundle. No remote fonts, no bundled font files.
- **Mono:** the system monospace stack, for PURLs, file paths, skill names and keyboard keys.

### Hierarchy
| Token | Use |
|---|---|
| `headline-md` 20/600 | The note's name in the note pane |
| `verdict` 17/500 | The Verdict, in the note and in the editor |
| `title-sm` 15/600 | Pane titles, dialog titles |
| `body-md` 14/400 | List rows, section text, inputs |
| `body-sm` 13/400 | Secondary row text, banners, toasts |
| `label-md` 12/500 | Buttons, chips, badges, counts |
| `label-sm` 11/600, +0.04em | Section labels ("USE WHEN", "AVOID WHEN"), sidebar group labels |
| `mono-sm` 12/400 | PURLs, paths, skill names, keys |

### Principles
- One family per role; weight, not a second font, makes emphasis.
- Section labels are small capitals in `ink-subtle`; the section's content is what you read.
- Numbers in counts use tabular figures (`font-variant-numeric: tabular-nums`).

## Layout

### Spacing System
A 4 px base: `xxs` 2, `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32, `section` 48. List rows are 52 px high, two lines (`list-row-height`); Suggest's rows 72 px, three lines (`list-row-tall-height`); palette rows 32 px (`row-height`); sidebar items 28 px.

### Three panes
- **Sidebar** (`sidebar-width`, 232 px): journal switcher (Personal / Project), Inbox with a count, kinds, tags, settings.
- **List** (`list-width`, 360 px, resizable): the inbox, a filtered list, or search results. Virtualised.
- **Note** (the rest): the selected note, with a readable measure of about 72 characters.

Below 960 px the sidebar collapses to icons; below 720 px one pane shows at a time, with a back action.

### Whitespace Philosophy
Density lives in the list; air lives in the note. The list packs rows tightly so you can scan many; the note gives the Verdict and its sections room, so you can decide.

## Elevation & Depth

Flat. Hierarchy comes from the surface ramp, hairlines and type weight, not shadows. Two exceptions float above the panes and get one soft, dark shadow tinted toward the canvas: the command palette and toasts. Dialogs dim the canvas behind them.

## Shapes

One radius scale, with one rule:
- **`md` (6 px):** buttons, inputs, sidebar items, banners.
- **`lg` (8 px):** the Verdict block, the Verdict editor, the command palette, toasts.
- **`full`:** chips and badges (tags, status, draft, metadata).
- **`sm` (4 px):** keyboard keys and skeleton bars.
- **`none`:** list rows and panes. They are bands, not cards.

No other radii, and no mixing within one component.

## Components

Every interactive component has these states: default, hover, focus-visible (a 2 px `focus` ring, offset 2 px), active or selected, disabled (opacity 0.5, no pointer events), and, where it applies, loading and error.

- **Sidebar item:** icon, label, count on the right. Active: `surface-3` and `ink`.
- **List row:** two lines. Line 1: the name (cut with `…`, the full name on hover) and the PURL type on the right; in search, also the journal. Line 2: the Verdict in `ink-muted`, or "no verdict yet". In Suggest, line 3: why the note is a candidate, in `ink-subtle` ("Why: dependency @playwright/test; matched coding, agent"). The "Inbox" badge appears where a list mixes statuses, not in the Inbox itself. Selected: `accent-wash` and a 2 px `accent` edge on the left. Keyboard focus moves the selection (`j`/`k`); `Enter` opens.
- **Verdict hero:** the Verdict in `verdict` type on `surface-1`, with a 3 px `accent` edge on the left in both themes, so it stands out from the page in light too. Empty: "No verdict yet" in `ink-muted`, with a `hairline-strong` edge and a "Write the Verdict" action.
- **Section label:** "Use when", "Avoid when", "What it does", and so on. "Avoid when" is `danger` only when the section has text; an empty one stays `ink-subtle`.
- **Links:** `ink` with an underline in `hairline-strong`, `currentColor` on hover. The underline marks a link, not the colour.
- **Draft badge:** "Draft" next to a drafted section's label; an "Accept" action removes the marker ([decision 0023](docs/decisions/0023-api-is-the-json-contract.md)).
- **Status badge:** "Inbox" (amber) or "Reviewed" (green), always with the word.
- **Chip:** tags and filters. Selected: `accent-wash` and `accent-text`.
- **Metadata chip:** licence, language, packages, in mono.
- **Buttons:** primary (one per view at most), secondary, ghost. Labels are one to three words.
- **Text input and Verdict editor:** `border-input` outline; focus adds the ring; error turns the outline and helper text `danger`, with the message in words.
- **Command palette:** centred, 640 px, `surface-2`, results grouped (Notes, Skills, Actions), each with its key hint in a `kbd`.
- **Banners:** conflict (the note changed on disk: "Reload"), read-only (the note can't be parsed: "Open in editor").
- **Toast:** short confirmations ("Verdict saved"), bottom right, 4 s, never the only place an error appears.
- **Skeleton:** bars shaped like the rows they replace. No spinners in lists.
- **Empty state:** one sentence and one action, for example "Your inbox is empty. Add a repository with Ctrl+K."

## Do's and Don'ts

- **Do** lead with the Verdict everywhere.
- **Do** use the accent only for selection, focus, the one primary action in view, and the Verdict's edge.
- **Do** pair every colour with a word or a shape.
- **Do** keep everything reachable from the keyboard, and show the key.
- **Don't** add gradients, glows, glass effects or decorative shadows.
- **Don't** use a second accent, or a brand's palette from any reference.
- **Don't** use cards for list items; rows are bands.
- **Don't** use emoji in the interface.
- **Don't** load anything from the network for the interface: no fonts, icons or images from a CDN.

## Motion

Short and optional. State changes fade or slide in 120 ms (small) or 180 ms (panes, palette) with `ease-out`. No looping animations, no motion on scroll. Under `prefers-reduced-motion: reduce`, every transition is instant.

## Iconography

One family: Phosphor, regular weight, 16 px in rows and buttons, 20 px in the sidebar, stroke-based outlines in `currentColor`. Shipped as inline SVG components with Phosphor's MIT licence notice ([decision 0022](docs/decisions/0022-frontend-stack.md)); no icon font, nothing drawn by hand. An icon never stands alone without a label or a tooltip.

The logo is the one drawn graphic: a magpie in profile on a rounded `light-canvas` tile, in `light-ink` with a `light-canvas` flank, and the tail in `light-accent` (5:1 on the tile; `accent` would be under 2:1). The tile keeps it readable on light and dark pages and in a browser tab at 16 px. Files: [`docs/assets/logo.svg`](docs/assets/logo.svg) (also the app's favicon) and the social preview [`docs/assets/social-preview.png`](docs/assets/social-preview.png) (1280×640, on `canvas`).

## Writing

The same rules as the CLI (CLAUDE.md, section 12): short sentences, active voice, concrete words, no marketing adjectives.
- **Labels** say what happens: "Save Verdict", not "Submit".
- **Empty states** say what to do next, in one sentence.
- **Errors** say what happened and what to do: "This note changed on disk since you opened it. Reload to see the new version."
- **Drafts** are always called drafts; the Verdict is always the person's own words.

## Terminal theme

The demo GIF's terminal uses the same tokens: background `canvas`, foreground `ink`, cursor `accent`; ANSI black `surface-2`, red `danger`, green `success`, yellow `warning`, blue and cyan `accent-text`, magenta `ink-muted`, white `ink`; the bright variants use the same values, with bright black `ink-subtle`.
