import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { send } from "../server/fixtures/http.ts";
import { magpie, sandbox } from "./fixtures/sandbox.ts";

// magpie ui (spec §2, docs/ui.md §2): the server runs until untilStopped resolves (Ctrl+C or SIGTERM
// in a terminal); the browser opener is recorded instead of run.

const URL_LINE = /^http:\/\/127\.0\.0\.1:(\d+)\/\?token=([0-9a-f]{64})\n$/;

test("magpie ui prints the URL with the token on stdout, opens it, and stops with exit 0", async () => {
  const box = sandbox();
  const opened: string[] = [];
  let port = 0;
  let exchange = 0;
  const r = await magpie(box, ["ui"], {
    openExternal: async (url) => { opened.push(url); },
    untilStopped: async () => {
      const [, p, token] = opened[0].match(/:(\d+)\/\?token=(\w+)$/) ?? [];
      port = Number(p);
      exchange = (await send(port, { path: `/?token=${token}`, headers: { host: `127.0.0.1:${port}` } })).status;
    },
  });
  assert.equal(r.code, 0);
  assert.match(r.out, URL_LINE);
  assert.deepEqual(opened, [r.out.trim()]);
  assert.equal(exchange, 303);
  assert.match(r.err, /Press Ctrl\+C to stop/);
  await assert.rejects(send(port, { headers: { host: `127.0.0.1:${port}` } }), /ECONNREFUSED/);
});

test("--no-open prints the URL and opens nothing", async () => {
  const box = sandbox();
  const opened: string[] = [];
  const r = await magpie(box, ["ui", "--no-open"], { openExternal: async (url) => { opened.push(url); }, untilStopped: async () => {} });
  assert.equal(r.code, 0);
  assert.match(r.out, URL_LINE);
  assert.deepEqual(opened, []);
});

test("--json prints {url, port} once listening, and nothing else on stdout", async () => {
  const box = sandbox();
  let out = "";
  let whileRunning = "";
  const r = await magpie(box, ["ui", "--json", "--no-open"], { out: (text) => { out += text; }, untilStopped: async () => { whileRunning = out; } });
  assert.equal(r.code, 0);
  const document = JSON.parse(out) as { url: string; port: number };
  assert.equal(whileRunning, out); // printed once listening, nothing after
  assert.deepEqual(Object.keys(document), ["url", "port"]);
  assert.match(`${document.url}\n`, URL_LINE);
  assert.equal(document.url, `http://127.0.0.1:${document.port}/?token=${document.url.split("=")[1]}`);
});

test("--port listens on that port; a port in use is exit 1 and names the port", async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const taken = (blocker.address() as { port: number }).port;
  try {
    const box = sandbox();
    const r = await magpie(box, ["ui", "--port", String(taken), "--no-open"], { untilStopped: async () => {} });
    assert.equal(r.code, 1);
    assert.equal(r.out, "");
    assert.match(r.err, new RegExp(`port ${taken} is in use`));
    const json = await magpie(box, ["ui", "--port", String(taken), "--json"], { untilStopped: async () => {} });
    assert.equal(json.code, 1);
    assert.deepEqual(JSON.parse(json.out), { url: null, port: taken, error: JSON.parse(json.out).error });
    assert.match(JSON.parse(json.out).error, new RegExp(String(taken)));
  } finally {
    blocker.close();
  }

  const free = createServer();
  await new Promise<void>((resolve) => free.listen(0, "127.0.0.1", resolve));
  const port = (free.address() as { port: number }).port;
  await new Promise<void>((resolve) => free.close(() => resolve()));
  const r = await magpie(sandbox(), ["ui", "--port", String(port), "--no-open"], { untilStopped: async () => {} });
  assert.equal(r.code, 0);
  assert.match(r.out, new RegExp(`^http://127\\.0\\.0\\.1:${port}/`));
});

test("a --port that isn't a number from 1 to 65535 is a usage error (exit 2)", async () => {
  const box = sandbox();
  for (const port of ["0", "65536", "abc", "1.5", "-1", ""]) {
    const r = await magpie(box, ["ui", "--port", port, "--no-open"], { untilStopped: async () => assert.fail("must not start") });
    assert.equal(r.code, 2, port);
    assert.equal(r.out, "");
  }
});

test("a browser that can't be opened: a message on stderr, and the printed URL still works", async () => {
  const box = sandbox();
  let status = 0;
  let out = "";
  const r = await magpie(box, ["ui"], {
    out: (text) => { out += text; },
    openExternal: () => Promise.reject(new Error("spawn xdg-open ENOENT")),
    untilStopped: async () => {
      const [, port, token] = out.match(URL_LINE) ?? [];
      status = (await send(Number(port), { path: `/?token=${token}`, headers: { host: `127.0.0.1:${port}` } })).status;
    },
  });
  assert.equal(r.code, 0);
  assert.match(r.err, /Couldn't open the browser: spawn xdg-open ENOENT/);
  assert.match(r.err, /Open the URL above yourself/);
  assert.equal(status, 303);
});

// Windows can't send a catchable SIGINT or SIGTERM to a child process (kill() ends it at once), so
// this runs on Linux and macOS, as in CI.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`${signal} stops the server and exits 0`, { skip: process.platform === "win32" && "no catchable signals for child processes on Windows" }, async () => {
    const box = sandbox();
    const main = fileURLToPath(new URL("./main.ts", import.meta.url));
    const child = spawn(process.execPath, [main, "ui", "--no-open", "--json"], {
      cwd: box.project,
      env: { ...process.env, MAGPIE_HOME: box.journal, HOME: box.home, USERPROFILE: box.home },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    const { port } = await new Promise<{ port: number }>((resolve) => child.stdout.on("data", (chunk: string) => {
      out += chunk;
      if (out.endsWith("\n")) resolve(JSON.parse(out));
    }));
    assert.equal((await send(port, { headers: { host: `127.0.0.1:${port}` } })).status, 401);
    const exit = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
    child.kill(signal);
    assert.equal(await exit, 0);
    await assert.rejects(send(port, { headers: { host: `127.0.0.1:${port}` } }), /ECONNREFUSED/);
  });
}

test("--home chooses the personal journal the server reads", async () => {
  const box = sandbox();
  let settings: { journals: { personal: { path: string } } } | null = null;
  let url = "";
  await magpie(box, ["--home", box.home, "ui", "--no-open"], {
    out: (text) => { url += text; },
    untilStopped: async () => {
      const [, port, token] = url.match(URL_LINE) ?? [];
      const host = { host: `127.0.0.1:${port}`, cookie: `magpie_${port}=${token}` };
      settings = JSON.parse((await send(Number(port), { path: "/api/settings", headers: host })).body);
    },
  });
  assert.equal(settings!.journals.personal.path, box.home);
});
