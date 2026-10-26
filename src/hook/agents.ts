// The agents `repomagpie hook <agent>` has an adapter for. Its own module, so the CLI's entry can
// take the hook's fast path without loading anything else.
export const HOOK_AGENTS = ["claude-code", "codex", "gemini-cli", "antigravity", "copilot", "cursor"] as const;
export type HookAgent = (typeof HOOK_AGENTS)[number];
// Every `repomagpie hook` subcommand: the agents' adapters, and Claude Code's Stop reminder
// (decision 0042), which runs once a turn.
export const HOOK_COMMANDS = [...HOOK_AGENTS, "claude-code-stop"] as const;
export type HookCommand = (typeof HOOK_COMMANDS)[number];
