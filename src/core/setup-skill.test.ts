import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Platform } from "./agents.ts";
import { copyFolder } from "./copy-folder.ts";
import { scratchBase } from "./fixtures/scratch.ts";
import { applySkill, planSkill, type SkillRequest } from "./setup-skill.ts";

// The skill as the `skills` CLI lays it out (decision 0035, "The skill"): one real folder in
// .agents/skills/, and a link to it from .claude/skills/.

const platform = process.platform as Platform;
const SOURCE = fileURLToPath(new URL("../../skills/repomagpie/", import.meta.url));
const STAMP = "20261014-120000";
const SKILL = readFileSync(join(SOURCE, "SKILL.md"), "utf8");

function scratch() {
  const root = scratchBase("skill");
  const home = join(root, "home");
  mkdirSync(home);
  const shared = join(home, ".agents", "skills", "repomagpie");
  const claude = join(home, ".claude", "skills", "repomagpie");
  const request = (over: Partial<SkillRequest> = {}): SkillRequest => ({ source: SOURCE, shared, claude, antigravity: null, root: home, remove: false, stamp: STAMP, platform, project: false, ...over });
  const write = (path: string, text: string) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  };
  return { root, home, shared, claude, request, write };
}

const isLink = (path: string) => lstatSync(path).isSymbolicLink();

test("a fresh install: the files in the shared folder, a link from Claude Code's; a second run keeps both", () => {
  const s = scratch();
  const plan = planSkill(s.request());
  assert.deepEqual([plan.shared.action, plan.claude?.action], ["add", "link"]);
  const done = applySkill(plan, s.request());
  assert.equal(done.result, "done", done.error);
  assert.equal(readFileSync(join(s.shared, "SKILL.md"), "utf8"), SKILL);
  assert.equal(readFileSync(join(s.shared, "references", "json.md"), "utf8"), readFileSync(join(SOURCE, "references", "json.md"), "utf8"));
  assert.ok(isLink(s.claude));
  assert.equal(realpathSync(s.claude), realpathSync(s.shared));
  if (platform !== "win32") assert.equal(readlinkSync(s.claude), join("..", "..", ".agents", "skills", "repomagpie"), "relative, as npx skills makes it");
  const again = planSkill(s.request());
  assert.deepEqual([again.shared.action, again.claude?.action], ["keep", "keep"]);
});

