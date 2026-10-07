// magpie adopt <name-or-purl> (spec §2): the human output of core's runAdopt. Never installs.
// A note whose Verdict says to avoid the package is copied with no install command.
import { runAdopt } from "../core/adopt.ts";
import type { PackageType } from "../core/identity.ts";
import { exitCode } from "../core/outcome.ts";
import { contextOf, type GlobalOptions } from "./context.ts";
import type { Io } from "./program.ts";

export interface AdoptOptions extends GlobalOptions {
  type?: PackageType;
}

export async function adoptCommand(target: string, options: AdoptOptions, io: Io): Promise<number> {
  const json = Boolean(options.json);
  const ask = io.interactive && !json ? io.ask : undefined;
  const run = await runAdopt({ target, type: options.type }, contextOf(io, options), ask);
  if (json) {
    io.out(`${JSON.stringify(run.document)}\n`);
    return exitCode(run.outcome);
  }
  for (const warning of run.warnings) io.err(`warning: ${warning}\n`);
  if (run.document.error) {
    io.err(`magpie adopt: ${run.document.error}\n`);
    return exitCode(run.outcome);
  }
  for (const notice of run.notices) io.err(`${notice}\n`);
  io.err(`✔ Copied to the project journal: ${run.name}\n`);
  io.out(`${run.document.to}\n`);
  const { install, install_choices: choices } = run.document;
  if (run.avoid) io.out(`Your note says to avoid ${run.name}; no install command.\n`);
  else if (install) io.out(`Install with: ${install}\n`);
  else if (choices.length) io.out(`This repository publishes ${choices.length} packages; install the one you need:\n${choices.map((c) => `  ${c}\n`).join("")}`);
  else io.out(`No install command for a GitHub repository: ${run.url}\n`);
  io.err("The project journal is committed with the code; anyone who can read this repository can read this note.\n");
  return 0;
}
