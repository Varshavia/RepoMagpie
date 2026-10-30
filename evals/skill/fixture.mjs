// The eval's scratch folder, .run/ (git-ignored): a personal journal and a project, copied fresh from
// fixture/ before every scenario, so no scenario sees what another one wrote. The real ~/.magpie is
// never read: the MCP server gets MAGPIE_HOME pointing here.
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFolder, removeFolder } from "../../src/core/copy-folder.ts";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..");
export const RUN = join(HERE, ".run");
export const HOME = join(RUN, "home", ".magpie"); // MAGPIE_HOME: the personal journal
export const PROJECT = join(RUN, "project"); // the agent's working directory
export const CLI = join(REPO, "src", "cli", "main.ts");
// Gemini CLI's home (GEMINI_CLI_HOME), never yours: GEMINI_TEMPLATE as setup left it once per run
// (gemini.mjs), copied to GEMINI_HOME before each scenario.
export const GEMINI_HOME = join(RUN, "gemini-home");
export const GEMINI_TEMPLATE = join(RUN, "gemini-template");
// Each scenario's last outcome for one agent and model, kept between runs for --resume (run.mjs).
export const SAVED = join(RUN, "saved");

// The agent under test, which run.mjs sets: claude-code or gemini-cli.
const agent = () => process.env.REPOMAGPIE_EVAL_AGENT ?? "claude-code";

// The journal and the project as the fixture has them, with the skill where the agent finds it:
// Claude Code in the project's .claude/skills/<name>/SKILL.md, Gemini CLI in its home (setup put it
// there). Each reset is logged, so run.mjs can tell whether the beforeEach hook ran once per scenario.
export function reset() {
  const gemini = agent() === "gemini-cli";
  for (const path of [join(RUN, "home"), PROJECT, ...(gemini ? [GEMINI_HOME] : [])]) removeFolder(path);
  mkdirSync(dirname(HOME), { recursive: true });
  copyFolder(join(HERE, "fixture", "journal"), HOME);
  copyFolder(join(HERE, "fixture", "project"), PROJECT);
  if (gemini) {
    copyFolder(GEMINI_TEMPLATE, GEMINI_HOME);
    // Gemini CLI takes the first .env it finds going up from the project, past the git root and
    // through your home folder; an empty one here stops it at the start.
    mkdirSync(join(PROJECT, ".gemini"), { recursive: true });
    writeFileSync(join(PROJECT, ".gemini", ".env"), "");
  } else {
    copyFolder(join(REPO, "skills", "repomagpie"), join(PROJECT, ".claude", "skills", "repomagpie"));
  }
  appendFileSync(join(RUN, "resets.log"), `${new Date().toISOString()}\n`);
}

// A fresh .run/ for a whole run: the results and the reset log of the last run go too, all but
// SAVED. `setUp` runs once in the emptied .run/, before the first reset (Gemini CLI's home).
export function prepare(setUp = () => {}) {
  mkdirSync(RUN, { recursive: true });
  for (const name of readdirSync(RUN)) if (join(RUN, name) !== SAVED) removeFolder(join(RUN, name));
  setUp();
  reset();
}
