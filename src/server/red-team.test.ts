import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { sandbox } from "../cli/fixtures/sandbox.ts";
import { watchJournals } from "./live.ts";
import { startServer } from "./server.ts";

// The red-team pass on feat/hardening (brief §4.5), the local app's server: one test per finding,
// named R<n> as in the report's table. The attacker is a web page or a local program; R7 needs the
// session token, which only the app has.

async function start(t: TestContext, requestTimeoutMs?: number) {
  const box = sandbox();
  const server = await startServer({
    context: { home: box.home, env: { MAGPIE_HOME: box.journal }, cwd: box.project, fetch: () => Promise.reject(new Error("no network")), today: () => "2026-10-13" },
    open: async () => {},
    log: () => {},
    assets: join(box.root, "no-app"),
    ...(requestTimeoutMs ? { requestTimeoutMs } : {}),
  });
  t.after(() => server.close());
  return server;
}

// A write with every check passed, whose body is `first`, then nothing more, while it waits.
function hangingWrite(port: number, token: string, headers: Record<string, string>, first: string): Promise<{ status: number | null; ms: number }> {
  const started = performance.now();
  return new Promise((resolve) => {
    const req = request({
      host: "127.0.0.1", port, method: "POST", path: "/api/import", setHost: false, agent: false,
      headers: { host: `127.0.0.1:${port}`, cookie: `magpie_${port}=${token}`, origin: `http://127.0.0.1:${port}`, "x-magpie-token": token, "content-type": "application/json", ...headers },
    }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? null, ms: performance.now() - started }));
    });
    req.on("error", () => resolve({ status: null, ms: performance.now() - started }));
    req.write(first);
    setTimeout(() => req.destroy(), 10_000).unref();
  });
}

test("R7: a write that says its body is 50 MB gets 413 at once, without the server reading it", async (t) => {
  const server = await start(t);
  const r = await hangingWrite(server.port, server.token, { "content-length": String(50 * 1024 * 1024) }, "{");
  assert.equal(r.status, 413);
  assert.ok(r.ms < 2000, `${r.ms} ms`);
});

test("R7: a body that never ends is cut off after the request timeout", async (t) => {
  const server = await start(t, 500);
  const r = await hangingWrite(server.port, server.token, { "transfer-encoding": "chunked" }, "{");
  assert.ok(r.status === 408 || r.status === null, String(r.status));
  assert.ok(r.ms < 5000, `${r.ms} ms`);
});

test("R15: a notes/ folder that is a link is not watched", (t) => {
  const box = sandbox();
  mkdirSync(join(box.root, "elsewhere"));
  mkdirSync(box.journal);
  try {
    symlinkSync(join(box.root, "elsewhere"), join(box.journal, "notes"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    t.skip(`can't create a link here: ${(error as NodeJS.ErrnoException).code}`);
    return;
  }
  const watched: string[] = [];
  const stop = watchJournals([{ scope: "personal", path: box.journal }], () => {}, {
    watch: ((path: string) => {
      watched.push(path);
      return { on: () => {}, close: () => {} };
    }) as never,
  });
  stop();
  assert.deepEqual(watched, []);
});
