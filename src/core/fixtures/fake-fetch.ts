// Test helper: a fetch that answers from recorded GitHub responses (fixtures/github/*.json).
// Not part of the build (it bundles only what src/cli/main.ts imports).
import { readFileSync } from "node:fs";
import type { Fetch } from "../github.ts";

export interface Call {
  url: string;
  headers: Record<string, string>;
}

// The recorded responses of one or more fixture files, keyed by "path?query".
export function recorded(...names: string[]): Record<string, unknown> {
  const all: Record<string, unknown> = {};
  for (const name of names) Object.assign(all, JSON.parse(readFileSync(new URL(`github/${name}.json`, import.meta.url), "utf8")).responses);
  return all;
}

// Answers from `responses`; anything else is a 404. `override` may answer a path differently.
export function fakeFetch(responses: Record<string, unknown>, calls: Call[] = [], override?: (path: string) => Response | Promise<Response> | undefined): Fetch {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    calls.push({ url: String(input), headers: { ...(init.headers as Record<string, string>) } });
    const answer = override?.(path);
    if (answer) return answer;
    if (!(path in responses)) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    const body = responses[path];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  }) as Fetch;
}
