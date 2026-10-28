// npm run check:bundle: the local app's size against its two lines (docs/ui.md §10), gzipped (level
// 9): every script and style in dist/ui/ at most 200 kB together, and the first files (index.html and
// the scripts, styles and preloads it names, which every screen but the lazy ones loads) at most
// 104.0 kB, decision 0048's line, with no allowance. Run npm run build first.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUDGET_KB, bundleSizes, FIRST_LOAD_LINE_KB, sum } from "./bundle-sizes.ts";

export interface Limits { budget: number; line: number } // kB of 1,024 bytes
const LIMITS: Limits = { budget: BUDGET_KB, line: FIRST_LOAD_LINE_KB };

const kB = (bytes: number) => (bytes / 1024).toFixed(1);

// The report's lines (stdout) and what fails the check (stderr, exit 1).
export function checkBundle(folder: string, limits = LIMITS): { lines: string[]; errors: string[] } {
  const sizes = bundleSizes(folder);
  const first = sum(sizes.firstLoad);
  const files = [...sizes.firstLoad.map((file) => ({ ...file, lazy: false })), ...sizes.lazy.map((file) => ({ ...file, lazy: true }))].sort((a, b) => a.name.localeCompare(b.name));
  const lines = files.map((file) => `${kB(file.bytes).padStart(7)} kB  ${file.name}${file.lazy ? " (lazy)" : ""}`);
  lines.push(`${kB(sizes.total).padStart(7)} kB  total, gzipped (budget ${limits.budget} kB)`);
  lines.push(`${kB(first).padStart(7)} kB  first files: ${sizes.firstLoad.map((file) => file.name).join(", ")} (decision 0048's line ${limits.line.toFixed(1)} kB)`);
  const errors: string[] = [];
  if (sizes.total > limits.budget * 1024) errors.push(`The app is over its budget by ${kB(sizes.total - limits.budget * 1024)} kB.`);
  if (first > limits.line * 1024) errors.push(`The first files are ${kB(first)} kB: ${kB(first - limits.line * 1024)} kB over decision 0048's line (${limits.line.toFixed(1)} kB).`);
  return { lines, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const folder = fileURLToPath(new URL("../dist/ui/", import.meta.url));
  if (!existsSync(folder)) {
    console.error("No build found in dist/ui/. Run npm run build first.");
    process.exit(1);
  }
  const { lines, errors } = checkBundle(folder);
  for (const line of lines) console.log(line);
  for (const error of errors) console.error(error);
  if (errors.length) process.exitCode = 1;
}
