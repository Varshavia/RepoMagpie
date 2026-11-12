// Which hook form this Claude Code runs (decision 0061): `claude --version`, read the way setup runs
// an agent's CLI (agent-cli.ts: by the absolute path found on PATH, through cmd.exe for npm's .cmd
// shim on Windows, in the home folder). Never prints.
import { onPath, runCli } from "./agent-cli.ts";
import type { Where } from "./agents.ts";

// The first Claude Code with the hook field `args` (exec form): v2.1.139, released 2026-05-11
// (docs/agents.md has the sources).
export const EXEC_FORM_MIN_VERSION = "2.1.139";

const TIMEOUT = 10_000;

// "2.1.139 (Claude Code)" gives "2.1.139"; a pre-release counts as its release. null when no line
// starts with a version.
export function parseVersion(text: string): string | null {
  return text.match(/^\s*v?(\d+\.\d+\.\d+)(?![\d.])/m)?.[1] ?? null;
}

export function supportsExecForm(version: string): boolean {
  const have = version.split(".").map(Number);
  const need = EXEC_FORM_MIN_VERSION.split(".").map(Number);
  for (const [i, part] of need.entries()) {
    if (have[i] !== part) return have[i] > part;
  }
  return true;
}

// The installed version; null when there's no claude command, it fails or it prints no version.
export function claudeCodeVersion(where: Where, run: typeof runCli = runCli): string | null {
  const cli = onPath("claude", where)[0];
  if (!cli) return null;
  const result = run(cli, ["--version"], { env: where.env, platform: where.platform, cwd: where.home, timeoutMs: TIMEOUT });
  return result.status === 0 ? parseVersion(result.stdout) : null;
}
