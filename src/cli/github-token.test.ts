import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fakeFetch, type Call } from "../core/fixtures/fake-fetch.ts";
import type { Fetch } from "../core/github.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// The GitHub token (decision 0053), from gh's login or the environment, is sent to GitHub and
// nowhere else: not in any output, error, warning or debug line, whatever GitHub answers.

const TOKEN = "gho_FAKE_token_never_printed_0053";
const URL = "https://github.com/microsoft/playwright-cli";

const answers: [string, Fetch][] = [
  ["401", fakeFetch({}, [], () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }))],
  ["403 rate limit", fakeFetch({}, [], () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "4102444800" } }))],
  ["404", fakeFetch({})],
  ["network error", (async () => { throw new TypeError("fetch failed"); }) as Fetch],
];

test("the token from gh is sent as the Authorization header and appears in no output, error or debug line", async () => {
  const box = sandbox();
  const list = join(box.root, "list.md");
  writeFileSync(list, `- ${URL}\n`);
  let ghRuns = 0;
  for (const [what, answer] of answers) {
    const calls: Call[] = [];
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) } });
      return answer(input, init);
    }) as Fetch;
    for (const argv of [["note", URL], ["import", list], ["discover", "pdf", "--domain", "security"]]) {
      for (const json of [[], ["--json"]]) {
        const r = await magpie(box, [...argv, ...json], { fetch, gh: () => (ghRuns++, `${TOKEN}\n`), env: { MAGPIE_HOME: box.journal, REPOMAGPIE_DEBUG_HTTP: "1" } });
        assert.ok(!(r.out + r.err).includes(TOKEN), `${what}: repomagpie ${[...argv, ...json].join(" ")}`);
        assert.match(r.err, /debug http: /, `${what}: the debug lines ran`);
      }
    }
    assert.ok(calls.length > 0);
    for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`, call.url);
  }
  assert.ok(ghRuns > 0);
});

test("a token from GH_TOKEN: the same, and gh isn't asked", async () => {
  const box = sandbox();
  const calls: Call[] = [];
  const r = await magpie(box, ["note", URL], {
    fetch: fakeFetch({}, calls, () => new Response("{}", { status: 401 })),
    gh: () => assert.fail("gh runs only without a token in the environment"),
    env: { MAGPIE_HOME: box.journal, GH_TOKEN: TOKEN, REPOMAGPIE_DEBUG_HTTP: "1" },
  });
  assert.equal(r.code, 1);
  assert.ok(!(r.out + r.err).includes(TOKEN));
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
});
