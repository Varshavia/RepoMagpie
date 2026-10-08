import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { run } from "./program.ts";

// The agent skill (skills/repomagpie/) is checked against the Agent Skills format (agentskills.io/specification,
// checked 2026-10-06), against `magpie --help`, and against the --json shapes in docs/spec.md.

const repo = fileURLToPath(new URL("../../", import.meta.url));
const skillDir = join(repo, "skills", "repomagpie");
const skillFile = join(skillDir, "SKILL.md");

function skillFiles(): string[] {
  const refs = join(skillDir, "references");
  const extra = existsSync(refs) ? readdirSync(refs).filter((f) => f.endsWith(".md")).map((f) => join(refs, f)) : [];
  return [skillFile, ...extra];
}

function frontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  assert.ok(m, "SKILL.md must start with YAML frontmatter between --- lines");
  const data = parseYaml(m[1]);
  assert.equal(typeof data, "object");
  return { data, body: text.slice(m[0].length) };
}

const withoutFences = (text: string) => text.replace(/^```[\s\S]*?^```/gm, "");
const codeSpans = (text: string) => [...withoutFences(text).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

// --- Frontmatter -------------------------------------------------------------------------------

test("SKILL.md frontmatter follows the Agent Skills format", () => {
  const { data, body } = frontmatter(readFileSync(skillFile, "utf8"));
  const allowed = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];
  for (const key of Object.keys(data)) assert.ok(allowed.includes(key), `unknown frontmatter field: ${key}`);

  const { name, description, compatibility, license, metadata } = data;
  assert.equal(typeof name, "string");
  assert.ok((name as string).length >= 1 && (name as string).length <= 64, "name: 1-64 characters");
  assert.match(name as string, /^[a-z0-9]+(-[a-z0-9]+)*$/, "name: lowercase letters, digits and single hyphens, not at either end");
  assert.equal(name, basename(skillDir), "name must match the skill's folder");

  assert.equal(typeof description, "string");
  assert.ok((description as string).trim().length >= 1 && (description as string).length <= 1024, "description: 1-1024 characters");

  if (compatibility !== undefined) {
    assert.equal(typeof compatibility, "string");
    assert.ok((compatibility as string).length >= 1 && (compatibility as string).length <= 500, "compatibility: 1-500 characters");
  }
  if (license !== undefined) assert.equal(typeof license, "string");
  if (metadata !== undefined) {
    assert.ok(metadata && typeof metadata === "object" && !Array.isArray(metadata), "metadata: a map");
    for (const value of Object.values(metadata)) assert.equal(typeof value, "string", "metadata values are strings");
  }

  assert.ok(body.trim().length > 0, "SKILL.md needs instructions after the frontmatter");
  assert.ok(body.split("\n").length < 500, "keep SKILL.md under 500 lines");
});

test("the skill's links stay inside the skill folder, one level deep, and exist", () => {
  for (const file of skillFiles()) {
    for (const m of withoutFences(readFileSync(file, "utf8")).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split("#")[0];
      if (/^[a-z]+:/i.test(target) || target === "") continue;
      const abs = resolve(join(file, ".."), target);
      const rel = relative(skillDir, abs);
      assert.ok(!rel.startsWith("..") && !rel.includes(":"), `${basename(file)} links outside the skill: ${m[1]}`);
      assert.ok(rel.split(/[\\/]/).length <= 2, `${basename(file)} links deeper than one level: ${m[1]}`);
      assert.ok(existsSync(abs), `${basename(file)} links to a missing file: ${m[1]}`);
    }
  }
});

// --- Commands and flags ------------------------------------------------------------------------

async function help(path: string[]): Promise<string> {
  let out = "";
  const code = await run([...path, "--help"], {
    out: (s) => { out += s; },
    err: () => {},
    env: {},
    cwd: "/nonexistent",
    home: "/nonexistent",
    fetch: () => Promise.reject(new Error("no network in tests")),
    today: () => "2026-10-06",
    interactive: false,
    ask: () => Promise.reject(new Error("no prompt in tests")),
  });
  assert.equal(code, 0, `magpie ${path.join(" ")} --help`);
  return out;
}

