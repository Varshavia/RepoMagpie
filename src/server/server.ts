// magpie ui's server (decision 0021, docs/ui.md): node:http on 127.0.0.1 only, while the command
// runs. Every request passes the security rules of docs/ui.md §3 in this order: Host, the session
// (token exchange or cookie), the route and method, then for writes the Origin, the X-Magpie-Token
// header, the content type and the body size. Then api.ts calls core. No CORS headers, ever.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { locateJournal } from "../core/save.ts";
import type { Context } from "../core/save.ts";
import { endpoints } from "./api.ts";
import { watchJournals, type LiveOptions, type Watched } from "./live.ts";

export interface ServerOptions {
  context: Context;
  port?: number; // 0 or none: a free port chosen by the operating system
  open: (path: string) => Promise<void>; // opens a note in the default editor (POST /api/open)
  log: (line: string) => void; // details of unexpected errors, for the terminal
  assets?: string; // the app's folder; default dist/ui/ (npm run build)
  live?: LiveOptions & { keepAliveMs?: number };
}

export interface UiServer {
  address: string;
  port: number;
  token: string;
  url: string; // the opening URL, with the session token
  close: () => Promise<void>;
}

const HOST = "127.0.0.1";
const MAX_BODY = 1024 * 1024;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
// dist/ui/ from both src/server/ (run from source) and dist/cli/ (the bundle, the package).
const DEFAULT_ASSETS = fileURLToPath(new URL("../../dist/ui/", import.meta.url));
const NOT_BUILT = "The app isn't built. Run npm run build, then start magpie ui again.";
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};
const TOKEN_META = '<meta name="magpie-token" content="">';
const BUG = "Something went wrong in magpie. The terminal running magpie ui shows the details.";

