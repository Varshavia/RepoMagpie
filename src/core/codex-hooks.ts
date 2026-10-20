// What Codex CLI keeps about hooks in its config.toml (decision 0036; docs/agents.md, "Codex CLI"),
// read as Codex's source does (codex-rs/hooks/src/engine/discovery.rs and codex-rs/config, main,
// 2026-10-18): whether hooks are turned off ([features] hooks = false), and the trust of one hook,
// kept under [hooks.state."<hooks.json>:pre_tool_use:<group>:<handler>"] as trusted_hash: the
// SHA-256 of the hook's identity, which setup's entry must match. Never writes.
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { tomlString } from "./agents.ts";

// Codex's own hash of a PreToolUse handler: its event, its group's matcher and the handler as Codex
// normalises it (the command it runs on this platform, the timeout, 600 by default, async), as
// sorted compact JSON (version_for_toml). Fields Codex leaves unset are left out.
export function codexHookHash(matcher: string | null, handler: Record<string, unknown>, windows: boolean): string {
  const str = (key: string) => (typeof handler[key] === "string" ? (handler[key] as string) : undefined);
  const command = (windows ? str("commandWindows") ?? str("command_windows") : undefined) ?? str("command");
  const timeout = typeof handler.timeout === "number" ? Math.max(1, handler.timeout) : 600;
  const limit = typeof handler.additionalContextLimit === "number" && handler.additionalContextLimit !== 2_500 ? handler.additionalContextLimit : undefined;
  const normalised = { type: "command", command, timeout, async: handler.async === true, statusMessage: str("statusMessage"), additionalContextLimit: limit };
  const identity = { event_name: "pre_tool_use", matcher: matcher ?? undefined, hooks: [normalised] };
  return `sha256:${createHash("sha256").update(canonical(identity)).digest("hex")}`;
}

// JSON with every object's keys sorted, undefined members left out, as serde_json writes it.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const header = (line: string) => line.match(/^\s*\[\s*([^[\]]+?)\s*\]\s*(?:#.*)?$/)?.[1];
// A dotted TOML key, each part bare or quoted.
const keyParts = (raw: string) => [...raw.matchAll(/\s*("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)\s*(?:\.|$)/g)].map((m) => tomlString(m[1]) ?? m[1]);

// Whether config.toml turns hooks off: `hooks = false` (or the older `codex_hooks`) in [features],
// or `features.hooks = false` at the top.
export function codexHooksOff(text: string): boolean {
  let table: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const h = header(line);
    if (h !== undefined) {
      table = keyParts(h);
      continue;
    }
    const pair = line.match(/^\s*([^=#]+?)\s*=\s*false\s*(?:#.*)?$/);
    if (!pair) continue;
    const key = [...table, ...keyParts(pair[1])].join(".");
    if (key === "features.hooks" || key === "features.codex_hooks") return true;
  }
  return false;
}

export interface CodexTrust {
  trusted_hash: string | null;
  enabled: boolean; // false: the user turned this hook off in /hooks
}

// The state Codex keeps for the handler at `group`/`handler` of PreToolUse in `hooksFile`, or null
// when it has none (never trusted). The file part of the key is compared as a path.
export function codexTrust(text: string, hooksFile: string, group: number, handler: number, windows: boolean): CodexTrust | null {
  const same = (a: string, b: string) => (windows ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));
  const suffix = `:pre_tool_use:${group}:${handler}`;
  let state: CodexTrust | null = null;
  let inside = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const h = header(line);
    if (h !== undefined) {
      const [a, b, key, ...rest] = keyParts(h);
      inside = a === "hooks" && b === "state" && key !== undefined && !rest.length && key.endsWith(suffix) && same(key.slice(0, -suffix.length), hooksFile);
      if (inside) state = { trusted_hash: null, enabled: true };
      continue;
    }
    if (!inside || !state) continue;
    const pair = line.match(/^\s*(trusted_hash|enabled)\s*=\s*(.+?)\s*(?:#.*)?$/);
    if (pair?.[1] === "trusted_hash") state.trusted_hash = tomlString(pair[2]);
    else if (pair?.[1] === "enabled") state.enabled = pair[2] !== "false";
  }
  return state;
}
