// The global flags, and the context core needs from a command's I/O. Kept apart from the commands
// so a quick command loads nothing else (spec §7 budgets).
import type { Platform } from "../core/agents.ts";
import type { Fetch } from "../core/github.ts";
import { onceGitHubAuth } from "../core/github-auth.ts";
import { ghLogin } from "../core/github-cli.ts";
import { takeSkipped } from "../core/note-cache.ts";
import type { Context } from "../core/save.ts";
import { clean } from "../core/text.ts";
import type { Io } from "./program.ts";

export interface GlobalOptions {
  json?: boolean;
  home?: string;
  project?: string;
}

export function contextOf(io: Io, options: GlobalOptions): Context {
  const fetch = io.env.REPOMAGPIE_DEBUG_HTTP === "1" ? debugFetch(io.fetch, io.err) : io.fetch;
  // The GitHub token is read on the first request that needs it, once (decision 0053). Tests pass
  // io.gh; without one, gh is looked up on io.env's PATH.
  const gh = io.gh ?? ghLogin({ home: io.home, env: io.env, platform: process.platform as Platform });
  return { home: io.home, env: io.env, cwd: io.cwd, homeFlag: options.home, projectFlag: options.project, fetch, today: io.today, github: onceGitHubAuth(io.env, gh) };
}

// REPOMAGPIE_DEBUG_HTTP=1 (spec §1): one stderr line for each GitHub request, for a diagnosis: this
// machine's time, the path and query, the status, the Date, Retry-After and X-RateLimit-* headers
// GitHub answered with, and the body's first 200 characters when the status isn't 200. Nothing we
// send is printed, so never the token.
const DEBUG_HEADERS = ["date", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-used", "x-ratelimit-reset", "x-ratelimit-resource"];

export function debugFetch(fetch: Fetch, err: (text: string) => void): Fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const line = (text: string) => err(`debug http: ${clean(text.replace(/\s+/g, " "))}\n`);
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      line(`${new Date().toISOString()} GET ${url.pathname}${url.search} failed: ${(error as Error).name}`);
      throw error;
    }
    const headers = DEBUG_HEADERS.flatMap((name) => (response.headers.has(name) ? [`${name}: ${response.headers.get(name)}`] : []));
    const body = response.status === 200 ? "" : ` body: ${(await response.clone().text().catch(() => "")).slice(0, 200)}`;
    line(`${new Date().toISOString()} GET ${url.pathname}${url.search} -> ${response.status}; ${headers.join("; ")}${body}`);
    return response;
  }) as Fetch;
}

// The I/O of a command that prints no colour of its own (note, import, tags, adopt): every line it
// prints is cleaned of control characters, which names, paths and warnings may carry from a note
// (decision 0032, rule 1). Line breaks stay.
// The files and folders a command skipped in a journal (a link, a file over 256 KB), once each,
// on stderr (decision 0032, rules 5 and 6).
export function reportSkipped(io: Io): void {
  for (const problem of takeSkipped()) io.err(`warning: skipped: ${clean(problem)}.\n`);
}

export function plainIo(io: Io): Io {
  return { ...io, out: (text) => io.out(clean(text, true)), err: (text) => io.err(clean(text, true)) };
}
