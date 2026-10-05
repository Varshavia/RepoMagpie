// Test helper: raw HTTP requests to the local app's server, with full control over Host, Origin,
// Cookie and Content-Type (fetch would set some of them itself). Not part of the build
// (tsconfig.build.json excludes fixtures/).
import { request, type IncomingHttpHeaders } from "node:http";

export interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface Send {
  method?: string;
  path?: string;
  headers?: Record<string, string | undefined>; // undefined: leave the header out
  body?: string | Buffer;
  chunked?: boolean; // send the body without Content-Length
}

export function send(port: number, options: Send = {}): Promise<Reply> {
  const headers = Object.fromEntries(Object.entries(options.headers ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined));
  if (options.body !== undefined && !options.chunked) headers["content-length"] = String(Buffer.byteLength(options.body));
  return new Promise((resolve, reject) => {
    // A new connection per request (agent: false), so no test reuses a socket the server closed.
    const req = request({ host: "127.0.0.1", port, method: options.method ?? "GET", path: options.path ?? "/", headers, setHost: false, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

// An open GET /api/events stream with the session cookie. `until` waits for its text to match.
export function events(server: { port: number; token: string }) {
  let text = "";
  let status = 0;
  let ended = false;
  const checks = new Set<() => void>();
  const req = request({
    host: "127.0.0.1",
    port: server.port,
    path: "/api/events",
    headers: { host: `127.0.0.1:${server.port}`, cookie: `magpie_${server.port}=${server.token}` },
  }, (res) => {
    status = res.statusCode ?? 0;
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      text += chunk;
      for (const check of checks) check();
    });
    res.on("end", () => {
      ended = true;
      for (const check of checks) check();
    });
  });
  req.on("error", () => {});
  req.end();
  return {
    status: () => status,
    ended: () => ended,
    text: () => text,
    until(pattern: RegExp | ((text: string) => boolean), timeoutMs: number): Promise<string> {
      const matches = () => (typeof pattern === "function" ? pattern(text) : pattern.test(text));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          checks.delete(check);
          reject(new Error(`No match for ${String(pattern)} within ${timeoutMs} ms. Received:\n${text}`));
        }, timeoutMs);
        const check = () => {
          if (!matches()) return;
          clearTimeout(timer);
          checks.delete(check);
          resolve(text);
        };
        checks.add(check);
        check();
      });
    },
    close: () => req.destroy(),
  };
}

// Requests as the app makes them: the right Host and the session cookie; writes also carry the
// Origin, the X-Magpie-Token header and a JSON body. Any header can be overridden or left out.
export function client(server: { port: number; token: string }) {
  const base = (): Record<string, string | undefined> => ({
    host: `127.0.0.1:${server.port}`,
    cookie: `magpie_${server.port}=${server.token}`,
  });
  return {
    get: (path: string, headers: Record<string, string | undefined> = {}) => send(server.port, { path, headers: { ...base(), ...headers } }),
    write: (method: string, path: string, body: unknown, headers: Record<string, string | undefined> = {}) =>
      send(server.port, {
        method,
        path,
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: {
          ...base(),
          origin: `http://127.0.0.1:${server.port}`,
          "x-magpie-token": server.token,
          "content-type": "application/json",
          ...headers,
        },
      }),
  };
}
