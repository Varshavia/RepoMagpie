import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sandbox } from "../cli/fixtures/sandbox.ts";
import { fakeFetch, recorded } from "../core/fixtures/fake-fetch.ts";
import { client, send, type Reply } from "./fixtures/http.ts";
import { startServer } from "./server.ts";

// Every security rule in docs/ui.md §3, each with its own test, against an in-process server on a
// free port, over a scratch journal. The real home and journal are never used.

const APP = fileURLToPath(new URL("./fixtures/app/", import.meta.url)); // stands in for dist/ui/
const SECRET = "SECRET-OUTSIDE-THE-JOURNALS";
const GITHUB_TOKEN = "ghp_test_token_never_in_a_response_42";
const PDFKIT = "---\nid: pkg:npm/pdfkit\nname: pdfkit\nexplored: 2026-10-03\nkind: library\ntags: [pdf]\ntried: true\nrating:\nstatus: reviewed\n---\n\n## Verdict\navoid: async streams painful\n";

async function start(t: TestContext, env: Record<string, string> = {}) {
  const box = sandbox({
    "journal/notes/npm--pdfkit.md": PDFKIT,
    "journal/notes/npm--broken.md": "---\nid: [broken\n---\n",
    [`secret.md`]: `---\nid: pkg:npm/secret\nname: ${SECRET}\n---\n\n## Verdict\n${SECRET}\n`,
    "project/package.json": "{}",
  });
  const opened: string[] = [];
  const logged: string[] = [];
  const server = await startServer({
    context: { home: box.home, env: { MAGPIE_HOME: box.journal, ...env }, cwd: box.project, fetch: fakeFetch(recorded("microsoft--playwright-cli")), today: () => "2026-10-04" },
    open: async (target) => { opened.push(target); },
    log: (line) => { logged.push(line); },
    assets: APP,
  });
  t.after(() => server.close());
  return { box, server, http: client(server), opened, logged };
}

const noSecret = (reply: Reply, what: string) => assert.doesNotMatch(reply.body, new RegExp(SECRET), what);

test("the server listens on 127.0.0.1 only", async (t) => {
  const { server } = await start(t);
  assert.equal(server.address, "127.0.0.1");
  assert.equal(server.url, `http://127.0.0.1:${server.port}/?token=${server.token}`);
  assert.match(server.token, /^[0-9a-f]{64}$/); // 32 random bytes
});

test("the token is exchanged once for an HttpOnly, SameSite=Strict cookie, with a 303 to /", async (t) => {
  const { server } = await start(t);
  const r = await send(server.port, { path: `/?token=${server.token}`, headers: { host: `127.0.0.1:${server.port}` } });
  assert.equal(r.status, 303);
  assert.equal(r.headers.location, "/");
  assert.deepEqual(r.headers["set-cookie"], [`magpie_${server.port}=${server.token}; HttpOnly; SameSite=Strict; Path=/`]);
});

test("a wrong token, and a request without token or cookie, get 401", async (t) => {
  const { server } = await start(t);
  const host = { host: `127.0.0.1:${server.port}` };
  const wrong = "0".repeat(64);
  const replies = [
    await send(server.port, { path: `/?token=${wrong}`, headers: host }),
    await send(server.port, { path: "/?token=", headers: host }),
    await send(server.port, { path: "/", headers: host }),
    await send(server.port, { path: "/api/settings", headers: host }),
    await send(server.port, { path: "/assets/app.js", headers: host }),
    await send(server.port, { path: "/api/settings", headers: { ...host, cookie: `magpie_${server.port}=${wrong}` } }),
    await send(server.port, { path: "/api/settings", headers: { ...host, cookie: `magpie_1=${server.token}` } }),
    await send(server.port, { path: "/api/settings", headers: { ...host, "x-magpie-token": server.token } }),
  ];
  for (const r of replies) {
    assert.equal(r.status, 401);
    assert.equal(r.headers["set-cookie"], undefined);
    assert.doesNotMatch(r.body, new RegExp(server.token));
  }
});

