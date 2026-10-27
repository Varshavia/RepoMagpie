// Benchmark for `repomagpie catalog` (spec §7): 2,000 generated notes, the built CLI run 20 times as
// separate processes after one warm-up run that builds the caches; median and 95th percentile, with
// the largest page (1,000 rows). Then the size of `--json` (compact rows) and `--full --json` for 100
// and 800 rows, the journal sizes an agent might read whole (decision 0034). Exits 1 over the budget,
// unless --report-only.
import { spawnSync } from "node:child_process";
import { cli, log, measure, withJournal } from "./bench-journal.ts";

withJournal("catalog", (root, journal) => {
  measure("repomagpie catalog --json --limit 1000", root, ["catalog", "--json", "--limit", "1000", "--home", journal], 500);
  for (const full of [false, true]) {
    for (const rows of [100, 800]) {
      const args = ["catalog", "--json", ...(full ? ["--full"] : []), "--limit", String(rows), "--home", journal];
      const out = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" }).stdout;
      log(`  ${full ? "--full --json" : "--json"} for ${rows} rows: ${out.length.toLocaleString("en")} characters (${Math.round(out.length / rows)} a row)`);
    }
  }
});
