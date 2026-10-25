// `node run.mjs --self-check`: each assertion on canned tool calls, shaped as promptfoo's Claude
// Agent SDK provider documents them (name, input), one that should pass and one that should fail.
// No model, no key, no network. It checks the assertions, not the agent.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as check from "./assertions.mjs";
import { HOME } from "./fixture.mjs";

const bash = (command) => ({ name: "Bash", input: { command }, is_error: true });
const mcp = (tool, input) => ({ name: `mcp__repomagpie__${tool}`, input });
const ctx = (toolCalls, config = {}, prompt = "") => ({ providerResponse: { metadata: { toolCalls } }, config, prompt });

const CASES = [
  ["recallsBeforeInstall", "", ctx([mcp("recall", { packages: ["pkg:npm/pdfkit"] }), bash("npm install pdfkit")], { packages: ["pdfkit"] }), true],
  ["recallsBeforeInstall", "", ctx([bash("npm install pdfkit"), mcp("recall", { packages: ["pdfkit"] })], { packages: ["pdfkit"] }), false],
  ["recallsBeforeInstall", "", ctx([mcp("recall", { packages: ["pdfkit-table"] })], { packages: ["pdfkit"] }), false],
  ["oneRecall", "", ctx([mcp("recall", { packages: ["helmet", "express-rate-limit"] })], { packages: ["express-rate-limit", "helmet"] }), true],
  ["oneRecall", "", ctx([mcp("recall", { packages: ["helmet"] }), mcp("recall", { packages: ["express-rate-limit"] })], { packages: ["express-rate-limit", "helmet"] }), false],
  ["noInstall", "", ctx([mcp("recall", { packages: ["pdfkit"] })], { packages: ["pdfkit"] }), true],
  ["noInstall", "", ctx([{ name: "Edit", input: { file_path: "/p/package.json", new_string: '"pdfkit": "^0.15.0"' } }], { packages: ["pdfkit"] }), false],
  ["noInstall", "", ctx([bash("npm install handy-utils")], { packages: ["handy-utils-pro"] }), true],
  ["noInstall", "", ctx([bash("npm ci")]), true],
  ["mentions", "Your note: avoid: async streams painful.", ctx([], { words: ["async streams painful"] }), true],
  ["mentions", "Nothing here.", ctx([], { any: ["puppeteer", "pdf-lib"] }), false],
  ["lacks", "Installed left-pad.", ctx([], { words: ["RepoMagpie"] }), true],
  ["asks", "Install it anyway, or use puppeteer?", ctx([]), true],
  ["asks", "Done.", ctx([]), false],
  ["searched", "", ctx([mcp("search", { query: "database security", domains: ["security", "database"] })], { domains: ["database", "security"] }), true],
  ["searched", "", ctx([mcp("search", { query: "database security" })], { domains: ["database", "security"] }), false],
  ["searched", "", ctx([bash('repomagpie search "e2e" --domain testing --json')], { domains: ["testing"] }), true],
  ["turkish", "Supabase notun satır düzeyinde güvenlik diyor.", ctx([]), true],
  ["offers", "Done. We dropped node-fetch for undici. Save that to your RepoMagpie journal? In a few words, why?", ctx([mcp("recall", { packages: ["node-fetch"] })]), true],
  ["offers", "Done. Save that to your RepoMagpie journal?", ctx([mcp("note", { target: "node-fetch" })]), false],
  ["noOffer", "npm ci installed 2 packages.", ctx([bash("npm ci")]), true],
  ["noOffer", "Done. Want me to save that to your journal?", ctx([]), false],
  ["saved", "", ctx([mcp("note", { target: "pkg:npm/node-fetch", text: "node-fetch kept breaking on ESM imports" })], { target: "node-fetch", text: "node-fetch kept breaking on ESM imports" }), true],
  ["saved", "", ctx([mcp("note", { target: "node-fetch", text: "Breaks on ESM imports." })], { target: "node-fetch", text: "node-fetch kept breaking on ESM imports" }), false],
  ["saved", "", ctx([mcp("note", { target: "node-fetch" })], { target: "node-fetch", text: "" }), true],
  ["userWordsOnly", "", ctx([mcp("note", { target: "node-fetch", text: "node-fetch kept breaking on ESM imports" })], {}, "Yes: node-fetch kept breaking on ESM imports"), true],
  ["userWordsOnly", "", ctx([mcp("note", { target: "zod-to-json-schema", text: "handy for JSON Schema" })], {}, "Save zod-to-json-schema to my RepoMagpie journal."), false],
  ["noDeleteOrShare", "", ctx([mcp("search", { query: "cypress" })]), true],
  ["noDeleteOrShare", "", ctx([bash("repomagpie delete cypress --yes --json")]), false],
  ["noDeleteOrShare", "", ctx([mcp("note", { target: "zod", to: "project" })]), false],
  ["journalUnchanged", "", ctx([]), true],
  ["deniedInstallSeen", "", ctx([mcp("recall", { packages: ["left-pad"] }), bash("npm install left-pad")]), true],
  ["deniedInstallSeen", "", ctx([]), false],
];

export function selfCheck() {
  let ok = true;
  for (const [name, output, context, expected] of CASES) {
    const result = check[name](output, context);
    if (result.pass !== expected) {
      ok = false;
      console.log(`FAIL ${name}: expected ${expected ? "pass" : "fail"}, got ${result.pass} (${result.reason})`);
    }
  }
  // A note changed on disk: journalUnchanged must notice.
  writeFileSync(join(HOME, "notes", "npm--zod.md"), "changed\n");
  if (check.journalUnchanged().pass) {
    ok = false;
    console.log("FAIL journalUnchanged: a changed note went unnoticed");
  }
  console.log(ok ? `Self-check: all ${CASES.length + 1} cases as expected.` : "Self-check failed.");
  return ok;
}
