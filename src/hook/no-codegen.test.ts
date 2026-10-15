import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sandbox } from "../cli/fixtures/sandbox.ts";
import { renderNote } from "../core/write.ts";

// setup writes the user's hook entry as node --disallow-code-generation-from-strings … hook
// claude-code (decision 0035): the hook must answer the same with code generation off, also on a
// cold cache, where it reads and parses every note.

const MAIN = fileURLToPath(new URL("../cli/main.ts", import.meta.url));

test("the hook answers exactly the same with code generation from strings disallowed, cold and warm", () => {
  const notes = (folder: string) => ({
    [`${folder}/notes/npm--pdfkit.md`]: renderNote({ id: "pkg:npm/pdfkit", name: "pdfkit", explored: "2026-10-14", kind: "library", tags: ["pdf"], verdict: "avoid: async streams painful; use puppeteer", avoidWhen: ["you need streams"] })
      .replace("\nstatus:", '\nalternatives: ["[[puppeteer]]"]\nstatus:'),
    [`${folder}/notes/npm--puppeteer.md`]: renderNote({ id: "pkg:npm/puppeteer", name: "puppeteer", explored: "2026-10-14", kind: "library", tags: ["pdf"], verdict: "default for PDF rendering" }),
  });
  const run = (box: ReturnType<typeof sandbox>, flags: string[], command: string) => spawnSync(process.execPath, [...flags, MAIN, "hook", "claude-code"], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd: box.project }),
    env: { ...process.env, MAGPIE_HOME: box.journal, HOME: box.home, USERPROFILE: box.home }, cwd: box.project, encoding: "utf8",
  });
  const plain = sandbox(notes("journal"));
  const strict = sandbox(notes("journal"));
  for (const command of ["npm install pdfkit puppeteer", "npm install puppeteer", "npm test"]) {
    for (const pass of ["cold", "warm"]) {
      const expected = run(plain, [], command);
      const actual = run(strict, ["--disallow-code-generation-from-strings"], command);
      assert.equal(actual.status, 0, actual.stderr);
      // Paths appear JSON-escaped in the hook's output.
      const neutral = (out: string, root: string) => out.split(JSON.stringify(root).slice(1, -1)).join("<root>");
      assert.equal(neutral(actual.stdout, strict.root), neutral(expected.stdout, plain.root), `${command} (${pass})`);
      if (command !== "npm test") assert.match(actual.stdout, /RepoMagpie:/);
    }
  }
  // The hook fails open, so a throw would print nothing: its log must be empty too.
  assert.equal(spawnSync(process.execPath, ["-e", `process.stdout.write(String(require("fs").existsSync(${JSON.stringify(join(strict.journal, ".cache", "hook-errors.log"))})))`], { encoding: "utf8" }).stdout, "false");
});
