// Tag aliases (RFC 0001 §4.3, decision 0041): other spellings of a tag, mapped to the canonical one.
// tags.md gives them in parentheses after the tag: - `postgresql` (postgres, psql) — the PostgreSQL
// database. A starter list ships here; the journal's tags.md wins over it. Aliases apply when a topic
// becomes a tag, in --tag filters, in search's tag matching, and in query expansion when a query word
// is exactly an alias. Pure; the caller reads tags.md.

// Well-known spellings only. Each alias names one technology, and none is a common English word
// ("next", "node", "go" and "express" are left out on purpose).
export const STARTER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "postgresql": ["postgres", "psql"],
  "mysql": ["my-sql"],
  "mongodb": ["mongo"],
  "sqlite": ["sqlite3"],
  "nextjs": ["next.js", "next-js"],
  "nuxt": ["nuxtjs", "nuxt-js", "nuxt.js"],
  "react": ["reactjs", "react-js", "react.js"],
  "vue": ["vuejs", "vue-js", "vue.js"],
  "svelte": ["sveltejs"],
  "sveltekit": ["svelte-kit"],
  "nestjs": ["nest.js", "nest-js"],
  "expressjs": ["express.js", "express-js"],
  "nodejs": ["node.js", "node-js"],
  "typescript": ["ts"],
  "javascript": ["js", "ecmascript"],
  "tailwind": ["tailwindcss", "tailwind-css"],
  "shadcn": ["shadcn-ui", "shadcn/ui"],
  "threejs": ["three.js", "three-js"],
  "electron": ["electronjs"],
  "vite": ["vitejs"],
  "graphql": ["gql"],
  "kubernetes": ["k8s"],
  "python": ["python3"],
  "rust": ["rust-lang", "rustlang"],
  "golang": ["go-lang"],
  "dotnet": [".net", "dot-net"],
  "csharp": ["c#", "c-sharp"],
  "cpp": ["c++", "cplusplus"],
  "llm": ["llms", "large-language-models", "large-language-model"],
  "ai": ["artificial-intelligence"],
  "machine-learning": ["ml"],
  "mcp": ["model-context-protocol"],
  "oauth": ["oauth2"],
  "github-actions": ["gh-actions"],
};

// A tags.md line's tag and its aliases: "- `postgresql` (postgres, psql) — meaning". Aliases are
// lowercased and trimmed; an empty one is dropped. Lines without parentheses give no aliases.
const LINE = /^\s*[-*]\s+`?([a-z0-9]+(?:-[a-z0-9]+)*)`?\s*\(([^()\r\n]*)\)/;

export function parseAliasLines(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(LINE);
    if (!match) continue;
    const aliases = match[2].split(",").map((a) => a.trim().toLowerCase()).filter((a) => a && a !== match[1]);
    out.set(match[1], [...new Set([...(out.get(match[1]) ?? []), ...aliases])]);
  }
  return out;
}

// alias → canonical tag, for one journal. The starter list, except where tags.md speaks:
// - a tag whose tags.md line has aliases keeps only those (none of the starter's for it);
// - a spelling tags.md lists as a tag of its own is never an alias of the starter list;
// - an alias tags.md gives wins over the starter list's use of the same spelling.
export function aliasMap(tagList: readonly string[], userAliases: ReadonlyMap<string, readonly string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(STARTER_ALIASES)) {
    if (userAliases.has(canonical)) continue;
    for (const alias of aliases) if (!tagList.includes(alias)) map.set(alias, canonical);
  }
  for (const [canonical, aliases] of userAliases) for (const alias of aliases) if (alias !== canonical) map.set(alias, canonical);
  // A canonical tag that is itself an alias (tags.md made "pg" the tag and "postgresql" its alias):
  // follow it to the end; a cycle drops the alias.
  for (const alias of [...map.keys()]) {
    const seen = new Set([alias]);
    let target = map.get(alias) as string;
    while (map.has(target) && !seen.has(target)) {
      seen.add(target);
      target = map.get(target) as string;
    }
    if (seen.has(target)) map.delete(alias);
    else map.set(alias, target);
  }
  return map;
}

// The canonical form of a tag, or the tag itself.
export function canonicalTag(tag: string, aliases: ReadonlyMap<string, string>): string {
  const lower = tag.toLowerCase();
  return aliases.get(lower) ?? lower;
}

// The canonical tags a query names: a word (split at white space) that is exactly an alias, or a
// whole spelling such as "next.js". Used to expand a search query; never a partial match.
export function queryAliases(query: string, aliases: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const word of query.toLowerCase().split(/\s+/)) {
    const canonical = aliases.get(word.replace(/^[^\p{L}\p{N}.#+]+|[^\p{L}\p{N}#+]+$/gu, ""));
    if (canonical && !out.includes(canonical)) out.push(canonical);
  }
  return out;
}
