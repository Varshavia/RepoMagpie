// The agents `repomagpie hook <agent>` has an adapter for. Its own module, so the CLI's entry can
// take the hook's fast path without loading anything else.
export const HOOK_AGENTS = ["claude-code", "codex", "gemini-cli", "antigravity", "copilot"] as const;
export type HookAgent = (typeof HOOK_AGENTS)[number];
