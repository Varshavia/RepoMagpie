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
    run: (command: unknown, options: { informOnly?: boolean; tool?: string; cwd?: string; bom?: boolean } = {}) => {
      const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: options.tool ?? "Bash", tool_input: { command }, cwd: options.cwd ?? join(root, "project") });
      const out = hookOutput(`${options.bom ? "﻿" : ""}${input}`, { env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: root, informOnly: options.informOnly ?? false });
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

test("input that starts with a UTF-8 byte-order mark (a Windows PowerShell pipe) gives the same output", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--puppeteer.md": PUPPETEER });
  for (const command of ["npm install pdfkit", "pnpm add puppeteer", "npm test"]) {
    assert.deepEqual(w.run(command, { bom: true }), w.run(command), command);
  }
  assert.notEqual(w.run("npm install pdfkit", { bom: true }), null);
});

// --- Alternatives (decision 0029): text only; they never change whether the hook asks ---

const withAlternatives = (text: string, entries: string[]) => text.replace("\nstatus:", `\nalternatives: [${entries.map((e) => JSON.stringify(e)).join(", ")}]\nstatus:`);
const PLAYWRIGHT = note({ id: "pkg:npm/playwright", verdict: "browser tests" });
const notePath = (w: { journal: string }, file: string) => join(w.journal, "notes", file);

test("ask with one alternative: the reason names it with its Verdict; the context says to offer it", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": withAlternatives(PDFKIT, ["[[puppeteer]]"]), "journal/notes/npm--puppeteer.md": PUPPETEER });
  const path = notePath(w, "npm--pdfkit.md");
  assert.deepEqual(w.run("npm install pdfkit"), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "magpie: you noted to avoid pdfkit (personal journal)\nVerdict: avoid: async streams painful; use puppeteer\n" +
        `Avoid when: you need streamed output for large PDFs\nAlternatives: puppeteer: default for PDF rendering in new projects\n${path}`,
      additionalContext: "Note from your journal: pdfkit — avoid: async streams painful; use puppeteer. Avoid when: you need streamed output for large PDFs " +
        `(personal journal, ${path}). Alternatives in your journal: puppeteer (default for PDF rendering in new projects, personal journal). ` +
        "Offer them to the user instead of pdfkit, and recall an alternative before installing it.",
    },
  });
});

test("ask with five alternatives: 3, then +2 more; an inbox, an avoid and an unresolved one say so", () => {
  const w = world({
    "journal/notes/npm--pdfkit.md": withAlternatives(PDFKIT, ["[[puppeteer]]", "[[pdf-lib]]", "[[jspdf]]", "[[wkhtmltopdf]]"]),
    "journal/notes/npm--puppeteer.md": PUPPETEER,
    "journal/notes/npm--playwright.md": withAlternatives(PLAYWRIGHT, ["[[npm--pdfkit]]"]),
    "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib" }),
    "journal/notes/npm--jspdf.md": note({ id: "pkg:npm/jspdf", verdict: "avoid: tiny API" }),
  });
  const path = notePath(w, "npm--pdfkit.md");
  const out = w.run("npm i pdfkit");
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, "magpie: you noted to avoid pdfkit (personal journal)\nVerdict: avoid: async streams painful; use puppeteer\n" +
    "Avoid when: you need streamed output for large PDFs\n" +
    "Alternatives: playwright: browser tests; puppeteer: default for PDF rendering in new projects; pdf-lib: [inbox] no verdict yet; +2 more\n" + path);
  assert.equal(out.hookSpecificOutput.additionalContext, "Note from your journal: pdfkit — avoid: async streams painful; use puppeteer. Avoid when: you need streamed output for large PDFs " +
    `(personal journal, ${path}). Alternatives in your journal: playwright (browser tests, personal journal); ` +
    "puppeteer (default for PDF rendering in new projects, personal journal); pdf-lib ([inbox] no verdict yet, personal journal); +2 more. " +
    "Offer them to the user instead of pdfkit, and recall an alternative before installing it.");
});

test("an avoid alternative and an unresolved one, in full", () => {
  const w = world({
    "journal/notes/npm--pdfkit.md": withAlternatives(PDFKIT, ["[[jspdf]]", "[[wkhtmltopdf]]"]),
    "journal/notes/npm--jspdf.md": note({ id: "pkg:npm/jspdf", verdict: "avoid: tiny API" }),
  });
  const out = w.run("npm i pdfkit");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /\nAlternatives: jspdf: avoid: tiny API \(you also noted to avoid it\); wkhtmltopdf\n/);
  assert.match(out.hookSpecificOutput.additionalContext,
    /\. Alternatives in your journal: jspdf \(avoid: tiny API, personal journal; you also noted to avoid it\); wkhtmltopdf\. Offer them/);
});

