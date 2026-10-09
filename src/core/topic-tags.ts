// GitHub topics as tags (decision 0030): which of a repository's topics may become its tags, ranked
// so that tags that connect notes come first. Used at creation (magpie note, magpie import, Add) and
// for Add's "From GitHub topics" chips. Pure; the app gets the result through the API.

export const TAG_LIMIT = 8;

const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Topics that say how a repository is run, not what it is about. The app mirrors this
// (ui/src/logic/schema.ts) for the note view's chips; a test keeps the two equal.
const STOP = /^(hacktoberfest(\d{4})?|open-source|opensource|good-first-issue)$/;

export function isStopTopic(topic: string): boolean {
  return STOP.test(topic);
}

export interface KnownTags {
  tagList: readonly string[]; // the journal's tags.md
  shared: { has(topic: string): boolean }; // topics and tags that other notes in the journal carry
}

// The topics that may become tags: valid tags, not the repository's own name, not on the stop list,
// each once. Ranked: in tags.md, then carried by another note, then the rest; GitHub's order within
// each group (Array.prototype.sort is stable).
export function rankTopics(topics: readonly unknown[], id: string, known: KnownTags): string[] {
  const repo = id.match(/^pkg:github\/[^/]+\/([^/?#@]+)/)?.[1]?.toLowerCase();
  const usable = [...new Set(topics)].filter((t): t is string => typeof t === "string" && TAG.test(t) && !isStopTopic(t) && t !== repo);
  const group = (topic: string) => (known.tagList.includes(topic) ? 0 : known.shared.has(topic) ? 1 : 2);
  return usable.sort((a, b) => group(a) - group(b));
}

// The tags a new note gets from its topics.
export function topicTags(topics: readonly unknown[], id: string, known: KnownTags): string[] {
  return rankTopics(topics, id, known).slice(0, TAG_LIMIT);
}
