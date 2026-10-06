# 0025 — Bundle the CLI

**Status:** accepted (2026-10-06). Changes how [0015](0015-typescript-on-node.md)'s published JavaScript is built; the language, the Node floor and running the source under type stripping are unchanged.

## Context
The Claude Code hook runs before every shell command, and `magpie recall` before every install in skill mode. Both have a 150 ms budget ([spec](../spec.md), section 7). On a Windows dev machine (2026-10-06, Node 24.13, 2,000 notes, median of 20 runs) the `tsc` build in `dist/` measured: recall 154 ms, the hook 152 ms with a note and 110 ms without an install. Over budget, or at it.

Where the time went, measured on the same machine:
- Node itself starts in about 36 ms (`node -e 0`).
- Loading the modules took about 66 ms more, before any work. Almost all of it is the libraries, and most of that is the number of files: `yaml` is 76 files (about 41 ms), `packageurl-js` 15 (14–24 ms), `commander` 13 (10–13 ms). Our own modules take a few milliseconds.
- The work itself: about 45 ms for recall and for the hook with a note (reading the cached entries of 2,000 notes); almost nothing for the hook without an install.

Options measured (same machine, same journal, outputs equal to the `tsc` build's):

| Build | Hook, no install | Hook, with a note | Recall |
|---|---|---|---|
| `tsc`, one file per module (before) | 104 ms | 145 ms | 153 ms |
| Node's compile cache on the one-file bundle | 77 ms | 120 ms | 122 ms |
| One bundled file (565 kB) | 83 ms | 127 ms | 126 ms |
| A bundled entry and its chunks, loaded on demand | 63 ms | 106 ms | 110 ms |

The one-file bundle still parses the command-line parser and every command on the hook's path. With chunks, the hook loads only its own code. Node's compile cache saves 3–6 ms on top and writes a cache folder outside the journal, so it is left out.

## Decision
- **`npm run build` bundles the CLI with Vite** (`scripts/build-cli.ts`): `src/cli/main.ts` and everything it imports, the libraries included, into `dist/cli/`: `main.js` and the chunks it loads on demand, side by side. Vite is already a dev dependency ([0022](0022-frontend-stack.md)); nothing new is installed.
- **The chunks sit next to `main.js`**, so the paths core resolves from `import.meta.url` (`../../package.json`, `../../dist/ui/`) hold from `src/` and from `dist/cli/` alike.
- **The bundled libraries' licences** go to `dist/cli/THIRD-PARTY-LICENSES.md` (Vite's `build.license`), which is published with the package.
- **Not minified**, so a stack trace in the hook's error log stays readable.
- **`npm run check:build`** runs the built CLI and the source on the same scratch journal and requires the same output; the hook fails open, so a broken bundle would otherwise go unnoticed.
- Tests keep running on the source; `tsc` only typechecks (`tsconfig.build.json` is removed).

## Consequences
- On the Windows dev machine, by the benchmark (`npm run bench`): recall 154 → 113 ms, the hook 152 → 108 ms with a note and 110 → 64 ms without an install.
- `commander`, `minisearch`, `packageurl-js` and `yaml` are now bundled. They stay in `dependencies` for now, so npm still installs them; they move to `devDependencies` (as 0022 does for the app's libraries) on the launch-prep branch, so the published package has no runtime dependencies.
- The remaining time for an install with a note is mostly reading the cached entries. That is a separate optimisation, if needed.
