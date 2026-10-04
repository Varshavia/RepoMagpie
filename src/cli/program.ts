import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import type { Fetch } from "../core/github.ts";
import type { Env } from "../core/journals.ts";
import { KINDS } from "../core/note.ts";
import { packageVersion } from "../core/version.ts";
import { HOOK_HELP } from "./hook-help.ts";
import type { HookOptions } from "./hook.ts";
import type { ImportOptions } from "./import.ts";
import type { NoteOptions } from "./note.ts";
import type { RecallOptions } from "./recall.ts";
import type { SearchOptions } from "./search.ts";

// Each command's module is loaded only when that command runs, so a quick command (recall) doesn't
// pay for the others' libraries (spec §7 budgets).

// Everything a command needs from the outside world. main.ts passes the real ones; tests pass
// temporary folders and recorded responses.
export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  env: Env;
  cwd: string;
  home: string;
  fetch: Fetch;
  today: () => string; // YYYY-MM-DD, local time
  interactive: boolean; // stdin and stdout are terminals
  ask: (question: string) => Promise<string>; // one line typed in the terminal
  columns?: number; // the terminal's width when stdout is a terminal; undefined when piped
  stdin?: () => Promise<string>; // all of standard input (the hook reads Claude Code's JSON from it)
}

// The v0.1 commands not built yet (spec section 2).
const NOT_YET = [
  { usage: "suggest [description]", summary: "show the notes that fit this project" },
  { usage: "adopt <name>", summary: "copy a note into the project journal" },
  { usage: "init", summary: "draft notes from this project's manifests" },
];

// Runs magpie with the given arguments and returns the exit code (spec section 1).
export async function run(argv: string[], io: Io): Promise<number> {
  let code = 0;
  const program = new Command("magpie")
    .description("Remembers what you and your team learned about every dependency.")
    .version(packageVersion())
    .option("--json", "print one JSON document on stdout")
    .option("--home <dir>", "the personal journal")
    .option("--project <dir>", "the project root (like git -C), or its .magpie folder")
    .exitOverride()
    .configureOutput({ writeOut: io.out, writeErr: io.err });

  program
    .command("note")
    .description("capture a verdict in one line")
    .argument("<name-or-url>", "a package name, a PURL, or a GitHub or registry URL")
    .argument("[text]", "your Verdict, in one line")
    .addOption(new Option("--type <type>", "the package type of a bare name").choices(["npm", "pypi", "cargo"]))
    .addOption(new Option("--to <journal>", "the journal to write to").choices(["personal", "project"]).default("personal"))
    .action(async (target: string, text: string | undefined, _options: unknown, command: Command) => {
      code = await (await import("./note.ts")).noteCommand(target, text, command.optsWithGlobals<NoteOptions>(), io);
    });

  program
    .command("import")
    .description("add many notes from a file")
    .argument("<file>", 'a file whose "- " lines are items: - <url-or-name> — verdict: ... | use: ... | avoid: ...')
    .addOption(new Option("--to <journal>", "the journal to write to").choices(["personal", "project"]).default("personal"))
    .option("--dry-run", "report what would happen; write nothing")
    .action(async (file: string, _options: unknown, command: Command) => {
      code = await (await import("./import.ts")).importCommand(file, command.optsWithGlobals<ImportOptions>(), io);
    });

  program
    .command("search")
    .description("keyword search across both journals")
    .argument("<query>", "words to look for")
    .option("--tag <tag>", "only notes with this tag (repeatable: every tag must match)", (tag: string, tags: string[]) => [...tags, tag], [])
    .addOption(new Option("--kind <kind>", "only notes of this kind").choices(KINDS))
    .addOption(new Option("--journal <journal>", "search one journal only").choices(["personal", "project"]))
    .option("--limit <n>", "show at most n results", positiveInteger, 10)
    .action(async (query: string, _options: unknown, command: Command) => {
      code = await (await import("./search.ts")).searchCommand(query, command.optsWithGlobals<SearchOptions>(), io);
    });

  program
    .command("recall")
    .description("show your notes before an install")
    .argument("<package...>", "package names (a version or extras are ignored) or PURLs")
    .addOption(new Option("--type <type>", "the package type of a bare name").choices(["npm", "pypi", "cargo"]))
    .option("--full", "show every section of each note")
    .action(async (packages: string[], _options: unknown, command: Command) => {
      code = await (await import("./recall.ts")).recallCommand(packages, command.optsWithGlobals<RecallOptions>(), io);
    });

  program
    .command("hook")
    .description("adapters that agent hooks run (not typed by people)")
    .command("claude-code")
    .description("the Claude Code PreToolUse hook: reads the tool call on stdin, recalls notes for package installs")
    .option("--inform-only", "never ask, also for notes that say to avoid a package (for unattended claude -p runs)")
    .addHelpText("after", HOOK_HELP)
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./hook.ts")).hookCommand(command.optsWithGlobals<HookOptions>(), io);
    });

  for (const { usage, summary } of NOT_YET) {
    const name = usage.split(" ")[0];
    program.command(usage).description(`[not implemented yet] ${summary}`).action(() => {
      io.err(`magpie ${name}: not implemented yet\n`);
      code = 1;
    });
  }

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    if (error.code === "commander.version" || error.code === "commander.helpDisplayed") return 0;
    // Exit 2 from a PreToolUse hook blocks the tool call, so hook commands fail open (spec §6).
    if (argv[0] === "hook") return 0;
    return 2; // every other commander error is a mistake in the command line
  }
  return code;
}

function positiveInteger(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError("Use a whole number of 1 or more.");
  return n;
}
