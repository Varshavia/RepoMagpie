// repomagpie mcp (decision 0034): a stdio MCP server for the agent that starts it. Serves the
// 2025-11-25 and 2026-07-28 protocol revisions from one process (the SDK's serveStdio). stdout
// carries only the protocol; everything else goes to stderr. Runs until the agent closes stdin.
import "../mcp/jitless.ts"; // first: before zod creates a schema
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { packageVersion } from "../core/version.ts";
import { buildServer } from "../mcp/server.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface McpCommandOptions extends GlobalOptions {
  allowWrite?: boolean;
}

export async function mcpCommand(options: McpCommandOptions, io: Io): Promise<number> {
  const { fetch: _fetch, today, ...place } = contextOf(io, options);
  const log = (text: string) => io.err(text);
  serveStdio(() => buildServer({ place, allowWrite: Boolean(options.allowWrite), version: packageVersion(), today, log }), {
    onerror: (error) => log(`repomagpie mcp: ${error.message}\n`),
  });
  log(`repomagpie mcp: serving${options.allowWrite ? ", note tool on (--allow-write)" : ""}.\n`);
  return 0;
}
