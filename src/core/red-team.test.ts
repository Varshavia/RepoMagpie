import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { magpie, sandbox, type Box } from "../cli/fixtures/sandbox.ts";
import { hookOutput } from "../hook/claude-code.ts";
import { cpuTime } from "./fixtures/cpu-time.ts";
import { fetchRepository, type Fetch } from "./github.ts";
import { fileNameFor, resolveTarget } from "./identity.ts";
import { parsePyproject, readProject } from "./manifests.ts";
import { noteSignature, writeCache } from "./note-cache.ts";
import { RECALL_CACHE } from "./recall.ts";
import { renderNote, type NewNote } from "./write.ts";

// The red-team pass on feat/hardening (brief §4.5): one test per finding, named R<n> as in the
// report's table. The attacker controls a cloned repository, a GitHub repository the user adds, or
// a web page (src/server/red-team.test.ts, ui/e2e/hostile.spec.ts). Payloads are inert.

const note = (n: Partial<NewNote> & { id: string }) =>
  renderNote({ name: n.id.split("/").pop() ?? "", explored: "2026-10-04", kind: "library", tags: [], ...n });
const c = (...codes: number[]) => String.fromCodePoint(...codes);
const ESC = c(0x1b);
const HOSTILE = new RegExp(`[${c(0x00)}-${c(0x09)}${c(0x0b)}-${c(0x1f)}${c(0x7f)}-${c(0x9f)}${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2066)}-${c(0x2069)}${c(0xfeff)}]`);
const SECRET = "zqxsecretword";

function link(t: TestContext, target: string, path: string): boolean {
  try {
    symlinkSync(target, path, "file");
    return true;
  } catch (error) {
    t.skip(`can't create a file link here: ${(error as NodeJS.ErrnoException).code}`);
    return false;
  }
}
const outside = (box: Box, name: string, text: string) => {
  mkdirSync(join(box.root, "outside"), { recursive: true });
  writeFileSync(join(box.root, "outside", name), text);
  return join(box.root, "outside", name);
};

// --- Cloned repository: the project's own files ------------------------------------------------

test("R1: a README or package.json that is a link to a file elsewhere is never read by suggest; its words don't reach the agent", async (t) => {
  const box = sandbox({ "journal/notes/npm--pdf-lib.md": note({ id: "pkg:npm/pdf-lib", verdict: "pdf files" }) });
  const readme = outside(box, "id_rsa", `# Key\n\n${SECRET} pdf files\n`);
  const manifest = outside(box, "secrets.json", JSON.stringify({ description: `${SECRET} pdf`, dependencies: { [SECRET]: "*" } }));
  if (!link(t, readme, join(box.project, "README.md")) || !link(t, manifest, join(box.project, "package.json"))) return;
  const r = await magpie(box, ["suggest", "--json"]);
  assert.ok(!r.out.includes(SECRET), r.out);
  assert.match(r.err, /warning: skipped: .*README\.md is a link/);
  assert.match(r.err, /warning: skipped: .*package\.json is a link/);
});

test("R2: an unclosed TOML array of 50,000 lines is read in linear time", () => {
  const { value: read, ms } = cpuTime(() => parsePyproject(`[project]\ndependencies = [\n${'"x",\n'.repeat(50_000)}`));
  assert.ok(ms < 2000, `${ms} ms of CPU time`);
  assert.ok(read.dependencies.length > 0);
});

test("R3: a 20 MB README is not read whole: only its start, for the first heading and paragraph", () => {
  const box = sandbox({ "project/README.md": `# Invoices\n\nRender invoices as PDF.\n\n${"filler ".repeat(3_000_000)}` });
  const { value: project, ms } = cpuTime(() => readProject(box.project, box.home));
  assert.deepEqual(project.texts, ["Invoices\nRender invoices as PDF."]);
  assert.ok(ms < 1000, `${ms} ms of CPU time`);
});

// --- Cloned repository: a project journal's files and caches ---------------------------------

