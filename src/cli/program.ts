import { Command, CommanderError, Option } from "commander";
import type { Fetch } from "../core/github.ts";
import type { Env } from "../core/journals.ts";
import { packageVersion } from "../core/version.ts";
import { noteCommand, type NoteOptions } from "./note.ts";

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
}

// The v0.1 commands not built yet (spec section 2).
const NOT_YET = [
  { usage: "import <file>", summary: "add many notes from a file" },
  { usage: "search <query>", summary: "keyword search across both journals" },
  { usage: "suggest [description]", summary: "show the notes that fit this project" },
  { usage: "adopt <name>", summary: "copy a note into the project journal" },
  { usage: "recall <package...>", summary: "show your notes before an install" },
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
      code = await noteCommand(target, text, command.optsWithGlobals<NoteOptions>(), io);
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
    return 2; // every other commander error is a mistake in the command line
  }
  return code;
}
