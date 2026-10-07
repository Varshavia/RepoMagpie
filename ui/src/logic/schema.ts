// Values and rules the app needs from core, which it can't bundle (core reads files).
// schema.test.ts checks each one against core, so core stays the single source.

export const KINDS = ["skill-pack", "cli", "library", "framework", "plugin", "app", "platform", "awesome-list", "template", "other"];

export const DRAFT_MARKER = "<!-- magpie:draft -->";

// A PURL as people read it (core's readablePurl): pkg:npm/%40playwright/cli → pkg:npm/@playwright/cli.
// For display only; copies and requests keep the encoded id.
export function readablePurl(purl: string): string {
  try {
    return decodeURIComponent(purl);
  } catch {
    return purl;
  }
}

// A PURL's type and its package name as people write it: pkg:npm/%40playwright/cli → npm, @playwright/cli.
export function packageLabel(purl: string): { type: string; name: string } {
  const match = readablePurl(purl).match(/^pkg:([^/]+)\/([^?#]+)/);
  return match ? { type: match[1], name: match[2] } : { type: "", name: purl };
}

// Tags are lowercase kebab-case (note schema; core's tag list).
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// An avoid note (decision 0024): its Verdict starts with the word "avoid", or Avoid when has text.
export function isAvoid(match: { verdict: string | null; avoid_when: string[] }): boolean {
  return verdictSaysAvoid(match.verdict) || match.avoid_when.length > 0;
}

// A Verdict that says to avoid the package: adopt names no install command for one (spec §2).
export function verdictSaysAvoid(verdict: string | null): boolean {
  return /^avoid\b/i.test(verdict ?? "");
}

// The Claude Code hook asks the user first only for an exact match on an avoid note (spec §6).
export function hookWouldAsk(match: { confidence: "exact" | "name-only"; verdict: string | null; avoid_when: string[] }): boolean {
  return match.confidence === "exact" && isAvoid(match);
}
