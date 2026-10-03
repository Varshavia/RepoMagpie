#!/usr/bin/env node
import { run } from "./program.ts";

process.exitCode = await run(process.argv.slice(2), {
  out: (text) => { process.stdout.write(text); },
  err: (text) => { process.stderr.write(text); },
});
