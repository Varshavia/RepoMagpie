import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { hookOutput } from "./claude-code.ts";

// The Claude Code PreToolUse adapter (spec §6, decision 0024), on journals in scratch folders.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });

function world(files: Record<string, string>) {
  const root = scratchBase("hook");
  for (const [path, text] of Object.entries({ "home/": "", "project/.git/": "", ...files })) {
    if (path.endsWith("/")) mkdirSync(join(root, path), { recursive: true });
    else {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  }
  const journal = join(root, "journal");
  return {
    root,
    journal,
    project: join(root, "project"),
    run: (command: unknown, options: { informOnly?: boolean; tool?: string; cwd?: string } = {}) => {
      const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: options.tool ?? "Bash", tool_input: { command }, cwd: options.cwd ?? join(root, "project") });
      const out = hookOutput(input, { env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: root, informOnly: options.informOnly ?? false });
      return out === null ? null : JSON.parse(out);
    },
  };
}

const PDFKIT = note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful; use puppeteer", avoidWhen: ["you need streamed output for large PDFs"] });
const PUPPETEER = note({ id: "pkg:npm/puppeteer", verdict: "default for PDF rendering in new projects" });

test("an exact avoid note asks: the note is the reason, and the agent gets it as context", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const path = join(w.journal, "notes", "npm--pdfkit.md");
  assert.deepEqual(w.run("npm install pdfkit@1.2.0"), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: `magpie: you noted to avoid pdfkit (personal journal)\nVerdict: avoid: async streams painful; use puppeteer\nAvoid when: you need streamed output for large PDFs\n${path}`,
      additionalContext: `Note from your journal: pdfkit — avoid: async streams painful; use puppeteer. Avoid when: you need streamed output for large PDFs (personal journal, ${path})`,
    },
  });
});

test("any other match informs only: context for the agent, a message for the user, no decision", () => {
  const w = world({ "project/.magpie/notes/npm--puppeteer.md": PUPPETEER });
  const path = join(w.project, ".magpie", "notes", "npm--puppeteer.md");
  assert.deepEqual(w.run("pnpm add puppeteer"), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `Note from your journal: puppeteer — default for PDF rendering in new projects (project journal, ${path})`,
    },
    systemMessage: "magpie: puppeteer — default for PDF rendering in new projects",
  });
});

test("an avoid note found only by name informs, labelled; it never asks", () => {
  const w = world({ "journal/notes/pypi--pdfkit.md": note({ id: "pkg:pypi/pdfkit", verdict: "avoid: unmaintained" }) });
  const out = w.run("npm i pdfkit");
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  assert.equal(out.systemMessage, "magpie: pdfkit — avoid: unmaintained (name match only)");
});

test("--inform-only never asks, also for an exact avoid note", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  const out = w.run("npm install pdfkit", { informOnly: true });
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, undefined);
  assert.match(out.systemMessage, /^magpie: pdfkit — avoid: async streams painful; use puppeteer\. Avoid when: /);
});

test("several packages: one document; any avoid note makes the call ask, avoid notes first in the reason", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER, "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk" }) });
  const out = w.run("npm i puppeteer chalk && npm i pdfkit");
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  const reason: string = out.hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.startsWith("magpie: you noted to avoid pdfkit"), reason);
  assert.match(reason, /\n\nmagpie: note on puppeteer \(personal journal\)\nVerdict: default for PDF rendering in new projects\n/);
  assert.match(reason, /\n\nmagpie: note on chalk \(personal journal\)\nVerdict: \[inbox\] no verdict yet\n/);
  assert.equal(out.hookSpecificOutput.additionalContext.split("\n").length, 3);
  assert.equal(out.systemMessage, undefined);
  assert.ok(!JSON.stringify(out).includes("deny"));
});

test("the project journal is found from the hook input's cwd", () => {
  const w = world({ "elsewhere/.git/": "", "elsewhere/.magpie/notes/npm--puppeteer.md": PUPPETEER });
  assert.equal(w.run("npm i puppeteer"), null); // from <root>/project: no project journal
  assert.match(w.run("npm i puppeteer", { cwd: join(w.root, "elsewhere") }).systemMessage, /^magpie: puppeteer/);
});

test("silent (null) when there is nothing to say: no install, no note, another tool, bad input", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT });
  assert.equal(w.run("npm test"), null);
  assert.equal(w.run("npm install"), null);
  assert.equal(w.run("npm install left-pad"), null);
  assert.equal(w.run("npm install pdfkit", { tool: "Write" }), null);
  assert.equal(w.run(42), null);
  assert.equal(hookOutput("not json", { env: {}, home: w.root, cwd: w.root, informOnly: false }), null);
  assert.equal(hookOutput("null", { env: {}, home: w.root, cwd: w.root, informOnly: false }), null);
});

test("each text stays under Claude Code's 10,000-character cap", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: `avoid: ${"x".repeat(20_000)}` }) });
  const out = w.run("npm i pdfkit");
  for (const text of [out.hookSpecificOutput.permissionDecisionReason, out.hookSpecificOutput.additionalContext]) {
    assert.ok(text.length <= 10_000, String(text.length));
    assert.ok(text.endsWith("…"));
  }
});
