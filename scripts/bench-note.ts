// Benchmark for opening one note by id (GET /api/note: under 50 ms median, 2,000 notes, warm
// caches). The server answers it with noteDocument, run here in this process: once as a warm-up
// that builds the caches, then 20 times, each a different note. Exits 1 over the budget, unless
// --report-only. Run with `npm run bench`.
import { noteDocument } from "../src/core/documents.ts";
import { measureInProcess, NOTES, withJournal } from "./bench-journal.ts";

withJournal("note", (root, journal) => {
  const place = { home: root, env: { MAGPIE_HOME: journal }, cwd: root };
  let i = 0;
  measureInProcess("GET /api/note (noteDocument by id, warm)", () => {
    const id = `pkg:npm/package-${(i++ * 97) % NOTES}`;
    if (noteDocument("personal", { id }, place).outcome !== "ok") throw new Error(`${id} not found`);
  }, 50);
}, false);