test("R5: a cache crafted to match the notes on disk can't point recall or search at a file outside the journal", async () => {
  const box = sandbox({ "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "colours" }) });
  outside(box, "secret.md", note({ id: "pkg:npm/chalk", verdict: SECRET }));
  const { signature } = noteSignature(box.journal);
  const forged = { file: "../../outside/secret.md", id: "pkg:npm/chalk", name: "chalk", keys: [["npm", "chalk"]], verdict: SECRET, avoidWhen: [], useWhen: [], drafts: [], status: "reviewed", alternatives: [] };
  writeCache(box.journal, RECALL_CACHE, 2, signature, [forged]);
  const json = await magpie(box, ["recall", "chalk", "--json"]);
  assert.ok(!json.out.includes(SECRET) && !json.out.includes("outside"), json.out);
  const full = await magpie(box, ["recall", "chalk", "--full"], { env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  assert.ok(!full.out.includes(SECRET));

  await magpie(box, ["search", "chalk", "--json"]); // builds the search cache
  const cache = join(box.journal, ".cache", "search-index.json");
  const index = JSON.parse(readFileSync(cache, "utf8")); // the signature stays; only the stored file changes
  for (const fields of Object.values(index.data.storedFields) as { file: string }[]) fields.file = "../../outside/secret.md";
  writeFileSync(cache, JSON.stringify(index));
  const search = JSON.parse((await magpie(box, ["search", "chalk", "--json"])).out);
  for (const result of search.results) assert.ok(!result.path.includes("outside"), result.path);
});

test("R13: a note file name with an escape sequence (allowed on Linux) reaches no output", { skip: process.platform === "win32" && "Windows doesn't allow these characters in file names" }, async () => {
  const box = sandbox({ [`journal/notes/npm--chalk${ESC}]52;c;ZWNobw==${c(0x07)}.md`]: note({ id: "pkg:npm/chalk", verdict: "colours" }) });
  for (const argv of [["recall", "chalk"], ["recall", "chalk", "--json"], ["search", "chalk"], ["search", "chalk", "--json"]]) {
    const r = await magpie(box, argv, { env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
    assert.doesNotMatch(r.out.replace(/\n/g, ""), HOSTILE, argv.join(" "));
  }
});

// --- The hook ------------------------------------------------------------------------------------

test("R4: a 1 MB install command of 70,000 packages is answered in bounded time; the hook says what it didn't check", () => {
  const box = sandbox({ "journal/notes/npm--chalk.md": note({ id: "pkg:npm/chalk", verdict: "avoid: colours" }) });
  const names = Array.from({ length: 70_000 }, (_, i) => `pkg${i}`);
  const command = `npm install ${names.join(" ")} chalk`;
  assert.ok(command.length > 500_000);
  const { value: out, ms } = cpuTime(() => hookOutput(JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: box.project }), { env: { MAGPIE_HOME: box.journal }, home: box.home, cwd: box.project, informOnly: false }));
  assert.ok(ms < 3000, `${ms} ms of CPU time`);
  const context: string = JSON.parse(out ?? "{}").hookSpecificOutput.additionalContext;
  assert.match(context, /RepoMagpie: this command installs 70,001 packages; only the first 100 were looked up in your journals\./);
});

test("R10: a project-journal alternative with Cyrillic look-alike letters is flagged in the hook and in recall's card", async () => {
  const pupp = `${c(0x0440)}uppeteer`; // Cyrillic er, then "uppeteer": looks like puppeteer
  const pdfkit = note({ id: "pkg:npm/pdfkit", verdict: "avoid: async streams painful" }).replace("\nstatus:", `\nalternatives: ["[[${pupp}]]", "[[pdf kit]]"]\nstatus:`);
  const box = sandbox({ "project/.magpie/notes/npm--pdfkit.md": pdfkit });
  const out = JSON.parse(hookOutput(JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm i pdfkit" }, cwd: box.project }), { env: { MAGPIE_HOME: box.journal }, home: box.home, cwd: box.project, informOnly: false }) ?? "{}");
  assert.match(out.hookSpecificOutput.additionalContext, new RegExp(`"${pupp}" \\(no note; its name has non-ASCII letters, which can look like others\\)`));
  assert.match(out.hookSpecificOutput.additionalContext, /"pdf kit" \(no note; its name isn't a valid package name\)/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /non-ASCII letters/);
  const card = await magpie(box, ["recall", "pdfkit", "--type", "npm"], { env: { MAGPIE_HOME: box.journal, NO_COLOR: "1" } });
  assert.match(card.out, new RegExp(`${pupp} \\(non-ASCII letters\\)`));
});

// --- An added GitHub repository ------------------------------------------------------------------

test("R9: no GitHub error path echoes GITHUB_TOKEN or a request header", async () => {
  const token = "ghp_exampleinvalidtoken0000000000000000";
  const answers: (() => Response | never)[] = [
    () => { throw Object.assign(new TypeError(`fetch failed for Authorization: Bearer ${token}`), { cause: { code: "ECONNRESET", headers: { authorization: token } } }); },
    () => new Response(`{"message": "Bad credentials ${token}"}`, { status: 401 }),
    () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
    () => new Response(`echo ${token}`, { status: 500 }),
    () => new Response("", { status: 404 }),
  ];
  for (const answer of answers) {
    const fetch = (async () => answer()) as unknown as Fetch;
    const r = await fetchRepository("pkg:github/acme/widget", { fetch, token });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(!r.problem.message.includes(token) && !/authorization/i.test(r.problem.message), r.problem.message);
  }
});

// --- Windows names -------------------------------------------------------------------------------

test("R12: reserved Windows names never become a note's file name, nor one ending in a dot or a space", () => {
  const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;
  for (const target of ["pkg:npm/con", "pkg:npm/nul", "pkg:pypi/aux", "pkg:cargo/com1", "pkg:github/con/lpt1", "pkg:github/owner/repo.", "pkg:npm/nul."]) {
    const file = fileNameFor(target);
    assert.doesNotMatch(file, reserved, file); // every file name starts with its type: npm--, github--
    assert.ok(file.endsWith(".md"), file); // so it never ends in a dot or a space
  }
  assert.equal(resolveTarget("a ", { type: "npm" }).kind, "ok"); // trailing space trimmed, not kept
});

// --- import, hostile input -----------------------------------------------------------------------

test("R14: an import list with escape sequences and bidi characters prints nothing hostile", async () => {
  const box = sandbox();
  const list = join(box.root, "list.md");
  writeFileSync(list, `- pkg:npm/chalk — verdict: fine ${ESC}]52;c;ZWNobw==${c(0x07)}\n- ${ESC}[2Jpkg:npm/${c(0x202e)}evil\n- not a target ${ESC}[31m\n`);
  for (const argv of [["import", list], ["import", list, "--json"], ["import", list, "--dry-run"]]) {
    const r = await magpie(box, argv);
    assert.doesNotMatch((r.out + r.err).replace(/\n/g, ""), HOSTILE, argv.join(" "));
  }
});
