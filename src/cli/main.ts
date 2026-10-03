#!/usr/bin/env node
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { run } from "./program.ts";

process.exitCode = await run(process.argv.slice(2), {
  out: (text) => { process.stdout.write(text); },
  err: (text) => { process.stderr.write(text); },
  env: process.env,
  cwd: process.cwd(),
  home: homedir(),
  fetch: globalThis.fetch,
  today: () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  },
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask: async (question) => {
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return await terminal.question(question);
    } finally {
      terminal.close();
    }
  },
});
