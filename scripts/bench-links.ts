// Benchmark for the link index (spec §7: under 150 ms median, 2,000 notes, warm cache). It has no
// command of its own, so linkIndex runs in this process, as the local app's server calls it: once as
// a warm-up that builds the cache, then 20 times, each reading the cache from disk again. Exits 1
// over the budget, unless --report-only. Run with `npm run bench`.
import { linkIndex } from "../src/core/links.ts";
import { measureInProcess, withJournal } from "./bench-journal.ts";

withJournal("links", (_root, journal) => {
  measureInProcess("linkIndex (warm)", () => linkIndex(journal), 150);
}, false);
