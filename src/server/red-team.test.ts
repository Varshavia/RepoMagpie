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

// The headers of a write that passes every check, plus `extra`.
const authed = (port: number, token: string, extra: Record<string, string>) =>
  ({ host: `127.0.0.1:${port}`, cookie: `magpie_${port}=${token}`, origin: `http://127.0.0.1:${port}`, "x-magpie-token": token, "content-type": "application/json", ...extra });

// A write with these headers, whose body is `first`, then nothing more, while it waits.
function hangingWrite(port: number, headers: Record<string, string>, first: string): Promise<{ status: number | null; ms: number }> {
  const started = performance.now();
  return new Promise((resolve) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/import", setHost: false, agent: false, headers }, (res) => {
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
  const r = await hangingWrite(server.port, authed(server.port, server.token, { "content-length": String(50 * 1024 * 1024) }), "{");
  assert.equal(r.status, 413);
  assert.ok(r.ms < 2000, `${r.ms} ms`);
});

test("R7: a body that never ends is cut off after the request timeout", async (t) => {
  const server = await start(t, 500);
  const r = await hangingWrite(server.port, authed(server.port, server.token, { "transfer-encoding": "chunked" }), "{");
  assert.ok(r.status === 408 || r.status === null, String(r.status));
  assert.ok(r.ms < 5000, `${r.ms} ms`);
});

// A write whose headers are `headers` (no defaults), with a body that keeps coming: 64 KB every
// 5 ms until the server answers or closes. Resolves with the status, the time and the bytes sent.
function floodingWrite(port: number, headers: Record<string, string>): Promise<{ status: number | null; ms: number; sent: number }> {
  const started = performance.now();
  return new Promise((resolve) => {
    let sent = 0;
    let status: number | null = null;
    const chunk = Buffer.alloc(64 * 1024, 0x20);
    const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/import", setHost: false, agent: false, headers }, (res) => {
      status = res.statusCode ?? null;
      res.resume();
    });
    const pump = setInterval(() => {
      if (req.destroyed) return;
      req.write(chunk, () => { sent += chunk.length; });
    }, 5);
    const done = () => {
      clearInterval(pump);
      resolve({ status, ms: performance.now() - started, sent });
    };
    req.on("error", done);
    req.on("close", done);
    setTimeout(() => req.destroy(), 15_000).unref();
  });
}

test("R7: the Host, cookie, Origin and token checks come before any of the body is read", async (t) => {
  const server = await start(t);
  const port = server.port;
  const without = (key: string, value?: string) => {
    const headers: Record<string, string> = authed(port, server.token, { "content-length": String(50 * 1024 * 1024) });
    if (value === undefined) delete headers[key];
    else headers[key] = value;
    return headers;
  };
  // The body announces 50 MB and sends one byte: an answer that comes at once didn't wait for it.
  for (const [headers, status] of [
    [without("host", "example.invalid"), 403],
    [without("cookie"), 401],
    [without("origin", "http://example.invalid"), 403],
    [without("x-magpie-token"), 403],
  ] as const) {
    const r = await hangingWrite(port, headers, "{");
    assert.equal(r.status, status, JSON.stringify(headers));
    assert.ok(r.ms < 2000, `${r.ms} ms`);
  }
});

test("R7: a body without Content-Length is cut off once 1 MB has arrived, not at the timeout", async (t) => {
  const server = await start(t);
  const port = server.port;
  const r = await floodingWrite(port, authed(port, server.token, { "transfer-encoding": "chunked" }));
  // The 413 goes out first; a busy client may see the cut connection before it reads it.
  assert.ok(r.status === 413 || r.status === null, String(r.status));
  assert.ok(r.ms < 5000, `${r.ms} ms`);
  assert.ok(r.sent < 8 * 1024 * 1024, `${r.sent} bytes sent before the server closed`);
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