test("a write with the cookie but without a matching X-Magpie-Token header gets 403", async (t) => {
  const { http, server } = await start(t);
  for (const token of [undefined, "", "0".repeat(64), `${server.token}0`, server.token.slice(1)]) {
    const r = await http.write("POST", "/api/note", { target: "pkg:npm/left-pad", to: "personal" }, { "x-magpie-token": token });
    assert.equal(r.status, 403, String(token));
  }
  const patch = await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: "x" }, { "x-magpie-token": undefined });
  assert.equal(patch.status, 403);
});

test("a bad Host gets 403, before anything else (DNS rebinding)", async (t) => {
  const { http, server } = await start(t);
  const hosts = ["evil.example", `evil.example:${server.port}`, `127.0.0.1:${server.port + 1}`, `localhost.evil.example:${server.port}`, `127.0.0.2:${server.port}`, `[::1]:${server.port}`, "127.0.0.1", ""];
  for (const host of hosts) {
    for (const r of [await http.get("/api/settings", { host }), await http.get(`/?token=${server.token}`, { host, cookie: undefined })]) {
      assert.equal(r.status, 403, host);
      assert.equal(r.headers["set-cookie"], undefined);
    }
  }
  for (const host of [`127.0.0.1:${server.port}`, `localhost:${server.port}`]) assert.equal((await http.get("/api/settings", { host })).status, 200, host);
});

test("cross-origin and Origin-less writes get 403", async (t) => {
  const { http, server, box } = await start(t);
  const origins = [undefined, "null", "http://evil.example", `http://localhost:${server.port + 1}`, `https://127.0.0.1:${server.port}`, `http://127.0.0.1:${server.port}.evil.example`, `http://127.0.0.1`];
  for (const origin of origins) {
    const r = await http.write("POST", "/api/note", { target: "pkg:npm/left-pad", text: "x", to: "personal" }, { origin });
    assert.equal(r.status, 403, String(origin));
  }
  assert.equal(existsSync(box.note("npm--left-pad.md")), false);
  for (const origin of [`http://127.0.0.1:${server.port}`, `http://localhost:${server.port}`]) {
    const r = await http.write("POST", "/api/note/preview", { target: "pkg:npm/left-pad", to: "personal" }, { origin });
    assert.equal(r.status, 200, origin);
  }
});

test("no response ever has an Access-Control-* header (no CORS)", async (t) => {
  const { http, server } = await start(t);
  const origin = { origin: "http://evil.example" };
  const replies = [
    await http.get("/api/settings", origin),
    await http.get("/", origin),
    await http.get("/nothing", origin),
    await send(server.port, { method: "OPTIONS", path: "/api/note", headers: { host: `127.0.0.1:${server.port}`, ...origin, "access-control-request-method": "PATCH" } }),
    await http.write("POST", "/api/note", { target: "pkg:npm/left-pad", to: "personal" }, origin),
    await http.write("POST", "/api/note/preview", { target: "pkg:npm/left-pad", to: "personal" }),
  ];
  for (const r of replies) assert.deepEqual(Object.keys(r.headers).filter((name) => name.startsWith("access-control-")), []);
});

