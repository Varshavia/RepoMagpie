// The eval's scratch folder, .run/ (git-ignored): a personal journal and a project, copied fresh from
// fixture/ before every scenario, so no scenario sees what another one wrote. The real ~/.magpie is
// never read: the MCP server gets MAGPIE_HOME pointing here.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFolder, removeFolder } from "../../src/core/copy-folder.ts";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..");
export const RUN = join(HERE, ".run");
export const HOME = join(RUN, "home", ".magpie"); // MAGPIE_HOME: the personal journal
export const PROJECT = join(RUN, "project"); // the agent's working directory
export const CLI = join(REPO, "src", "cli", "main.ts");

// The journal and the project as the fixture has them, with the skill where Claude Code finds a
// project's skills (.claude/skills/<name>/SKILL.md). Each reset is logged, so run.mjs can tell
// whether the beforeEach hook ran once per scenario.
export function reset() {
  for (const path of [join(RUN, "home"), PROJECT]) removeFolder(path);
  mkdirSync(dirname(HOME), { recursive: true });
  copyFolder(join(HERE, "fixture", "journal"), HOME);
  copyFolder(join(HERE, "fixture", "project"), PROJECT);
  copyFolder(join(REPO, "skills", "repomagpie"), join(PROJECT, ".claude", "skills", "repomagpie"));
  appendFileSync(join(RUN, "resets.log"), `${new Date().toISOString()}\n`);
}

// A fresh .run/ for a whole run: the results and the reset log of the last run go too.
export function prepare() {
  removeFolder(RUN);
  mkdirSync(RUN, { recursive: true });
  reset();
}