const subcommands = (text: string) => {
  const section = text.split(/^Commands:$/m)[1] ?? "";
  return [...section.matchAll(/^ {2}([a-z][a-z-]*)/gm)].map((m) => m[1]).filter((c) => c !== "help");
};
// Each option line: its flag, and its choices when it has any.
const options = (text: string) => {
  const section = (text.split(/^Options:$/m)[1] ?? "").split(/^\S/m)[0];
  const found = new Map<string, string[] | null>();
  const lines = section.split("\n");
  lines.forEach((line, i) => {
    const m = /^ {2}(?:-\w, )?(--[a-z][a-z-]*)/.exec(line);
    if (!m) return;
    let text = line;
    for (let j = i + 1; j < lines.length && !/^ {2}-/.test(lines[j]); j++) text += " " + lines[j].trim();
    const choices = /\(choices: ([^)]*?)(?:, default:[^)]*)?\)/.exec(text);
    found.set(m[1], choices ? [...choices[1].matchAll(/"([^"]+)"/g)].map((c) => c[1]) : null);
  });
  return found;
};

// Every way the skill writes a magpie command: inline code, or a line in a code block.
function usages(): { file: string; usage: string }[] {
  const found: { file: string; usage: string }[] = [];
  for (const file of skillFiles()) {
    const text = readFileSync(file, "utf8");
    for (const span of codeSpans(text)) if (/^magpie(\s|$)/.test(span)) found.push({ file, usage: span });
    for (const block of text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)) {
      for (const line of block[1].split("\n")) {
        const m = /^\s*(?:\$\s+)?(magpie(\s.*)?)$/.exec(line);
        if (m) found.push({ file, usage: m[1].replace(/\s+#.*$/, "") });
      }
    }
  }
  return found;
}

const tokens = (usage: string) =>
  usage.replace(/"[^"]*"|'[^']*'|<[^>]*>/g, " ").split(/\s+/).map((t) => t.replace(/[[\]]/g, "")).filter(Boolean).slice(1);

test("every command and flag the skill uses is in magpie --help", async () => {
  const top = await help([]);
  const global = options(top);
  const found = usages();
  const used = new Set<string>();
  assert.ok(found.length > 0, "the skill shows no magpie commands");

  for (const { file, usage } of found) {
    const where = `${basename(file)}: \`${usage}\``;
    const words = tokens(usage);
    if (words.length === 0) continue;
    const path: string[] = [];
    let text = top;
    while (words.length && !words[0].startsWith("-") && subcommands(text).includes(words[0])) {
      path.push(words.shift()!);
      text = await help(path);
    }
    assert.ok(path.length > 0, `${where}: not a magpie command`);
    used.add(path[0]);
    const local = options(text);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word.startsWith("-")) continue;
      const flag = word.split("=")[0];
      assert.ok(flag.startsWith("--"), `${where}: write the long form of ${flag}`);
      assert.ok(local.has(flag) || global.has(flag), `${where}: magpie ${path.join(" ")} has no ${flag}`);
      const choices = local.get(flag) ?? global.get(flag);
      const value = word.includes("=") ? word.split("=")[1] : words[i + 1];
      if (choices && value && !value.startsWith("-")) {
        for (const v of value.split("|")) assert.ok(choices.includes(v), `${where}: ${flag} takes ${choices.join(", ")}, not ${v}`);
      }
    }
  }
  for (const command of ["recall", "search", "suggest", "note", "adopt"]) {
    assert.ok(used.has(command), `the skill should teach magpie ${command}`);
  }
});

// A flag written on its own (`--journal personal|project`) must belong to some magpie command.
test("every flag the skill names on its own is a magpie flag", async () => {
  const all = new Map<string, string[] | null>();
  const walk = async (path: string[]) => {
    const text = await help(path);
    for (const [flag, choices] of options(text)) all.set(flag, [...new Set([...(all.get(flag) ?? []), ...(choices ?? [])])]);
    for (const sub of subcommands(text)) await walk([...path, sub]);
  };
  await walk([]);
  for (const file of skillFiles()) {
    for (const span of codeSpans(readFileSync(file, "utf8"))) {
      const m = /^(--[a-z][a-z-]*)(?:[ =]([^\s<]+))?/.exec(span);
      if (!m) continue;
      assert.ok(all.has(m[1]), `${basename(file)}: \`${span}\`: no magpie command has ${m[1]}`);
      const choices = all.get(m[1])!;
      if (m[2] && choices.length) {
        for (const v of m[2].split("|")) assert.ok(choices.includes(v), `${basename(file)}: \`${span}\`: ${m[1]} takes ${choices.join(", ")}, not ${v}`);
      }
    }
  }
});

test("every command the skill shows passes --json", () => {
  for (const { file, usage } of usages()) {
    const words = tokens(usage);
    if (words.length === 0 || words[0] === "hook") continue;
    if (/^magpie (\S+)$/.test(usage)) continue; // a bare command name in prose, such as `magpie adopt`
    assert.ok(words.includes("--json"), `${basename(file)}: \`${usage}\` lacks --json`);
  }
});