test("writes accept application/json only; other types get 415", async (t) => {
  const { http } = await start(t);
  const body = { target: "pkg:npm/left-pad", to: "personal" };
  for (const type of [undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp", "text/json"]) {
    assert.equal((await http.write("POST", "/api/note/preview", body, { "content-type": type })).status, 415, String(type));
  }
  assert.equal((await http.write("POST", "/api/note/preview", body, { "content-type": "application/json; charset=utf-8" })).status, 200);
});

test("a body over 1 MB gets 413, with or without Content-Length", async (t) => {
  const { http } = await start(t);
  const big = JSON.stringify({ target: "pkg:npm/left-pad", to: "personal", text: "x".repeat(1024 * 1024) });
  assert.equal((await http.write("POST", "/api/note", big)).status, 413);
  const { server } = await start(t);
  const chunked = await send(server.port, {
    method: "POST",
    path: "/api/import",
    body: big,
    chunked: true,
    headers: { host: `127.0.0.1:${server.port}`, cookie: `magpie_${server.port}=${server.token}`, origin: `http://127.0.0.1:${server.port}`, "x-magpie-token": server.token, "content-type": "application/json" },
  });
  assert.equal(chunked.status, 413);
  const almost = JSON.stringify({ text: "", to: "personal", pad: "x".repeat(1024 * 1024 - 40) });
  assert.equal((await http.write("POST", "/api/import", almost)).status, 200);
});

test("no path from a request reaches the file system: traversal in every parameter gets 400 or 404", async (t) => {
  const { http, box, opened } = await start(t);
  const secret = join(box.root, "secret.md");
  const paths = ["../secret.md", "..%2Fsecret.md", "..\\secret.md", "%2e%2e%2fsecret.md", "....//secret.md", secret, secret.replace(/\\/g, "/"), "/etc/passwd", "C:\\Windows\\win.ini", "notes/../../secret.md"];
  const ok = (r: Reply, what: string) => {
    assert.ok(r.status === 400 || r.status === 404, `${what}: ${r.status}`);
    noSecret(r, what);
  };
  for (const p of paths) {
    const q = encodeURIComponent(p);
    ok(await http.get(`/assets/${p}`), `assets ${p}`);
    ok(await http.get(`/assets/${q}`), `assets encoded ${p}`);
    ok(await http.get(`/${p}`), `root ${p}`);
    ok(await http.get(`/api/note?journal=personal&file=${q}`), `file ${p}`);
    ok(await http.get(`/api/note?journal=personal&id=${q}`), `id ${p}`);
    ok(await http.get(`/api/note?journal=${q}&id=pkg%3Anpm%2Fpdfkit`), `journal ${p}`);
    ok(await http.get(`/api/notes?journal=${q}`), `notes journal ${p}`);
    ok(await http.get(`/api/tags?journal=${q}`), `tags journal ${p}`);
    ok(await http.get(`/api/search?q=pdf&journal=${q}`), `search journal ${p}`);
    ok(await http.write("PATCH", "/api/note", { journal: "personal", id: p, version: "sha256:0", fields: { rating: 1 } }), `patch id ${p}`);
    ok(await http.write("PATCH", "/api/note", { journal: p, id: "pkg:npm/pdfkit", version: "sha256:0" }), `patch journal ${p}`);
    ok(await http.write("POST", "/api/open", { journal: "personal", file: p }), `open file ${p}`);
    ok(await http.write("POST", "/api/open", { journal: "personal", id: p }), `open id ${p}`);
    ok(await http.write("POST", "/api/note/preview", { target: p, to: "personal" }), `preview target ${p}`);
    ok(await http.write("POST", "/api/note", { target: p, text: "x", to: "personal" }), `note target ${p}`);
    ok(await http.write("POST", "/api/note", { target: "pkg:npm/left-pad", to: p }), `note to ${p}`);
    const imported = await http.write("POST", "/api/import", { text: `- ${p} — verdict: x`, to: "personal", dry_run: true });
    assert.ok(imported.status === 422 || imported.status === 400, `import ${p}`);
    noSecret(imported, `import ${p}`);
  }
  assert.deepEqual(opened, []);
  for (const q of [SECRET, "secret"]) assert.deepEqual(JSON.parse((await http.get(`/api/search?q=${encodeURIComponent(q)}`)).body).results, [], q);
  noSecret(await http.get("/api/recall?package=secret&type=npm"), "recall");
});

test("Content-Security-Policy and the other headers", async (t) => {
  const { http } = await start(t);
  const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const page = await http.get("/");
  assert.equal(page.status, 200);
  assert.match(String(page.headers["content-type"]), /^text\/html/);
  for (const r of [page, await http.get("/api/settings"), await http.get("/assets/app.js"), await http.get("/nothing")]) {
    assert.equal(r.headers["content-security-policy"], csp);
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["referrer-policy"], "no-referrer");
    assert.equal(r.headers["cache-control"], "no-store");
  }
});

