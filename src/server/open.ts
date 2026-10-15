// Opens a URL or a file in the user's default app with the platform's own command (docs/ui.md §2;
// no dependency): open on macOS, xdg-open on Linux, cmd /c start on Windows. Resolves once the
// command has started; rejects when it can't be run.
import { spawn } from "node:child_process";
import { posix, win32 } from "node:path";
import { commandShell } from "../core/agent-cli.ts";
import { onPath, type Platform } from "../core/agents.ts";
import type { Env } from "../core/journals.ts";

// Each program by absolute path, never by name: Windows looks a bare name up in the current folder
// first, and `repomagpie ui` often runs inside a cloned repository, which could hold a cmd.exe.
// cmd.exe as setup finds it; /usr/bin/open, which macOS always has; xdg-open from an absolute
// PATH folder only. The target is the app's URL or a note's absolute path: `start` and `open` would
// look a relative one up in the current folder too, so anything else is refused.
export function openCommand(target: string, platform: Platform, env: Env): { command: string; args: string[]; verbatim: boolean } {
  const absolute = platform === "win32" ? win32.isAbsolute : posix.isAbsolute;
  if (!/^https?:\/\//.test(target) && !absolute(target)) throw new Error("only a web address or an absolute path can be opened");
  if (platform === "win32") {
    // cmd parses its command line itself. The target goes in double quotes, where & | < > ^ are
    // plain text; a " (not allowed in Windows file names) or a % (expanded even inside quotes)
    // could break out, so such targets are refused. /d skips AutoRun commands; /v:off keeps !
    // plain text.
    if (/["%\r\n]/.test(target)) throw new Error("the path has a character cmd can't pass on safely");
    return { command: commandShell(env), args: ["/d", "/v:off", "/s", "/c", `"start "" "${target}""`], verbatim: true };
  }
  if (platform === "darwin") return { command: "/usr/bin/open", args: [target], verbatim: false };
  const xdgOpen = onPath("xdg-open", { home: "", env, platform })[0];
  if (!xdgOpen) throw new Error("xdg-open isn't in a folder on PATH");
  return { command: xdgOpen, args: [target], verbatim: false };
}

export function openExternal(target: string): Promise<void> {
  let run: ReturnType<typeof openCommand>;
  try {
    run = openCommand(target, process.platform as Platform, process.env);
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(run.command, run.args, { stdio: "ignore", detached: true, windowsVerbatimArguments: run.verbatim, windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
