// magpie ui (spec §2, docs/ui.md §2): starts the local app's server on 127.0.0.1, prints the URL with
// the session token, opens the browser, and runs until Ctrl+C or SIGTERM.
import { locateJournal } from "../core/save.ts";
import { startServer, type UiServer } from "../server/server.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface UiOptions extends GlobalOptions {
  port?: number;
  open: boolean; // false with --no-open
}

export async function uiCommand(options: UiOptions, io: Io): Promise<number> {
  const json = Boolean(options.json);
  const context = contextOf(io, options);
  const openExternal = io.openExternal ?? (await import("../server/open.ts")).openExternal;
  let server: UiServer;
  try {
    server = await startServer({ context, port: options.port, open: openExternal, log: (line) => io.err(`${line}\n`) });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = code === "EADDRINUSE"
      ? `port ${options.port} is in use. Choose another with --port, or leave --port out to use a free one.`
      : code === "EACCES"
        ? `port ${options.port} can't be used here. Choose another with --port.`
        : `the server couldn't start: ${(error as Error).message}`;
    if (json) io.out(`${JSON.stringify({ url: null, port: options.port ?? null, error: message })}\n`);
    else io.err(`magpie ui: ${message}\n`);
    return 1;
  }

  if (json) io.out(`${JSON.stringify({ url: server.url, port: server.port })}\n`);
  else {
    for (const warning of locateJournal("personal", context).warnings) io.err(`warning: ${warning}\n`);
    io.out(`${server.url}\n`);
    io.err("Press Ctrl+C to stop.\n");
  }
  if (options.open) {
    try {
      await openExternal(server.url);
    } catch (error) {
      io.err(`Couldn't open the browser: ${(error as Error).message}. Open the URL above yourself.\n`);
    }
  }
  await (io.untilStopped ?? untilSignal)();
  await server.close();
  return 0;
}

function untilSignal(): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
