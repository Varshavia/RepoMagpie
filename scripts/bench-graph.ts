// Benchmark for the graph's data (decision 0028: under 300 ms median, 2,000 notes, warm cache,
// similarity included). It has no command of its own, so graphData runs in this process, as the
// local app's server calls it: once as a warm-up that builds the caches, then 20 times, each reading
// the caches from disk again. The notes carry GitHub-like topics and a language, so similarity has
// work to do. Exits 1 over the budget, unless --report-only. Run with `npm run bench`.
import { graphData } from "../src/core/graph.ts";
import { measureInProcess, withJournal } from "./bench-journal.ts";

withJournal("graph", (_root, journal) => {
  measureInProcess("graphData (warm, ghosts included)", () => graphData(journal, { ghosts: true }), 300);
  const { counts } = graphData(journal, { ghosts: true });
  console.log(`  the graph: ${counts.notes} notes, ${counts.tags} tags, edges ${JSON.stringify(counts.edges_by_type)}`);
}, false, true);
