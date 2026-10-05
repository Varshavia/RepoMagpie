// The global flags, and the context core needs from a command's I/O. Kept apart from the commands
// so a quick command loads nothing else (spec §7 budgets).
import type { Context } from "../core/save.ts";
import type { Io } from "./program.ts";

export interface GlobalOptions {
  json?: boolean;
  home?: string;
  project?: string;
}

export function contextOf(io: Io, options: GlobalOptions): Context {
  return { home: io.home, env: io.env, cwd: io.cwd, homeFlag: options.home, projectFlag: options.project, fetch: io.fetch, today: io.today };
}
