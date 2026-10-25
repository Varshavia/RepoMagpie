// Benchmark for `magpie search` (spec §7): 2,000 generated notes, the built CLI run 20 times as
// separate processes after one warm-up run that builds the cache; median and 95th percentile.
// Exits 1 over the budget, unless --report-only. Run with `npm run bench` (it builds first).
import { measure, withJournal } from "./bench-journal.ts";

const QUERY = "pdf stream";

withJournal("search", (root, journal) => {
  measure(`magpie search "${QUERY}"`, root, ["search", QUERY, "--home", journal], 500);
  // Domains and tags also score notes no word finds (decision 0041): every note is a candidate.
  measure(`magpie search "${QUERY}" --domain testing --tag testing`, root, ["search", QUERY, "--domain", "testing", "--tag", "testing", "--home", journal], 500);
});
