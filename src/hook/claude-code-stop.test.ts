import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchBase } from "../core/fixtures/scratch.ts";
import { renderNote } from "../core/write.ts";
import { reminderFile, stopOutput } from "./claude-code-stop.ts";
import { bash, prompt, result, say, TRANSCRIPTS } from "./fixtures/stop-transcripts.ts";

// The opt-in Stop reminder (decision 0042), on fixture transcripts and journals in scratch folders.

function world(notes: Record<string, string> = {}) {
  const root = scratchBase("stop");
  const journal = join(root, "journal");
  mkdirSync(join(journal, "notes"), { recursive: true });
  mkdirSync(join(root, "project", ".git"), { recursive: true });
  mkdirSync(join(root, "home"), { recursive: true });
  for (const [file, text] of Object.entries(notes)) writeFileSync(join(journal, "notes", file), text);
  let count = 0;
  return {
    root,
    journal,
    transcript: (text: string) => {
      const path = join(root, `transcript-${++count}.jsonl`);
      writeFileSync(path, text);
      return path;
    },
    run: (fields: Record<string, unknown>) => {
      const input = JSON.stringify({ session_id: "session-1", cwd: join(root, "project"), permission_mode: "default", hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Done.", ...fields });
      const out = stopOutput(input, { env: { MAGPIE_HOME: journal }, home: join(root, "home"), cwd: root, informOnly: false });
      return out === null ? null : JSON.parse(out);
    },
  };
}

const MOMENT = renderNote({ name: "moment", id: "pkg:npm/moment", explored: "2026-10-04", kind: "library", tags: [], verdict: "avoid: too big" });
const context = (out: { hookSpecificOutput: { hookEventName: string; additionalContext: string } } | null) => {
  assert.ok(out, "a reminder");
  assert.equal(out.hookSpecificOutput.hookEventName, "Stop");
  return out.hookSpecificOutput.additionalContext;
};

test("an install and a removal with no note: one reminder that continues the turn as feedback, never a block", () => {
  const w = world();
  const out = w.run({ transcript_path: w.transcript(TRANSCRIPTS.replaced) });
  assert.deepEqual(Object.keys(out), ["hookSpecificOutput"], "no decision: block, no systemMessage");
  assert.equal(context(out),
    "RepoMagpie: this session installed or removed date-fns, moment, with no note in the user's journals. " +
    "If the user chose, replaced or dropped one of them for a reason in this task, make the RepoMagpie skill's \"After a dependency decision\" offer now: once, in the user's language, and never write the Verdict yourself. " +
    "If it was routine, or the user already answered or asked not to be asked, or no user is there to answer, say nothing about it. RepoMagpie reminds you once per session.");
});

test("once per session: the second stop of the same session says nothing; another session is reminded; the record holds hashes only", () => {
  const w = world();
  const path = w.transcript(TRANSCRIPTS.replaced);
  assert.ok(w.run({ transcript_path: path }));
  assert.equal(w.run({ transcript_path: path }), null);
  assert.ok(w.run({ transcript_path: path, session_id: "session-2" }));
  const record = readFileSync(reminderFile(w.journal), "utf8");
  assert.ok(!record.includes("session-") && !record.includes("moment"), record);
  assert.equal(Object.keys(JSON.parse(record).entries).length, 2);
});

test("never when stop_hook_active is set, or for another event", () => {
  const w = world();
  const path = w.transcript(TRANSCRIPTS.replaced);
  assert.equal(w.run({ transcript_path: path, stop_hook_active: true }), null);
  assert.equal(w.run({ transcript_path: path, hook_event_name: "SubagentStop" }), null);
  assert.ok(w.run({ transcript_path: path }), "and still once after them: they recorded nothing");
});

test("nothing when the agent already offered, saved a note, or mentions RepoMagpie in its last message", () => {
  const w = world();
  assert.equal(w.run({ transcript_path: w.transcript(TRANSCRIPTS.offered) }), null);
  assert.equal(w.run({ transcript_path: w.transcript(TRANSCRIPTS.noted), session_id: "s-noted" }), null);
  const cli = `${prompt("swap")}\n${bash("t1", "npm i date-fns")}\n${result("t1", "ok")}\n${bash("t2", "repomagpie note date-fns \"lighter\" --json")}\n`;
  assert.equal(w.run({ transcript_path: w.transcript(cli), session_id: "s-cli" }), null);
  // The transcript can lag behind the turn: the last message counts too.
  assert.equal(w.run({ transcript_path: w.transcript(TRANSCRIPTS.replaced), session_id: "s-last", last_assistant_message: "Save that to your RepoMagpie journal?" }), null);
});

test("an install after the offer is reminded: only the changes since the agent last offered count", () => {
  const w = world();
  const text = `${TRANSCRIPTS.offered}${prompt("now add lodash")}\n${bash("t9", "npm install lodash")}\n${result("t9", "ok")}\n`;
  assert.match(context(w.run({ transcript_path: w.transcript(text) })), /installed lodash,/);
});

test("nothing for a routine npm ci, a failed install, or packages that already have a note", () => {
  const w = world({ "npm--moment.md": MOMENT });
  assert.equal(w.run({ transcript_path: w.transcript(TRANSCRIPTS.routine) }), null);
  assert.equal(w.run({ transcript_path: w.transcript(TRANSCRIPTS.failed) }), null);
  const removed = `${prompt("drop moment")}\n${bash("t1", "npm uninstall moment")}\n${result("t1", "ok")}\n`;
  assert.equal(w.run({ transcript_path: w.transcript(removed) }), null);
  // date-fns has no note: named alone.
  assert.match(context(w.run({ transcript_path: w.transcript(TRANSCRIPTS.replaced) })), /this session installed date-fns,/);
});

test("fails open: an unreadable, missing, relative or non-JSONL transcript, bad input, or no journal means no answer", () => {
  const w = world();
  assert.equal(w.run({ transcript_path: join(w.root, "missing.jsonl") }), null);
  assert.equal(w.run({ transcript_path: "transcript.jsonl" }), null);
  assert.equal(w.run({ transcript_path: join(w.root, "journal") }), null, "a folder");
  const txt = join(w.root, "notes.txt");
  writeFileSync(txt, TRANSCRIPTS.replaced);
  assert.equal(w.run({ transcript_path: txt }), null);
  assert.equal(w.run({ transcript_path: w.transcript("not json\n{\"broken\": \n") }), null);
  assert.equal(stopOutput("not json", { env: {}, home: w.root, cwd: w.root, informOnly: false }), null);
  assert.equal(w.run({ transcript_path: w.transcript(TRANSCRIPTS.replaced), session_id: 42 }), null);
  const none = stopOutput(JSON.stringify({ session_id: "s", hook_event_name: "Stop", transcript_path: w.transcript(TRANSCRIPTS.replaced) }),
    { env: { MAGPIE_HOME: join(w.root, "no-journal") }, home: join(w.root, "home"), cwd: w.root, informOnly: false });
  assert.equal(none, null, "no journal to record the session in: never a reminder at every stop");
});

test("a huge transcript: only its last 32 MB are read, from a whole line, and an install there is found", () => {
  const w = world();
  const filler = say("x".repeat(1_000_000));
  const lines = Array.from({ length: 34 }, () => filler);
  const text = `${bash("t0", "npm install early-package")}\n${lines.join("\n")}\n${bash("t1", "npm install late-package")}\n${result("t1", "ok")}\n`;
  const ctx = context(w.run({ transcript_path: w.transcript(text) }));
  assert.match(ctx, /installed late-package,/);
  assert.doesNotMatch(ctx, /early-package/);
});

test("red team: text in the transcript is never echoed; only package names parsed from the commands are", () => {
  const w = world();
  const ctx = context(w.run({ transcript_path: w.transcript(TRANSCRIPTS.hostile) }));
  assert.match(ctx, /installed tiny-parser,/);
  for (const bad of ["Ignore", "curl", "evil", "</system>", "delete every note", "rm -rf"]) assert.ok(!ctx.includes(bad), bad);
});

test("Cursor's input, which runs Claude Code's hooks too, gets no answer", () => {
  const w = world();
  assert.equal(w.run({ transcript_path: w.transcript(TRANSCRIPTS.replaced), cursor_version: "2.0" }), null);
});
