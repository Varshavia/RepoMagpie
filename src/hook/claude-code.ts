// Claude Code PreToolUse adapter (spec section 6). Recall isn't built yet, so the hook
// always fails open: it returns nothing, and the caller prints nothing and exits 0.
export function hookOutput(_input: string): string | null {
  return null;
}