export async function startServer(options: ServerOptions): Promise<UiServer> {
  const token = randomBytes(32).toString("hex");
  const tokenBytes = Buffer.from(token);
  const assets = loadAssets(options.assets ?? DEFAULT_ASSETS);
  const api = endpoints(options.context, options.open);
  const streams = new Set<ServerResponse>();
  let port = 0;

  const isToken = (value: string | undefined) => {
    const bytes = Buffer.from(value ?? "");
    return bytes.length === tokenBytes.length && timingSafeEqual(bytes, tokenBytes);
  };
  const cookieName = () => `magpie_${port}`;
  const hasSession = (req: IncomingMessage) =>
    isToken((req.headers.cookie ?? "").split(/;\s*/).find((pair) => pair.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1));

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const method = req.method ?? "GET";
    const [path, search = ""] = (req.url ?? "/").split(/\?(.*)/s);
    const query = new URLSearchParams(search);

    // Against DNS rebinding: only the names this server is reached by.
    if (req.headers.host !== `${HOST}:${port}` && req.headers.host !== `localhost:${port}`) {
      return json(res, 403, { error: `This server answers only requests to ${HOST}:${port}.` });
    }
    // The token in the opening URL is exchanged once for the cookie, and leaves the address bar.
    if (path === "/" && method === "GET" && query.has("token")) {
      if (!isToken(query.get("token") ?? undefined)) return json(res, 401, { error: "Wrong session token. Open the URL magpie ui printed." });
      res.writeHead(303, { Location: "/", "Set-Cookie": `${cookieName()}=${token}; HttpOnly; SameSite=Strict; Path=/` });
      res.end();
      return;
    }
    if (!hasSession(req)) return json(res, 401, { error: "No session. Open the URL magpie ui printed; it holds the session token." });

    if (path === "/" || path.startsWith("/assets/")) {
      const file = path === "/" ? assets.get("index.html") : assets.get(path.slice("/assets/".length));
      if (!file) return json(res, 404, { error: assets.size ? "Not found." : NOT_BUILT });
      if (method !== "GET") return notAllowed(res, ["GET"]);
      // The page gets the token for the X-Magpie-Token header, only with the session cookie.
      const body = path === "/" ? Buffer.from(file.body.toString("utf8").replace(TOKEN_META, `<meta name="magpie-token" content="${token}">`)) : file.body;
      res.writeHead(200, { "Content-Type": file.type, "Content-Length": body.length });
      res.end(body);
      return;
    }
    if (path === "/api/events") {
      if (method !== "GET") return notAllowed(res, ["GET"]);
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" });
      res.write(": connected\n\n");
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }

    const route = api[path];
    if (!route) return json(res, 404, { error: "Not found." });
    const handler = route[method];
    if (!handler) return notAllowed(res, Object.keys(route).sort());

    let body: Record<string, unknown> = {};
    if (method === "POST" || method === "PATCH") {
      // Pages on other local ports are same-site for cookies, so the origin is checked as well.
      const origin = req.headers.origin;
      if (origin !== `http://${HOST}:${port}` && origin !== `http://localhost:${port}`) return json(res, 403, { error: "Writes are accepted only from the app itself." });
      if (!isToken(header(req, "x-magpie-token"))) return json(res, 403, { error: "A write needs the X-Magpie-Token header." });
      if ((req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
        return json(res, 415, { error: "Writes accept Content-Type: application/json only." });
      }
      const bytes = await readBody(req);
      if (!bytes) return json(res, 413, { error: "The request body is over 1 MB." });
      let parsed: unknown;
      try {
        parsed = JSON.parse(bytes.toString("utf8"));
      } catch {
        return json(res, 400, { error: "The request body is not valid JSON." });
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return json(res, 400, { error: "The request body must be a JSON object." });
      body = parsed as Record<string, unknown>;
    }
    const reply = await handler({ query, body });
    json(res, reply.status, reply.document);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: Error) => {
      options.log(`magpie ui: ${req.method} ${(req.url ?? "").split("?")[0]} failed: ${error.stack ?? error.message}`);
      if (!res.headersSent) json(res, 500, { error: BUG });
      else res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  port = address.port;

  // Live updates: both journals' notes/ folders, also when they don't exist yet.
  const watched: Watched[] = [{ scope: "personal", path: locateJournal("personal", options.context).path }];
  const project = locateJournal("project", options.context);
  if (!project.error) watched.push({ scope: "project", path: project.path });
  const stopWatching = watchJournals(watched, (scope, files) => {
    const event = `event: notes-changed\ndata: ${JSON.stringify({ journal: scope, files })}\n\n`;
    for (const stream of streams) stream.write(event);
  }, options.live);
  const keepAlive = setInterval(() => {
    for (const stream of streams) stream.write(": keep-alive\n\n");
  }, options.live?.keepAliveMs ?? 30_000);
  keepAlive.unref();

  return {
    address: address.address,
    port,
    token,
    url: `http://${HOST}:${port}/?token=${token}`,
    close: () => {
      stopWatching();
      clearInterval(keepAlive);
      for (const stream of streams) stream.end();
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}

function json(res: ServerResponse, status: number, document: unknown): void {
  const body = Buffer.from(JSON.stringify(document));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length });
  res.end(body);
}

function notAllowed(res: ServerResponse, methods: string[]): void {
  res.setHeader("Allow", methods.join(", "));
  json(res, 405, { error: `This path accepts ${methods.join(", ")} only.` });
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? undefined : value;
}

// The whole body, or null when it is over 1 MB. An oversized body is still read to its end (and
// dropped), so the client gets the 413 instead of a reset connection.
function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on("end", () => resolve(size > MAX_BODY ? null : Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// The app's files, listed once at startup: the only files the server ever serves. A request names
// one of them exactly or gets 404; its path is never joined to a folder. No folder (the app isn't
// built, when run from source): no files; the API still works.
function loadAssets(folder: string): Map<string, { body: Buffer; type: string }> {
  const files = new Map<string, { body: Buffer; type: string }>();
  if (!existsSync(folder)) return files;
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    const name = full.slice(folder.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
    files.set(name, { body: readFileSync(full), type: TYPES[extname(name)] ?? "application/octet-stream" });
  }
  return files;
}
