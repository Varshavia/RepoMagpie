// Loaded with node --import before magpie ui in the Discover tests (journal.ts, fakeGithub): it
// replaces fetch, so no request leaves the machine. The search's words pick the answer:
//   "ratelimit": GitHub's search limit used up (403, x-ratelimit-resource: search);
//   "pastreset": the same, with a reset time already past (the Windows report);
//   "secondary": GitHub's secondary rate limit (403 with retry-after: 90, requests remaining; longer
//                than the minute magpie ui waits out);
//   "shortwait": the search limit, over in a second, on the query's first request; then the
//                recorded page (magpie ui waits it out and asks again);
//   "halfway":   the request with topic:react answers; any other is rate limited (a domain search
//                that meets the limit on its second request);
//   "offline":   the network fails, as with no connection;
//   "nothing":   no results;
//   "hostile":   one result whose description and topic carry HTML and a bidi control;
//   anything else: the recorded "design system" page (src/core/fixtures/github/search.json), and a
//   made-up page 2 of three results.
// A repository from those results answers /repos/owner/repo with its search item, so Add works,
// except FAILING, which answers 404 as a deleted repository does. Every other path is a 404 (no file
// list, no README: the note is saved with a warning).
import { recorded } from "../../src/core/fixtures/fake-fetch.ts";

type Item = Record<string, unknown> & { full_name: string };

const FAILING = "Netflix/Hystrix";
const HOSTILE_NAME = "evil-org/hostile-repo";

const [first] = Object.values(recorded("search")) as { total_count: number; incomplete_results: boolean; items: Item[] }[];
const more: Item[] = [1, 2, 3].map((n) => ({
  ...first.items[0],
  full_name: `example-org/more-results-${n}`,
  html_url: `https://github.com/example-org/more-results-${n}`,
  description: `Page two, result ${n}.`,
  topics: [],
}));
const rlo = String.fromCharCode(0x202e);
const hostile: Item = {
  ...first.items[0],
  full_name: HOSTILE_NAME,
  html_url: "javascript:void(document.title='pwned')",
  description: `<img src=x onerror="document.title='pwned'"><b>bold</b>${rlo}gnp.exe`,
  topics: ["<script>document.title='pwned'</script>"],
  language: "<b>TypeScript</b>",
};
const known = new Map([...first.items, ...more, hostile].map((item) => [item.full_name.toLowerCase(), item]));

const waited = new Set<string>(); // the "shortwait" queries already limited once

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  if (url.pathname === "/search/repositories") {
    const q = url.searchParams.get("q") ?? "";
    if (q.includes("offline")) throw new TypeError("fetch failed");
    const limited = (offset: number) =>
      json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + offset), "x-ratelimit-resource": "search" });
    if (q.includes("ratelimit")) return limited(600);
    if (q.includes("pastreset")) return limited(-180);
    if (q.includes("secondary")) {
      return json({ message: "You have exceeded a secondary rate limit." }, 403, { "retry-after": "90", "x-ratelimit-remaining": "7", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) - 180), "x-ratelimit-resource": "search" });
    }
    if (q.includes("shortwait") && !waited.has(q)) {
      waited.add(q);
      return limited(1);
    }
    if (q.includes("halfway")) return q.includes("topic:react") ? json({ ...first, total_count: first.items.length }) : limited(600);
    if (q.includes("nothing")) return json({ total_count: 0, incomplete_results: false, items: [] });
    if (q.includes("hostile")) return json({ total_count: 1, incomplete_results: false, items: [hostile] });
    if (url.searchParams.get("page") === "2") return json({ total_count: first.items.length + more.length, incomplete_results: false, items: more });
    return json({ ...first, total_count: first.items.length + more.length });
  }
  const repo = /^\/repos\/([^/]+\/[^/]+)$/.exec(url.pathname)?.[1];
  const item = repo ? known.get(decodeURIComponent(repo).toLowerCase()) : undefined;
  if (item && item.full_name !== FAILING) return json(item);
  return json({ message: "Not Found" }, 404);
}) as typeof fetch;
