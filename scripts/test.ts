// npm test: runs the product tests, and fails if the real ~/.magpie changed while they ran.
// Tests use scratch folders under .scratch/tests/; this canary catches any that escape.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { changes, snapshot } from "./home-canary.ts";

const journal = join(homedir(), ".magpie");
const before = snapshot(journal);
const run = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), "src/**/*.test.ts"], { stdio: "inherit" });
const changed = changes(before, snapshot(journal));

if (changed.length) {
  process.stderr.write(`\nThe real personal journal ${journal} changed during the tests:\n${changed.map((line) => `  ${line}\n`).join("")}`);
  process.exitCode = 1;
} else {
  process.exitCode = run.status ?? 1;
}
