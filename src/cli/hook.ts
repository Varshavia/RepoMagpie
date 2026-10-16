// repomagpie hook <agent> (spec §6, decision 0036): the command each agent's hook runs. Fails open:
// whatever happens, it exits 0, and errors go to <personal journal>/.cache/hook-errors.log, never
// to stdout. So do the files a run skipped (decision 0032, rule 5): the hook prints nothing but its
// answer.
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolvePersonalJournal } from "../core/journals.ts";
import { journalPathProblem, takeSkipped } from "../core/note-cache.ts";
import { hookOutput } from "../hook/claude-code.ts";
import { codexOutput } from "../hook/codex.ts";
import type { HookAgent } from "../hook/agents.ts";
import type { HookContext } from "../hook/core.ts";
import type { GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface HookOptions extends GlobalOptions {
  informOnly?: boolean;
}

const ADAPTERS: Record<HookAgent, (input: string, ctx: HookContext) => string | null> = {
  "claude-code": hookOutput,
  codex: codexOutput,
};

export async function hookCommand(agent: HookAgent, options: HookOptions, io: Io): Promise<number> {
  try {
    const input = io.stdin ? await io.stdin() : "";
    const out = ADAPTERS[agent](input, {
      env: io.env,
      home: io.home,
      cwd: io.cwd,
      informOnly: Boolean(options.informOnly),
      homeFlag: options.home,
      projectFlag: options.project,
    });
    if (out) io.out(`${out}\n`);
    for (const problem of takeSkipped()) log(`skipped: ${problem}`, options, io);
  } catch (error) {
    log(error instanceof Error ? error.stack ?? error.message : String(error), options, io);
  }
  return 0;
}

// Appends to the personal journal's .cache/hook-errors.log, only when that journal exists, and
// never through a link.
function log(message: string, options: HookOptions, io: Io): void {
  try {
    const journal = resolvePersonalJournal({ home: io.home, env: io.env, cwd: io.cwd, flag: options.home }).path;
    const file = join(journal, ".cache", "hook-errors.log");
    if (!statSync(journal).isDirectory() || journalPathProblem(journal, file, false)) return;
    mkdirSync(join(journal, ".cache"), { recursive: true });
    appendFileSync(file, `${new Date().toISOString()} ${message.replace(/\n/g, "\n  ")}\n`);
  } catch {
    // Nowhere to log: stay silent.
  }
}
