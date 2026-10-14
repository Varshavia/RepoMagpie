// Test helper: a minimal MCP client over real stdio for repomagpie mcp's tests. One JSON-RPC message
// per line, as the stdio transport frames them. Every line the server writes to stdout is kept, so a
// test can prove nothing else reached it. Not part of the build.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from "@modelcontextprotocol/server";
import type { Box } from "../../cli/fixtures/sandbox.ts";

const MAIN = fileURLToPath(new URL("../../cli/main.ts", import.meta.url));

export type Message = { jsonrpc: string; id?: number; result?: Record<string, unknown>; error?: { code: number; message: string } };

export class Client {
  readonly lines: string[] = [];
  stderr = "";
  private readonly child: ChildProcess;
  private readonly waiting = new Map<number, (message: Message) => void>();
  private nextId = 1;
  private buffer = "";
  readonly modern: boolean;

  constructor(box: Box, args: string[] = [], modern = false) {
    this.modern = modern;
    // Code generation off, as V8 allows: any eval or new Function in the server would throw.
    this.child = spawn(process.execPath, ["--disallow-code-generation-from-strings", MAIN, "mcp", ...args], {
      cwd: box.project,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, MAGPIE_HOME: box.journal, HOME: box.home, USERPROFILE: box.home, APPDATA: join(box.home, "AppData") },
    });
    this.child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      this.buffer += chunk;
      let end;
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        this.lines.push(line);
        const message = JSON.parse(line) as Message;
        if (message.id !== undefined) this.waiting.get(message.id)?.(message);
      }
    });
    this.child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { this.stderr += chunk; });
  }

  // A request; a modern client sends its revision, capabilities and identity in _meta.
  request(method: string, params: Record<string, unknown> = {}): Promise<Message> {
    const id = this.nextId++;
    const meta = this.modern ? { _meta: { [PROTOCOL_VERSION_META_KEY]: "2026-07-28", [CLIENT_CAPABILITIES_META_KEY]: {}, [CLIENT_INFO_META_KEY]: { name: "test", version: "1.0.0" } } } : {};
    const done = new Promise<Message>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer to ${method} in 15 s; stderr: ${this.stderr}`)), 15_000);
      this.waiting.set(id, (message) => { clearTimeout(timer); resolve(message); });
    });
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, ...meta } })}\n`);
    return done;
  }

  notify(method: string): void {
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }

  // The 2025-11-25 handshake; a modern client has none.
  async open(): Promise<Message | null> {
    if (this.modern) return null;
    const answer = await this.request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } });
    this.notify("notifications/initialized");
    return answer;
  }

  async call(name: string, args: Record<string, unknown>) {
    const answer = await this.request("tools/call", { name, arguments: args });
    assert.equal(answer.error, undefined, JSON.stringify(answer.error));
    return answer.result as { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.child.on("close", () => resolve());
      this.child.stdin?.end();
    });
  }
}

export async function withClient(box: Box, options: { modern?: boolean; args?: string[] }, body: (client: Client) => Promise<void>): Promise<Client> {
  const client = new Client(box, options.args, options.modern);
  try {
    await client.open();
    await body(client);
  } finally {
    await client.close();
  }
  return client;
}