test("an older skill in the shared folder is updated in place after a backup; an npx skills install is named", () => {
  const s = scratch();
  applySkill(planSkill(s.request()), s.request());
  writeFileSync(join(s.shared, "SKILL.md"), SKILL.replace(/version: "[^"]+"/, 'version: "0.1.0"'));
  s.write(join(s.home, ".agents", ".skill-lock.json"), JSON.stringify({ version: 3, skills: { repomagpie: { source: "Varshavia/RepoMagpie" } } }));
  const plan = planSkill(s.request());
  assert.equal(plan.shared.action, "update");
  assert.match(plan.shared.reason ?? "", /npx skills/);
  applySkill(plan, s.request());
  assert.equal(readFileSync(join(s.shared, "SKILL.md"), "utf8"), SKILL);
  assert.match(readFileSync(join(plan.shared.backup as string, "SKILL.md"), "utf8"), /version: "0\.1\.0"/);
  assert.ok(!plan.shared.backup?.startsWith(join(s.home, ".agents", "skills")), "a backup outside the skills folder, so no agent reads it as a skill");
});

test("an older real copy in Claude Code's folder is moved to a backup and replaced by the link", () => {
  const s = scratch();
  s.write(join(s.claude, "SKILL.md"), SKILL.replace(/version: "[^"]+"/, 'version: "0.1.0"'));
  const plan = planSkill(s.request());
  assert.equal(plan.claude?.action, "relink");
  const done = applySkill(plan, s.request());
  assert.equal(done.result, "done", done.error);
  assert.ok(isLink(s.claude));
  assert.match(readFileSync(join(plan.claude?.backup as string, "SKILL.md"), "utf8"), /0\.1\.0/);
});

test("left alone and said so: a link elsewhere, a shared folder that is a link, someone else's skill", () => {
  const s = scratch();
  const elsewhere = join(s.root, "elsewhere");
  s.write(join(elsewhere, "SKILL.md"), "---\nname: repomagpie\n---\nmine\n");
  mkdirSync(join(s.home, ".claude", "skills"), { recursive: true });
  symlinkSync(elsewhere, s.claude, "junction");
  s.write(join(s.shared, "SKILL.md"), "---\nname: something-else\n---\n");
  const plan = planSkill(s.request());
  assert.equal(plan.shared.action, "leave");
  assert.match(plan.shared.reason ?? "", /another skill/);
  assert.equal(plan.claude?.action, "leave");
  assert.match(plan.claude?.reason ?? "", /a link to /);
  applySkill(plan, s.request());
  assert.equal(readFileSync(join(elsewhere, "SKILL.md"), "utf8"), "---\nname: repomagpie\n---\nmine\n");

  const t = scratch();
  const target = join(t.root, "dotfiles-skill");
  mkdirSync(target);
  mkdirSync(join(t.home, ".agents", "skills"), { recursive: true });
  symlinkSync(target, t.shared, "junction");
  const shared = planSkill(t.request()).shared;
  assert.deepEqual([shared.action, shared.reason], ["leave", `${t.shared} is a link (yours); setup leaves it.`]);
});

test("--remove: the link is removed, never followed; then the shared folder; someone else's link stays", () => {
  const s = scratch();
  applySkill(planSkill(s.request()), s.request());
  const plan = planSkill(s.request({ remove: true }));
  assert.deepEqual([plan.shared.action, plan.claude?.action], ["remove", "remove"]);
  assert.equal(applySkill(plan, s.request({ remove: true })).result, "done");
  assert.ok(!existsSync(s.claude) && !existsSync(s.shared));

  const t = scratch();
  const elsewhere = join(t.root, "elsewhere");
  t.write(join(elsewhere, "SKILL.md"), "---\nname: repomagpie\n---\n");
  mkdirSync(join(t.home, ".claude", "skills"), { recursive: true });
  symlinkSync(elsewhere, t.claude, "junction");
  applySkill(planSkill(t.request({ remove: true })), t.request({ remove: true }));
  assert.ok(existsSync(join(elsewhere, "SKILL.md")));
});

test("a link that can't be made becomes a copy, and the summary says so", () => {
  const s = scratch();
  const done = applySkill(planSkill(s.request()), s.request(), () => { throw new Error("EPERM: links not allowed here"); });
  assert.equal(done.result, "done", done.error);
  assert.equal(done.claude?.made, "copy");
  assert.ok(!isLink(s.claude));
  assert.equal(readFileSync(join(s.claude, "SKILL.md"), "utf8"), SKILL);
});

// On Windows, fs.cpSync wrote a copy to `C:\Users\Şuat\…` under a mangled `Åuat…` folder beside it,
// and a copy from such a path (the npm folder of that user) killed the process (copy-folder.ts).
test("a home folder and an npm folder under a name with Ş, ı and ü: install, update with a backup, a copy when no link can be made; nothing appears beside the home", () => {
  const root = scratchBase("skill");
  const home = join(root, "Şuat Işık Über");
  const source = join(home, "AppData", "Roaming", "npm", "node_modules", "repomagpie", "skills", "repomagpie");
  copyFolder(SOURCE, source);
  const shared = join(home, ".agents", "skills", "repomagpie");
  const claude = join(home, ".claude", "skills", "repomagpie");
  const antigravity = join(home, ".gemini", "skills", "repomagpie");
  const request = (): SkillRequest => ({ source, shared, claude, antigravity, root: home, remove: false, stamp: STAMP, platform, project: false });

  const installed = applySkill(planSkill(request()), request());
  assert.equal(installed.result, "done", installed.error);
  assert.equal(readFileSync(join(shared, "SKILL.md"), "utf8"), SKILL);
  for (const link of [claude, antigravity]) assert.equal(realpathSync(link), realpathSync(shared));

  writeFileSync(join(shared, "SKILL.md"), SKILL.replace(/version: "[^"]+"/, 'version: "0.1.0"'));
  const plan = planSkill(request());
  assert.equal(plan.shared.action, "update");
  assert.equal(applySkill(plan, request()).result, "done");
  assert.equal(readFileSync(join(shared, "SKILL.md"), "utf8"), SKILL);
  assert.match(readFileSync(join(plan.shared.backup as string, "SKILL.md"), "utf8"), /version: "0\.1\.0"/);

  const copied = applySkill(planSkill({ ...request(), claude: join(home, ".claude2", "skills", "repomagpie") }), { ...request(), claude: join(home, ".claude2", "skills", "repomagpie") }, () => { throw new Error("EPERM"); });
  assert.deepEqual([copied.result, copied.claude?.made], ["done", "copy"], copied.error);
  assert.equal(readFileSync(join(home, ".claude2", "skills", "repomagpie", "SKILL.md"), "utf8"), SKILL);
  assert.deepEqual(readdirSync(root).sort(), [".git", "Şuat Işık Über"], "no folder with a mangled name beside the home");
});

test("in a project on Windows the Claude Code folder gets a copy: a junction can't be committed", () => {
  const s = scratch();
  const plan = planSkill(s.request({ project: true, platform: "win32" }));
  assert.equal(plan.claude?.action, "copy");
  if (platform === "win32") {
    applySkill(plan, s.request({ project: true, platform: "win32" }));
    assert.ok(!isLink(s.claude));
    assert.equal(planSkill(s.request({ project: true, platform: "win32" })).claude?.action, "keep");
  }
});
