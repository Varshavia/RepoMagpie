import { test } from "node:test";
import assert from "node:assert/strict";
import { whyLine } from "./search.ts";

test("whyLine: domains (suggested ones say so), then tags, then the words; null when nothing matched by name", () => {
  const why = (domains: string[], tags: string[], words: string[]) => ({ why: { domains, tags, words }, domains_suggested: ["testing"] });
  assert.equal(whyLine(why(["database", "testing"], ["postgresql"], ["orm", "sql"])), "domain database · domain testing (suggested) · tag postgresql · words orm, sql");
  assert.equal(whyLine(why([], [], ["orm"])), "word orm");
  assert.equal(whyLine(why([], [], [])), null);
});
