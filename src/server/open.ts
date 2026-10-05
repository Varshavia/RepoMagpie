// Opens a URL or a file in the user's default app with the platform's own command (docs/ui.md §2;
// no dependency): open on macOS, xdg-open on Linux, cmd /c start on Windows. Resolves once the
// command has started; rejects when it can't be run.
import { spawn } from "node:child_process";

export function openExternal(target: string): Promise<void> {
  let command: string;
  let args: string[];
  let verbatim = false;
  if (process.platform === "win32") {
    // cmd parses its command line itself. The target goes in double quotes, where & | < > ^ are
    // plain text; a " (not allowed in Windows file names) or a % (expanded even inside quotes)
    // could break out, so such targets are refused. /d skips AutoRun commands; /v:off keeps !
    // plain text.
    if (/["%\r\n]/.test(target)) return Promise.reject(new Error("the path has a character cmd can't pass on safely"));
    command = "cmd";
    args = ["/d", "/v:off", "/s", "/c", `"start "" "${target}""`];
    verbatim = true;
  } else {
    command = process.platform === "darwin" ? "open" : "xdg-open";
    args = [target];
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: verbatim, windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
