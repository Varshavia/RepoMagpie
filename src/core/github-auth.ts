// The GitHub token (decision 0053): GITHUB_TOKEN, then GH_TOKEN, then the GitHub CLI's login
// (`gh auth token`, github-cli.ts), so a person signed in to gh needs no environment variable. Read
// once per process and kept in memory only: never written to disk, a log, an error message or the page.
import type { GitHubSource } from "./github-connection.ts";
import type { Env } from "./journals.ts";

export interface GitHubAuth {
  token?: string;
  source: GitHubSource | null;
}

// Runs `gh auth token`: its output, or null when gh isn't there, has no login or doesn't answer.
export type GhLogin = () => string | null;

const TOKEN = /^[A-Za-z0-9_.-]{1,512}$/; // what gh prints; anything else (a message, two lines) is no token

export function readGitHubAuth(env: Env, gh?: GhLogin): GitHubAuth {
  for (const source of ["GITHUB_TOKEN", "GH_TOKEN"] as const) {
    const token = env[source]?.trim();
    if (token) return { token, source };
  }
  const token = gh?.()?.trim();
  return token && TOKEN.test(token) ? { token, source: "gh" } : { source: null };
}

// The first call reads the token; later calls give the same answer (one gh run per process).
export function onceGitHubAuth(env: Env, gh?: GhLogin): () => GitHubAuth {
  let auth: GitHubAuth | undefined;
  return () => (auth ??= readGitHubAuth(env, gh));
}

// The token a request sends: the context's lookup, or the environment alone (a context without one, as in tests).
export function githubAuth(place: { env: Env; github?: () => GitHubAuth }): GitHubAuth {
  return place.github ? place.github() : readGitHubAuth(place.env);
}
