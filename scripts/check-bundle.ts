// npm run check:bundle: the local app's size against its budget (docs/ui.md §10): the scripts and
// styles in dist/ui/, gzipped (level 9), at most 200 kB together. Run npm run build first.
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGET = 200 * 1024;
const folder = fileURLToPath(new URL("../dist/ui/", import.meta.url));

let files: string[];
try {
  files = readdirSync(folder).filter((name) => [".js", ".css", ".html"].includes(extname(name)));
} catch {
  console.error("No build found in dist/ui/. Run npm run build first.");
  process.exit(1);
}

let total = 0;
for (const name of files.sort()) {
  const size = gzipSync(readFileSync(join(folder, name)), { level: 9 }).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} kB  ${name}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} kB  total, gzipped (budget ${BUDGET / 1024} kB)`);
if (total > BUDGET) {
  console.error(`The app is over its budget by ${((total - BUDGET) / 1024).toFixed(1)} kB.`);
  process.exitCode = 1;
}
