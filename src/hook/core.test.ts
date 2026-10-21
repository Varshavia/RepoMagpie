import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote, type NewNote } from "../core/write.ts";
import { parseInput, recallFor, type HookContext } from "./core.ts";
import { retryAnswer } from "./deny.ts";
import { RETRY_WINDOW, retryFile } from "./retry.ts";

// The agent-neutral core (decision 0036): which installs an avoid note stops, and the deny-once
// answer for agents that can't ask. The texts themselves are pinned by the Claude Code tests.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const T0 = Date.UTC(2026, 9, 16, 10, 0, 0);

function world(files: Record<string, string>, options: { informOnly?: boolean; noJournal?: boolean } = {}) {
  const root = scratchBase("hook-core");
  for (const [path, text] of Object.entries({ "home/": "", "project/.git/": "", "other/.git/": "", ...files })) {
    mkdirSync(join(root, path, path.endsWith("/") ? "" : ".."), { recursive: true });
    if (!path.endsWith("/")) writeFileSync(join(root, path), text);
  }
  const journal = join(root, options.noJournal ? "missing" : "journal");
  const ctx: HookContext = { env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: join(root, "project"), informOnly: options.informOnly ?? false };
  return { root, journal, ctx, project: join(root, "project") };
}

const PDFKIT = note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful" });
const CHALK = note({ id: "pkg:npm/chalk", verdict: "colours" });

test("recallFor: the stopped installs are those with an exact avoid note; the folder is the input's, else the process's", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--chalk.md": CHALK, "journal/notes/pypi--jspdf.md": note({ id: "pkg:pypi/jspdf", verdict: "avoid: wrong" }) });
  const r = recallFor("npm i chalk pdfkit@2 jspdf left-pad", join(w.root, "other"), w.ctx)!;
  assert.deepEqual(r.stopped.map((i) => i.name), ["pdfkit"]); // jspdf matches by name only
  assert.deepEqual(r.avoid.map((m) => m.query), ["pdfkit"]);
  assert.deepEqual(r.matches.map((m) => m.query), ["chalk", "pdfkit", "jspdf"]);
  assert.equal(r.cwd, join(w.root, "other"));
  assert.equal(recallFor("npm i chalk", null, w.ctx)!.cwd, w.project);
  assert.equal(recallFor("npm test", null, w.ctx), null);
  assert.equal(recallFor("npm i left-pad", null, w.ctx), null);
});

test("recallFor with --inform-only stops nothing", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT }, { informOnly: true });
  const r = recallFor("npm i pdfkit", null, w.ctx)!;
  assert.deepEqual([r.avoid, r.stopped], [[], []]);
  assert.equal(retryAnswer(r, "codex", w.ctx, T0), "inform");
  assert.equal(readFileSafe(retryFile(w.journal)), null);
});

test("retryAnswer: deny the first try; the same install in another form passes until 10 minutes after the deny", () => {
  const w = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/notes/npm--chalk.md": CHALK });
  const answer = (command: string, at: number, agent = "codex", folder = w.project) => retryAnswer(recallFor(command, folder, w.ctx)!, agent, w.ctx, at);
  assert.equal(answer("npm install pdfkit", T0), "deny");
  for (const [i, command] of ["npm.cmd install pdfkit", "& npm install pdfkit --no-fund", "npm.ps1 i pdfkit@1.2.0", "npm i pdfkit chalk", "pnpm add pdfkit"].entries()) {
    assert.equal(answer(command, T0 + i + 1), "pass", command); // the same stopped install: pdfkit from npm
  }
  assert.equal(answer("npm install pdfkit", T0 + 1, "cursor"), "deny"); // another agent
  assert.equal(answer("npm install pdfkit", T0 + 1, "codex", join(w.root, "other")), "deny"); // another folder
  assert.equal(answer("npm install pdfkit", T0 + RETRY_WINDOW), "deny"); // the window is over
  assert.equal(answer("npm install chalk", T0), "inform"); // no avoid note: never denied
});

test("retryAnswer informs when the record can't be kept: no personal journal, or an unwritable .cache", () => {
  const noJournal = world({ "project/.magpie/notes/npm--pdfkit.md": PDFKIT }, { noJournal: true });
  const r = recallFor("npm i pdfkit", null, noJournal.ctx)!;
  assert.equal(r.avoid.length, 1); // the project journal says to avoid it
  assert.equal(retryAnswer(r, "codex", noJournal.ctx, T0), "inform");
  assert.equal(retryAnswer(r, "codex", noJournal.ctx, T0 + 1), "inform");

  const blocked = world({ "journal/notes/npm--pdfkit.md": PDFKIT, "journal/.cache": "a file" });
  assert.equal(retryAnswer(recallFor("npm i pdfkit", null, blocked.ctx)!, "codex", blocked.ctx, T0), "inform");
});

test("parseInput: JSON with or without a byte-order mark; undefined for anything else", () => {
  assert.deepEqual(parseInput(`${String.fromCharCode(0xfeff)}{"a":1}`), { a: 1 });
  assert.deepEqual(parseInput('{"a":1}'), { a: 1 });
  assert.equal(parseInput(""), undefined);
  assert.equal(parseInput("{"), undefined);
});

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
