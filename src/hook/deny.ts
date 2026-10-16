// What the adapters of agents that can't ask add to the core (decision 0036): whether to deny the
// first try of an install an avoid note is on, the deny reason for the agent and the line for the
// user. Its own module, with the retry record, so the Claude Code hook never loads it.
import { resolvePersonalJournal } from "../core/journals.ts";
import { CAPS, clean, cut } from "../core/text.ts";
import { packageName, personal, reasonBlocks, shortList, type HookContext, type Limits, type Recalled } from "./core.ts";
import { retryDecision, retryKey } from "./retry.ts";

// "deny" the first try, and record it; "inform" for the same install until 10 minutes after that
// deny, and when the retry record can't be read or written (a deny without a record would stop the
// retry too).
export function retryAnswer(r: Recalled, agent: string, ctx: HookContext, now = Date.now()): "deny" | "inform" {
  if (!r.avoid.length) return "inform";
  const journal = resolvePersonalJournal({ home: ctx.home, env: ctx.env, cwd: ctx.cwd, flag: ctx.homeFlag }).path;
  return retryDecision(journal, retryKey(agent, r.cwd, r.stopped), now) === "deny" ? "deny" : "inform";
}

// For the agent: the notes as in a prompt, then the hook's own advice, which always fits.
export function denyReason(r: Recalled, limits: Limits): string {
  const several = r.stopped.length > 1;
  const advice = `RepoMagpie: this install was stopped once. Show the user ${r.avoid.length > 1 ? "these notes" : "this note"} and ask whether to install anyway or use an alternative; ` +
    `don't install ${several ? "them" : "it"} again without the user's OK. If the user says to go ahead, install the same ${several ? "packages" : "package"} again within 10 minutes: ` +
    `RepoMagpie lets ${several ? "them" : "it"} through until then.`;
  const tail = [r.unchecked, advice].filter(Boolean).join("\n\n");
  return `${reasonBlocks(r, { pack: limits.pack, cap: limits.cap - tail.length - 2 })}\n\n${tail}`;
}

// For the user: what was stopped and who says to avoid it.
export function stoppedLine(r: Recalled): string {
  const names = shortList(r.stopped.map((install) => cut(clean(install.name), CAPS.name)));
  const why = shortList(r.avoid.map((m) => (personal(m) ? `you noted to avoid ${packageName(m)}` : `this project's journal says to avoid ${packageName(m)}`)), "; ");
  return `RepoMagpie: stopped installing ${names}: ${why}. Your agent should ask you; the same install goes through for the next 10 minutes.`;
}
