// Test helper: a fetch that answers GitHub's starred list (GET /user/starred and
// /users/{login}/starred) from fixtures/github/starred.json, padded to `total` stars and paged as
// GitHub pages it (per_page, page). Every other path is a 404. Not part of the build.
//   limitAfter: pages answered before GitHub's rate limit (403, x-ratelimit-remaining 0);
//   status:     every request answers this status (401: a token GitHub rejects).
import { readFileSync } from "node:fs";
import type { Fetch } from "../github.ts";
import type { Call } from "./fake-fetch.ts";

export type StarItem = { starred_at: string; repo: Record<string, unknown> & { full_name: string } };

export const STARRED: StarItem[] = JSON.parse(readFileSync(new URL("github/starred.json", import.meta.url), "utf8")).items;

// The fixture's items, then made-up ones, one a day older each, until `total`.
export function starredItems(total = STARRED.length): StarItem[] {
  const items = STARRED.slice(0, total);
  const oldest = Date.parse(STARRED.at(-1)?.starred_at ?? "2026-01-01T00:00:00Z");
  for (let n = items.length; n < total; n++) {
    const name = `filler-org/repo-${String(n).padStart(5, "0")}`;
    items.push({
      starred_at: new Date(oldest - (n - STARRED.length + 1) * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      repo: { full_name: name, html_url: `https://github.com/${name}`, description: `Filler star ${n}.`, language: n % 2 ? "Python" : "TypeScript", license: { spdx_id: "MIT" }, topics: [n % 3 ? "cli" : "web"], archived: false, is_template: false, pushed_at: "2026-01-01T00:00:00Z" },
    });
  }
  return items;
}

export function fakeStars(options: { items?: StarItem[]; limitAfter?: number; status?: number; calls?: Call[] } = {}): Fetch {
  const items = options.items ?? starredItems();
  const { calls = [] } = options;
  let answered = 0;
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url: String(input), headers: { ...(init.headers as Record<string, string>) } });
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    if (!/^\/(user|users\/[^/]+)\/starred$/.test(url.pathname)) return json({ message: "Not Found" }, 404);
    if (options.status === 401) return json({ message: "Bad credentials" }, 401);
    if (options.limitAfter !== undefined && answered >= options.limitAfter) {
      return json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1800) });
    }
    answered++;
    const perPage = Number(url.searchParams.get("per_page") ?? 30);
    const page = Number(url.searchParams.get("page") ?? 1);
    return json(items.slice((page - 1) * perPage, page * perPage));
  }) as Fetch;
}