// --- JSON fields -------------------------------------------------------------------------------

// The --json example of each command in docs/spec.md section 2, as an object. "[...]" is an
// example list, "[<a match as in recall --json>]" a list of recall matches and
// "[<alternatives as in recall --json>]" a match's alternatives; any other placeholder fails the
// parse, so this test learns about it.
function specShapes(): Map<string, unknown> {
  const spec = readFileSync(join(repo, "docs", "spec.md"), "utf8");
  const raw = new Map<string, string>();
  for (const section of spec.split(/^### /m).slice(1)) {
    const command = /^`magpie (\w+)/.exec(section)?.[1];
    const line = section.split("\n").find((l) => l.startsWith("`--json`"));
    const json = line && /`(\{[^`]*\})`/.exec(line.replace(/^`--json`/, ""))?.[1];
    if (command && json) raw.set(command, json);
  }
  const parse = (command: string, json: string) => {
    try {
      return JSON.parse(json);
    } catch (e) {
      throw new Error(`spec §2: the --json example of ${command} doesn't parse: ${(e as Error).message}`);
    }
  };
  const lists = (json: string) => json.replace(/\[\.\.\.\]/g, "[]");
  const recall = parse("recall", lists(raw.get("recall")!));
  const shapes = new Map<string, unknown>();
  for (const [command, json] of raw) {
    const text = lists(json).replace(/\[<a match as in recall --json>\]/g, JSON.stringify(recall.matches))
      .replace(/\[<alternatives as in recall --json>\]/g, JSON.stringify(recall.matches[0].alternatives));
    shapes.set(command, { ...parse(command, text), error: null }); // spec §1: a failure adds "error"
  }
  return shapes;
}

function has(shape: unknown, path: string): boolean {
  let at: unknown = shape;
  for (const part of path.split(".")) {
    const m = /^([a-z][a-z0-9_]*)(\[\])?$/.exec(part);
    if (!m || !at || typeof at !== "object" || Array.isArray(at) || !(m[1] in at)) return false;
    at = (at as Record<string, unknown>)[m[1]];
    if (m[2]) {
      if (!Array.isArray(at)) return false;
      at = at[0];
    }
  }
  return true;
}

const FIELD = /^[a-z][a-z0-9_]*(\[\])?(\.[a-z][a-z0-9_]*(\[\])?)*$/;
const NOT_FIELDS = new Set(["null", "true", "false", "magpie"]);

test("the spec's --json examples parse, for the commands the skill uses", () => {
  const shapes = specShapes();
  for (const command of ["recall", "search", "suggest", "note", "adopt"]) assert.ok(shapes.has(command), `no --json example for ${command}`);
  assert.ok(has(shapes.get("suggest"), "in_use_avoid[].avoid_when"), "suggest's in_use_avoid holds recall matches");
  assert.ok(has(shapes.get("suggest"), "candidates[].alternatives[].verdict"), "suggest's candidates hold recall's alternatives");
});

// A bare identifier in inline code (`verdict`, `matches[].avoid_when`) is a JSON field; values are
// written in JSON form ("exact", null). Under a heading that names `magpie <command> --json`,
// a field must be in that command's shape; elsewhere, in any command's shape.
test("every JSON field the skill relies on is in the spec's --json shapes", () => {
  const shapes = specShapes();
  let checked = 0;
  for (const file of skillFiles()) {
    let command: string | null = null;
    for (const line of withoutFences(readFileSync(file, "utf8")).split("\n")) {
      if (/^#{1,6} /.test(line)) {
        command = /`magpie (\w+)[^`]*--json`/.exec(line)?.[1] ?? null;
        if (command) assert.ok(shapes.has(command), `${basename(file)}: no --json shape for ${command} in the spec`);
        continue;
      }
      for (const span of codeSpans(line)) {
        if (!FIELD.test(span) || NOT_FIELDS.has(span)) continue;
        checked++;
        const where = `${basename(file)}: \`${span}\``;
        if (command) assert.ok(has(shapes.get(command), span), `${where} is not in magpie ${command} --json (spec §2)`);
        else assert.ok([...shapes.values()].some((s) => anyDepth(s, span)), `${where} is not in any --json shape (spec §2)`);
      }
    }
  }
  assert.ok(checked > 0, "the skill names no JSON fields");
});

// A field named outside a command's section may sit at any depth: `verdict` is in recall's matches.
function anyDepth(shape: unknown, path: string): boolean {
  if (has(shape, path)) return true;
  if (!shape || typeof shape !== "object") return false;
  const children = Array.isArray(shape) ? shape : Object.values(shape);
  return children.some((child) => anyDepth(child, path));
}