test("the page carries the token in a meta tag only for a request with the session cookie", async (t) => {
  const { http, server } = await start(t);
  const page = await http.get("/");
  assert.match(page.body, new RegExp(`<meta name="magpie-token" content="${server.token}">`));
  const without = await http.get("/", { cookie: undefined });
  assert.equal(without.status, 401);
  assert.doesNotMatch(without.body, new RegExp(server.token));
});

test("GITHUB_TOKEN never reaches the browser: no response contains its value", async (t) => {
  const { http, server } = await start(t, { GITHUB_TOKEN });
  const replies = [
    await http.get("/"),
    await http.get("/assets/app.js"),
    await http.get("/api/settings"),
    await http.get("/api/tags?journal=personal"),
    await http.get("/api/notes?journal=personal"),
    await http.get("/api/note?journal=personal&id=pkg%3Anpm%2Fpdfkit"),
    await http.get("/api/note?journal=personal&file=npm--broken.md"),
    await http.get("/api/search?q=pdf"),
    await http.get("/api/recall?package=pdfkit"),
    await http.write("POST", "/api/note/preview", { target: "https://github.com/microsoft/playwright-cli", to: "personal" }),
    await http.write("POST", "/api/note/preview", { target: "https://github.com/nobody/nothing", to: "personal" }),
    await http.write("POST", "/api/note", { target: "https://github.com/microsoft/playwright-cli", to: "personal" }),
    await http.write("POST", "/api/import", { text: "- https://github.com/microsoft/playwright-cli — verdict: ok", to: "project", dry_run: true }),
    await http.write("POST", "/api/open", { journal: "personal", id: "pkg:npm/pdfkit" }),
    await http.write("PATCH", "/api/note", { journal: "personal", id: "pkg:npm/pdfkit", version: "sha256:old" }),
    await http.get("/nothing"),
    await send(server.port, { path: "/api/settings", headers: { host: "evil.example" } }),
  ];
  assert.equal(JSON.parse(replies[2].body).github_token_set, true);
  for (const r of replies) {
    assert.doesNotMatch(r.body, new RegExp(GITHUB_TOKEN));
    assert.doesNotMatch(JSON.stringify(r.headers), new RegExp(GITHUB_TOKEN));
  }
});

test("an unknown path gets 404, a wrong method 405, and a bug 500 without internals", async (t) => {
  const { http, box, logged } = await start(t);
  assert.equal((await http.get("/api/nothing")).status, 404);
  const wrong = await http.write("DELETE", "/api/note", {});
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.allow, "GET, PATCH, POST");
  assert.equal((await http.write("POST", "/api/settings", {})).status, 405);
  mkdirSync(join(box.journal, "notes", "folder.md")); // a folder where a note should be: reading it throws
  const bug = await http.get("/api/notes?journal=personal");
  assert.equal(bug.status, 500);
  assert.deepEqual(JSON.parse(bug.body), { error: "Something went wrong in magpie. The terminal running magpie ui shows the details." });
  assert.doesNotMatch(bug.body, /EISDIR|folder\.md|at /);
  assert.match(logged.join("\n"), /EISDIR/);
});

test("a body that isn't a JSON object gets 400", async (t) => {
  const { http } = await start(t);
  for (const body of ["{", "[]", "\"text\"", "null", ""]) {
    assert.equal((await http.write("POST", "/api/note/preview", body)).status, 400, body);
  }
});
