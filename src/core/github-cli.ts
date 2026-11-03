// `gh auth token` for the GitHub token (decision 0053): gh by the absolute path PATH gives (never a
// bare name: Windows looks in the current folder first), with a short timeout. Its output is the
// token, so nothing of it is printed or kept beyond the answer.
import { onPath, runCli } from "./agent-cli.ts";
import type { Where } from "./agents.ts";
import type { GhLogin } from "./github-auth.ts";

const GH_TIMEOUT = 3_000;

export function ghLogin(where: Where, run: typeof runCli = runCli): GhLogin {
  return () => {
    const [gh] = onPath("gh", where);
    if (!gh) return null;
    const result = run(gh, ["auth", "token"], { env: where.env, platform: where.platform, cwd: where.home, timeoutMs: GH_TIMEOUT });
    return result.status === 0 ? result.stdout : null;
  };
}
