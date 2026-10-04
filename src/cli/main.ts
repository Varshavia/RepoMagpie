#!/usr/bin/env node
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import type { Io } from "./program.ts";

const io: Io = {
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
  columns: process.stdout.isTTY ? process.stdout.columns : undefined,
  stdin: async () => {
    if (process.stdin.isTTY) return ""; // typed by hand: there is no tool call to read
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  },
  ask: async (question) => {
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return await terminal.question(question);
    } finally {
      terminal.close();
    }
  },
};

// The hook runs before every shell command in Claude Code, so its usual command line skips the
// command-line parser and the other commands (spec §7 budget). Any other form takes the full CLI.
const argv = process.argv.slice(2);
const hookOnly = argv[0] === "hook" && argv[1] === "claude-code" && argv.slice(2).every((arg) => arg === "--inform-only");
process.exitCode = hookOnly
  ? await (await import("./hook.ts")).hookCommand({ informOnly: argv.length > 2 }, io)
  : await (await import("./program.ts")).run(argv, io);
