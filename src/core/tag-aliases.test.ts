import { test } from "node:test";
import assert from "node:assert/strict";
import { aliasMap, canonicalTag, parseAliasLines, queryAliases, STARTER_ALIASES } from "./tag-aliases.ts";
import { parseTagList } from "./journals.ts";

// Decision 0041: tag aliases in tags.md, and the starter list.

test("tags.md: aliases in parentheses after the tag, lowercased; a line without them gives none; the tag list reads as before", () => {
  const text = [
    "# Tags",
    "",
    "- `postgresql` (postgres, PG, psql) — the PostgreSQL database",
    "- `nextjs` (next.js, next-js)",
    "- `testing` — tests and end-to-end checks",
    "* tailwind (tailwindcss)",
    "- `odd` ()",
    "Text (not a tag line).",
  ].join("\r\n");
  assert.deepEqual([...parseAliasLines(text)], [["postgresql", ["postgres", "pg", "psql"]], ["nextjs", ["next.js", "next-js"]], ["tailwind", ["tailwindcss"]], ["odd", []]]);
  assert.deepEqual(parseTagList(text), ["postgresql", "nextjs", "testing", "tailwind", "odd"]);
});

test("aliasMap: the starter list, unless tags.md speaks", () => {
  const starter = aliasMap([], new Map());
  assert.equal(starter.get("postgres"), "postgresql");
  assert.equal(starter.get("next.js"), "nextjs");
  // A tags.md line with aliases replaces the starter's for that tag.
  const own = aliasMap(["postgresql"], new Map([["postgresql", ["pgsql"]]]));
  assert.equal(own.get("pgsql"), "postgresql");
  assert.equal(own.get("postgres"), undefined);
  // A spelling tags.md lists as its own tag is never a starter alias.
  assert.equal(aliasMap(["postgres"], new Map()).get("postgres"), undefined);
  // An alias tags.md gives wins over the starter's use of the same spelling.
  assert.equal(aliasMap(["db"], new Map([["db", ["postgres"]]])).get("postgres"), "db");
  // A chain is followed to its end, and a cycle drops the alias.
  assert.equal(aliasMap([], new Map([["pg", ["postgresql"]]])).get("postgres"), "pg");
  const cycle = aliasMap([], new Map([["a-tag", ["b-tag"]], ["b-tag", ["a-tag"]]]));
  assert.equal(cycle.get("b-tag") === "a-tag" && cycle.get("a-tag") === "b-tag", false);
});

test("canonicalTag and queryAliases: an exact alias only, never part of a word", () => {
  const map = aliasMap([], new Map());
  assert.equal(canonicalTag("Postgres", map), "postgresql");
  assert.equal(canonicalTag("postgresql", map), "postgresql");
  assert.equal(canonicalTag("pdf", map), "pdf");
  assert.deepEqual(queryAliases("postgres ORM for Next.js, please", map), ["postgresql", "nextjs"]);
  assert.deepEqual(queryAliases("postgresqlx nextjsy", map), []);
  assert.deepEqual(queryAliases("a k8s cluster with c++ and .net", map), ["kubernetes", "cpp", "dotnet"]);
  assert.deepEqual(queryAliases("", map), []);
});

// Common English words, and words that name more than one thing, never alias a tag.
const NOT_ALIASES = ["next", "node", "go", "express", "react", "view", "nest", "three", "pg", "tf", "torch", "net", "agent", "agents", "test", "es", "py", "ui"];

test("the starter list: about 30 technologies; each alias names one tag; no alias is also a tag, a common word or a canonical tag", () => {
  const entries = Object.entries(STARTER_ALIASES);
  assert.ok(entries.length >= 28 && entries.length <= 40, String(entries.length));
  const seen = new Map<string, string>();
  for (const [canonical, aliases] of entries) {
    assert.match(canonical, /^[a-z0-9]+(-[a-z0-9]+)*$/, canonical);
    assert.ok(aliases.length > 0, canonical);
    for (const alias of aliases) {
      assert.equal(alias, alias.toLowerCase(), alias);
      assert.ok(!seen.has(alias), `${alias} names ${seen.get(alias)} and ${canonical}`);
      seen.set(alias, canonical);
      assert.ok(!(alias in STARTER_ALIASES), `${alias} is also a canonical tag`);
      assert.ok(!NOT_ALIASES.includes(alias), alias);
    }
  }
  for (const word of NOT_ALIASES) assert.equal(aliasMap([], new Map()).get(word), undefined, word);
});
