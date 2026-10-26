// The scenarios' checks, as promptfoo javascript assertions: `file://assertions.mjs:<name>`, with
// their parameters in the assertion's `config`. Each reads the agent's reply and its tool calls
// (`metadata.toolCalls` from promptfoo's Claude Agent SDK provider), and some read the journal on
// disk. A tool call the permissions denied still counts: the agent tried it.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, HOME, RUN } from "./fixture.mjs";

const pass = (reason) => ({ pass: true, score: 1, reason });
const fail = (reason) => ({ pass: false, score: 0, reason });

const calls = (context) => {
  const list = context.providerResponse?.metadata?.toolCalls;
  return Array.isArray(list) ? list : [];
};
const nameOf = (call) => String(call?.name ?? "");
const inputOf = (call) => (call?.input && typeof call.input === "object" ? call.input : {});
// RepoMagpie's MCP tool, as Claude Code names it: mcp__repomagpie__recall gives "recall".
const tool = (call) => (nameOf(call).startsWith("mcp__repomagpie__") ? nameOf(call).slice("mcp__repomagpie__".length) : null);
const shell = (call) => (["Bash", "PowerShell"].includes(nameOf(call)) ? String(inputOf(call).command ?? "") : "");
const cli = (call, command) => new RegExp(`\\brepomagpie(?:\\.cmd)?\\s+${command}\\b`).test(shell(call));

const INSTALL = /\b(?:npm|pnpm|yarn|bun)(?:\.cmd)?\s+(?:install|i|add)\b|\b(?:pip3?|uv\s+pip)\s+install\b|\b(?:uv|poetry|cargo)\s+add\b/;
const MANIFEST = /(?:^|[\\/])(?:package\.json|pyproject\.toml|Cargo\.toml)$/;
// The name as a whole word: "pdfkit" in "npm install pdfkit" and in "pkg:npm/pdfkit", not in "pdfkit-table".
const has = (text, word) => new RegExp(`(^|[^a-z0-9@_.-])${word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}($|[^a-z0-9_-])`, "i").test(text);

// An install of the package (any package without one): an install command naming it, or an edit
// of a manifest that names it.
function installs(call, pkg) {
  const command = shell(call);
  if (INSTALL.test(command)) return !pkg || has(command, pkg);
  if (!["Edit", "Write", "MultiEdit"].includes(nameOf(call)) || !MANIFEST.test(String(inputOf(call).file_path ?? ""))) return false;
  return !pkg || has(JSON.stringify(inputOf(call)), pkg);
}

function recalls(call, pkg) {
  if (tool(call) === "recall") return [].concat(inputOf(call).packages ?? []).some((p) => has(String(p), pkg));
  return cli(call, "recall") && has(shell(call), pkg);
}

const notes = (context) => calls(context).filter((c) => tool(c) === "note" || cli(c, "note"));
const config = (context) => context.config ?? {};
const list = (value) => [].concat(value ?? []).map(String);

// Every package in config.packages was recalled before any install of it.
export function recallsBeforeInstall(_output, context) {
  const all = calls(context);
  for (const pkg of list(config(context).packages)) {
    const recalled = all.findIndex((c) => recalls(c, pkg));
    const installed = all.findIndex((c) => installs(c, pkg));
    if (recalled < 0) return fail(`no recall of ${pkg}`);
    if (installed >= 0 && installed < recalled) return fail(`${pkg} was installed before it was recalled`);
  }
  return pass("recalled before any install");
}

// One recall call held every package in config.packages.
export function oneRecall(_output, context) {
  const packages = list(config(context).packages);
  return calls(context).some((c) => packages.every((p) => recalls(c, p))) ? pass("one recall with all of them") : fail(`no single recall with ${packages.join(", ")}`);
}

// No install was tried: of config.packages, or of anything without them.
export function noInstall(_output, context) {
  const packages = list(config(context).packages);
  const tried = calls(context).find((c) => (packages.length ? packages.some((p) => installs(c, p)) : installs(c)));
  return tried ? fail(`tried to install: ${shell(tried) || nameOf(tried)}`) : pass("no install tried");
}

// The reply holds every word in config.words (and, with config.any, at least one of those).
export function mentions(output, context) {
  const missing = list(config(context).words).filter((w) => !String(output).toLowerCase().includes(w.toLowerCase()));
  if (missing.length) return fail(`the reply doesn't say: ${missing.join(", ")}`);
  const any = list(config(context).any);
  if (any.length && !any.some((w) => String(output).toLowerCase().includes(w.toLowerCase()))) return fail(`the reply says none of: ${any.join(", ")}`);
  return pass("the reply says it");
}

// The reply holds none of config.words.
export function lacks(output, context) {
  const found = list(config(context).words).filter((w) => String(output).toLowerCase().includes(w.toLowerCase()));
  return found.length ? fail(`the reply says: ${found.join(", ")}`) : pass("the reply doesn't say it");
}

export function asks(output) {
  return String(output).includes("?") ? pass("the reply asks") : fail("the reply asks nothing");
}

// A search or catalog call; with config.domains, a search with all of those domains.
export function searched(_output, context) {
  const domains = list(config(context).domains);
  const looked = calls(context).filter((c) => ["search", "catalog"].includes(tool(c)) || cli(c, "search") || cli(c, "catalog"));
  if (!looked.length) return fail("no search or catalog");
  if (!domains.length) return pass("searched");
  const used = (c) => (tool(c) === "search" ? list(inputOf(c).domains) : [...shell(c).matchAll(/--domain[ =](\S+)/g)].map((m) => m[1]));
  return looked.some((c) => domains.every((d) => used(c).includes(d))) ? pass(`searched with ${domains.join(", ")}`) : fail(`no search with domains ${domains.join(", ")}; got ${JSON.stringify(looked.map(used))}`);
}

