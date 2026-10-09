import { test } from "node:test";
import assert from "node:assert/strict";
import { rankTopics, TAG_LIMIT, topicTags } from "./topic-tags.ts";

const none = { tagList: [], shared: new Set<string>() };
const DIFY = "pkg:github/langgenius/dify";

test("rankTopics: in tags.md first, then carried by another note, then the rest; GitHub's order within each", () => {
  const topics = ["agent", "ai", "llm", "mcp", "python", "workflow"];
  const known = { tagList: ["workflow", "python"], shared: new Set(["llm", "agent", "unrelated"]) };
  assert.deepEqual(rankTopics(topics, DIFY, known), ["python", "workflow", "agent", "llm", "ai", "mcp"]);
});

test("rankTopics without a tag list or other notes keeps GitHub's order", () => {
  assert.deepEqual(rankTopics(["b", "a", "c"], DIFY, none), ["b", "a", "c"]);
});

test("topicTags: at most 8, cut after the ranking", () => {
  const topics = Array.from({ length: 12 }, (_, i) => `t${String(i).padStart(2, "0")}`);
  assert.equal(TAG_LIMIT, 8);
  assert.deepEqual(topicTags(topics, DIFY, none), topics.slice(0, 8));
  assert.deepEqual(topicTags(topics, DIFY, { tagList: ["t11"], shared: new Set(["t10"]) }), ["t11", "t10", ...topics.slice(0, 6)]);
});

test("the repository's own name is skipped, ignoring case", () => {
  assert.deepEqual(rankTopics(["open-webui", "llm"], "pkg:github/open-webui/open-webui", none), ["llm"]);
  assert.deepEqual(rankTopics(["stirling-pdf", "pdf"], "pkg:github/stirling-tools/Stirling-PDF", none), ["pdf"]);
  assert.deepEqual(rankTopics(["coolify"], "pkg:github/coollabsio/coolify", { tagList: ["coolify"], shared: new Set(["coolify"]) }), []);
});

test("the stop list: hacktoberfest (with or without a year), open-source, opensource, good-first-issue", () => {
  const topics = ["hacktoberfest", "hacktoberfest2023", "open-source", "opensource", "good-first-issue", "pdf", "hacktoberfest-2023", "hacktoberfester"];
  assert.deepEqual(rankTopics(topics, DIFY, none), ["pdf", "hacktoberfest-2023", "hacktoberfester"]);
  assert.deepEqual(rankTopics(["open-source"], DIFY, { tagList: ["open-source"], shared: new Set() }), []); // even when tags.md lists it
});

test("only topics that are valid tags, each once", () => {
  assert.deepEqual(rankTopics(["Pdf", "pdf", "pdf--tools", "-x", "llm", "llm", 7 as unknown as string], DIFY, none), ["pdf", "llm"]);
});

test("a registry package has no topics, so no tags", () => {
  assert.deepEqual(topicTags([], "pkg:npm/pdfkit", { tagList: ["pdf"], shared: new Set(["pdf"]) }), []);
});
