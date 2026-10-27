// Test helper, loaded with node --import before the CLI (npm run check:build) or the app's server
// (the end-to-end tests): it replaces fetch with recorded answers from GitHub's search
// (github/search.json), so no request leaves the machine. Every search gets the recorded page,
// whatever its query and date; anything else is a 404. Not part of the build.
import { recorded } from "./fake-fetch.ts";

const [answer] = Object.values(recorded("search"));

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  if (url.pathname === "/search/repositories") return new Response(JSON.stringify(answer), { status: 200 });
  return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
}) as typeof fetch;
