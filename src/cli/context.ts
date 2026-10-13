// The global flags, and the context core needs from a command's I/O. Kept apart from the commands
// so a quick command loads nothing else (spec §7 budgets).
import type { Context } from "../core/save.ts";
import { clean } from "../core/text.ts";
import type { Io } from "./program.ts";

export interface GlobalOptions {
  json?: boolean;
  home?: string;
  project?: string;
}

export function contextOf(io: Io, options: GlobalOptions): Context {
  return { home: io.home, env: io.env, cwd: io.cwd, homeFlag: options.home, projectFlag: options.project, fetch: io.fetch, today: io.today };
}

// The I/O of a command that prints no colour of its own (note, import, tags, adopt): every line it
// prints is cleaned of control characters, which names, paths and warnings may carry from a note
// (decision 0032, rule 1). Line breaks stay.
export function plainIo(io: Io): Io {
  return { ...io, out: (text) => io.out(clean(text, true)), err: (text) => io.err(clean(text, true)) };
}