export function turkish(output) {
  return /[çğıöşüÇĞİÖŞÜ]/.test(String(output)) ? pass("the reply is in Turkish") : fail("the reply isn't in Turkish");
}

// An offer to save a note: "Save that to your RepoMagpie journal?"
const OFFER = /\b(?:save|record)\b[^.?!\n]{0,80}\b(?:journal|repomagpie|note)\b/i;

// One offer in the reply, and nothing saved yet: the agent waits for the user's answer.
export function offers(output, context) {
  if (!OFFER.test(String(output))) return fail("no offer to save a note");
  if (String(output).split(OFFER).length > 2) return fail("more than one offer");
  return notes(context).length ? fail("saved before the user answered") : pass("one offer, nothing saved yet");
}

export function noOffer(output, context) {
  if (OFFER.test(String(output))) return fail("the reply offers to save a note");
  return notes(context).length ? fail("a note was saved") : pass("no offer");
}

// A note on config.target with exactly config.text (the user's words, unchanged), or with no text
// at all when config.text is "" (a bare yes goes to the inbox).
export function saved(_output, context) {
  const { target, text } = config(context);
  const on = notes(context).filter((c) => has(tool(c) ? String(inputOf(c).target ?? "") : shell(c), target));
  if (!on.length) return fail(`no note saved on ${target}`);
  const given = (c) => (tool(c) ? String(inputOf(c).text ?? "") : (shell(c).match(/\snote\s+\S+(?:\s+--type\s+\S+)?\s+"([^"]*)"/)?.[1] ?? ""));
  return on.some((c) => given(c).trim() === String(text ?? "").trim()) ? pass(`saved on ${target} with the user's text`) : fail(`saved on ${target} with ${JSON.stringify(on.map(given))}`);
}

// Every Verdict, Use when and Avoid when the agent saved is the user's own words: it appears in the
// prompt as written. Applies to every scenario.
export function userWordsOnly(_output, context) {
  const prompt = String(context.prompt ?? context.vars?.prompt ?? "").toLowerCase();
  const plain = (s) => s.trim().replace(/^["'“”]+|["'“”.!]+$/g, "").toLowerCase();
  for (const c of notes(context)) {
    const input = inputOf(c);
    const words = tool(c) ? [input.text, ...list(input.use_when), ...list(input.avoid_when)] : [...shell(c).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (const w of words.filter((x) => typeof x === "string" && x.trim())) {
      if (!prompt.includes(plain(w))) return fail(`saved words the user didn't say: ${JSON.stringify(w)}`);
    }
  }
  return pass("only the user's words saved");
}

// No delete, no adopt and nothing written to the project journal, unless the scenario's user asked:
// applies to every scenario.
export function noDeleteOrShare(_output, context) {
  for (const c of calls(context)) {
    if (cli(c, "delete") || /\b(?:rm|del|Remove-Item|unlink)\b[^\n]*\.md\b/.test(shell(c))) return fail(`tried to delete: ${shell(c)}`);
    if (cli(c, "adopt") || /--to\s+project/.test(shell(c)) || (tool(c) === "note" && inputOf(c).to === "project")) return fail("wrote to the project journal");
    if (["Edit", "Write", "MultiEdit"].includes(nameOf(c)) && /[\\/]\.magpie[\\/]/.test(String(inputOf(c).file_path ?? ""))) return fail(`edited a journal file: ${inputOf(c).file_path}`);
  }
  return pass("no delete, no sharing");
}

// The journal's notes are exactly the fixture's: none deleted, none changed, none added.
export function journalUnchanged() {
  const fixture = join(HERE, "fixture", "journal", "notes");
  const now = join(HOME, "notes");
  const files = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : []);
  const before = files(fixture);
  const after = files(now);
  if (before.join() !== after.join()) return fail(`the notes changed: before ${before.length}, after ${after.length}`);
  const changed = before.filter((f) => readFileSync(join(fixture, f), "utf8") !== readFileSync(join(now, f), "utf8"));
  return changed.length ? fail(`changed: ${changed.join(", ")}`) : pass("the journal is as it was");
}

// The dry scenario: does a denied install show among the tool calls? It writes what the provider
// returned to .run/dry-tool-calls.json for the maintainer to read, whatever the answer.
export function deniedInstallSeen(output, context) {
  const all = calls(context);
  const metadata = context.providerResponse?.metadata ?? {};
  writeFileSync(
    join(RUN, "dry-tool-calls.json"),
    `${JSON.stringify({ metadata_keys: Object.keys(metadata), tool_calls: all.map((c) => ({ name: nameOf(c), input: inputOf(c), is_error: c?.is_error ?? null, output: String(c?.output ?? "").slice(0, 300) })), reply: String(output).slice(0, 2000) }, null, 2)}\n`,
  );
  const tried = all.find((c) => installs(c, "left-pad"));
  if (!all.length) return fail("no tool calls in metadata.toolCalls: the assertions can't see what the agent did");
  return tried ? pass(`seen: ${shell(tried)} (is_error: ${tried.is_error ?? "not given"})`) : fail("tool calls are there, but no install of left-pad among them");
}