test("inform with an alternative: the context names it and says to recall it; the message gets a short suffix", () => {
  const w = world({ "journal/notes/npm--puppeteer.md": withAlternatives(PUPPETEER, ["[[playwright]]"]), "journal/notes/npm--playwright.md": PLAYWRIGHT });
  const path = notePath(w, "npm--puppeteer.md");
  assert.deepEqual(w.run("pnpm add puppeteer"), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `Note from your journal: puppeteer — default for PDF rendering in new projects (personal journal, ${path}). ` +
        "Alternatives in your journal: playwright (browser tests, personal journal). Recall an alternative before installing it.",
    },
    systemMessage: "magpie: puppeteer — default for PDF rendering in new projects. Alternatives: playwright",
  });
});

test("an alternative that is an avoid note, from the other side: named and marked, and the hook still only informs", () => {
  const w = world({ "journal/notes/npm--puppeteer.md": PUPPETEER, "journal/notes/npm--pdfkit.md": withAlternatives(PDFKIT, ["[[puppeteer]]"]) });
  const path = notePath(w, "npm--puppeteer.md");
  assert.deepEqual(w.run("npm i puppeteer"), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `Note from your journal: puppeteer — default for PDF rendering in new projects (personal journal, ${path}). ` +
        "Alternatives in your journal: pdfkit (avoid: async streams painful; use puppeteer, personal journal; you also noted to avoid it). Recall an alternative before installing it.",
    },
    systemMessage: "magpie: puppeteer — default for PDF rendering in new projects. Alternatives: pdfkit",
  });
});

test("--inform-only with alternatives: no decision; the context still says to offer them", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": withAlternatives(PDFKIT, ["[[puppeteer]]"]), "journal/notes/npm--puppeteer.md": PUPPETEER });
  const path = notePath(w, "npm--pdfkit.md");
  assert.deepEqual(w.run("npm install pdfkit", { informOnly: true }), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: "Note from your journal: pdfkit — avoid: async streams painful; use puppeteer. Avoid when: you need streamed output for large PDFs " +
        `(personal journal, ${path}). Alternatives in your journal: puppeteer (default for PDF rendering in new projects, personal journal). ` +
        "Offer them to the user instead of pdfkit, and recall an alternative before installing it.",
    },
    systemMessage: "magpie: pdfkit — avoid: async streams painful; use puppeteer. Avoid when: you need streamed output for large PDFs. Alternatives: puppeteer",
  });
});

test("a multi-package install where only one package has alternatives: only its lines name them", () => {
  const w = world({
    "journal/notes/npm--puppeteer.md": withAlternatives(PUPPETEER, ["[[playwright]]"]),
    "journal/notes/npm--playwright.md": PLAYWRIGHT,
    "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }),
  });
  assert.deepEqual(w.run("npm i chalk puppeteer"), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: [
        `Note from your journal: chalk — colours (personal journal, ${notePath(w, "npm--chalk.md")})`,
        `Note from your journal: puppeteer — default for PDF rendering in new projects (personal journal, ${notePath(w, "npm--puppeteer.md")}). ` +
          "Alternatives in your journal: playwright (browser tests, personal journal). Recall an alternative before installing it.",
      ].join("\n"),
    },
    systemMessage: "magpie: chalk — colours\nmagpie: puppeteer — default for PDF rendering in new projects. Alternatives: playwright",
  });
});

test("a name-only match lists no alternatives", () => {
  const w = world({ "journal/notes/pypi--pdfkit.md": withAlternatives(note({ id: "pkg:pypi/pdfkit", verdict: "fine" }), ["[[weasyprint]]"]) });
  const out = w.run("npm i pdfkit");
  assert.equal(out.systemMessage, "magpie: pdfkit — fine (name match only)");
  assert.ok(!out.hookSpecificOutput.additionalContext.includes("Alternatives"));
});

test("each text stays under Claude Code's 10,000-character cap", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", verdict: `avoid: ${"x".repeat(20_000)}` }) });
  const out = w.run("npm i pdfkit");
  for (const text of [out.hookSpecificOutput.permissionDecisionReason, out.hookSpecificOutput.additionalContext]) {
    assert.ok(text.length <= 10_000, String(text.length));
    assert.ok(text.endsWith("…"));
  }
});
