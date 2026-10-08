// Benchmark for `magpie suggest` (spec §7): 2,000 generated notes and a project with 25 dependencies,
// keywords, a description and a README; the built CLI run 20 times as separate processes after one
// warm-up run that builds the caches; median and 95th percentile. Exits 1 over the budget, unless
// --report-only. Run with `npm run bench` (it builds first). It runs twice: on the plain journal, then
// on one where one note in five has alternatives (decision 0029), which every candidate lists.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { measure, withJournal } from "./bench-journal.ts";

const DEPENDENCIES = ["react", "react-dom", "typescript", "vite", "vitest", "eslint", "prettier", "commander", "yaml", "minisearch",
  "@types/node", "@playwright/test", "express", "zod", "lodash", "dayjs", "pdfkit", "puppeteer", "sharp", "axios", "chalk", "debug",
  "dotenv", "package-12", "package-345"];

for (const alternatives of [false, true]) {
  const label = alternatives ? ", 20 % with alternatives" : "";
  withJournal("suggest", (root, journal) => {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "invoices",
      description: "Render PDF invoices from a stream of orders",
      keywords: ["pdf", "render", "cli"],
      dependencies: Object.fromEntries(DEPENDENCIES.map((name) => [name, "*"])),
    }));
    writeFileSync(join(root, "README.md"), "# Invoice renderer\n\nRenders PDF invoices from a stream of orders, with a browser agent and a queue worker.\n");
    measure(`magpie suggest (manifests and README)${label}`, root, ["suggest", "--home", journal], 500);
    measure(`magpie suggest "a TypeScript CLI with tests"${label}`, root, ["suggest", "a TypeScript CLI with tests", "--home", journal], 500);
  }, true, false, alternatives);
}
