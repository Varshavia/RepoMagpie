// repomagpie mcp (decision 0034): a stdio MCP server for the agent that starts it. Serves the
// 2025-11-25 and 2026-07-28 protocol revisions from one process (the SDK's serveStdio). stdout
// carries only the protocol; everything else goes to stderr. Runs until the agent closes stdin.
import "../mcp/jitless.ts"; // first: before zod creates a schema
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ALLOW_WRITE_ENV, noteToolFromEnv } from "../core/launch.ts";
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
  // --allow-write, or the Claude Code plugin's switch (decision 0064).
  const source = options.allowWrite ? "--allow-write" : noteToolFromEnv(io.env) ? ALLOW_WRITE_ENV : null;
  serveStdio(() => buildServer({ place, allowWrite: source !== null, version: packageVersion(), today, log }), {
    onerror: (error) => log(`repomagpie mcp: ${error.message}\n`),
  });
  log(`repomagpie mcp: serving${source ? `, note tool on (${source})` : ""}.\n`);
  return 0;
}
