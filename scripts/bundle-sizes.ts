// The local app's sizes, gzipped (level 9), as check:bundle and measure count them (docs/ui.md §10).
// The first files are what every screen but the lazy ones loads: index.html and the scripts, styles
// and module preloads its tags name. Every other script and style is a lazy chunk (the graph, Discover,
// the layout worker). Run npm run build first.
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { gzipSync } from "node:zlib";

// docs/ui.md §10's two lines, in kB of 1,024 bytes: every script and style together, and the first
// files: 3 kB over 99.4 kB, their size before the graph (decision 0028).
export const BUDGET_KB = 200;
export const FIRST_LOAD_LINE_KB = 102.4;

export interface Sized { name: string; bytes: number }
export interface BundleSizes { total: number; firstLoad: Sized[]; lazy: Sized[] }

const gzipped = (file: string) => gzipSync(readFileSync(file), { level: 9 }).length;

// The files index.html loads itself: <script src>, <link rel="stylesheet" href> and
// <link rel="modulepreload" href>, by file name (the server serves dist/ui/ under /assets/).
export function entryFiles(html: string): string[] {
  const names: string[] = [];
  for (const [tag] of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const attribute = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
    const src = tag.toLowerCase().startsWith("<script") ? attribute("src") : ["stylesheet", "modulepreload"].includes((attribute("rel") ?? "").toLowerCase()) ? attribute("href") : undefined;
    if (src) names.push(basename(src.split(/[?#]/)[0]));
  }
  return names;
}

// Throws when the folder has no index.html, or index.html names a file the folder doesn't have.
export function bundleSizes(folder: string): BundleSizes {
  const files = readdirSync(folder).filter((name) => [".js", ".css", ".html"].includes(extname(name))).sort();
  if (!files.includes("index.html")) throw new Error(`no index.html in ${folder}`);
  const entries = new Set(["index.html", ...entryFiles(readFileSync(join(folder, "index.html"), "utf8"))]);
  for (const name of entries) if (!files.includes(name)) throw new Error(`index.html loads ${name}, which isn't in ${folder}`);
  const firstLoad: Sized[] = [];
  const lazy: Sized[] = [];
  for (const name of files) (entries.has(name) ? firstLoad : lazy).push({ name, bytes: gzipped(join(folder, name)) });
  const total = [...firstLoad, ...lazy].reduce((sum, file) => sum + file.bytes, 0);
  return { total, firstLoad, lazy };
}

export const sum = (files: Sized[]) => files.reduce((total, file) => total + file.bytes, 0);
