// Values the app needs from core, which it can't bundle (core reads files). schema.test.ts checks
// each one against core, so core stays the single source.

export const KINDS = ["skill-pack", "cli", "library", "framework", "plugin", "app", "platform", "awesome-list", "template", "other"];

export const DRAFT_MARKER = "<!-- magpie:draft -->";

// Tags are lowercase kebab-case (note schema; core's tag list).
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// An avoid note (decision 0024): its Verdict starts with the word "avoid", or Avoid when has text.
export function isAvoid(match: { verdict: string | null; avoid_when: string[] }): boolean {
  return /^avoid\b/i.test(match.verdict ?? "") || match.avoid_when.length > 0;
}

// The Claude Code hook asks the user first only for an exact match on an avoid note (spec §6).
export function hookWouldAsk(match: { confidence: "exact" | "name-only"; verdict: string | null; avoid_when: string[] }): boolean {
  return match.confidence === "exact" && isAvoid(match);
}
