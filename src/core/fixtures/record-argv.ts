// Test helper: a fake command that writes the arguments it received, as JSON, to RECORD_FILE (one
// line per run). The agent-CLI tests start it through a .cmd shim on Windows, as npm installs CLIs.
// Not part of the build.
import { appendFileSync } from "node:fs";

// With RECORD_CWD set, the folder it ran in instead.
appendFileSync(process.env.RECORD_FILE as string, `${JSON.stringify(process.env.RECORD_CWD ? process.cwd() : process.argv.slice(2))}\n`);
