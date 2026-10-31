import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import type { Fetch } from "../core/github.ts";
import type { GhLogin } from "../core/github-auth.ts";
import type { AdoptOptions } from "./adopt.ts";
import type { CatalogOptions } from "./catalog.ts";
import type { GlobalOptions } from "./context.ts";
import type { DeleteOptions } from "./delete.ts";
import type { DiscoverOptions } from "./discover.ts";
import { DOMAIN_IDS } from "../core/domains.ts";
import type { DomainsOptions } from "./domains.ts";
import type { Env } from "../core/journals.ts";
import { KINDS } from "../core/note.ts";
import { packageVersion } from "../core/version.ts";
import { ANTIGRAVITY_HOOK_HELP, CODEX_HOOK_HELP, COPILOT_HOOK_HELP, CURSOR_HOOK_HELP, GEMINI_HOOK_HELP, HOOK_HELP } from "./hook-help.ts";
import type { HookOptions } from "./hook.ts";
import type { ImportOptions } from "./import.ts";
import type { InitOptions } from "./init.ts";
import type { McpCommandOptions } from "./mcp.ts";
import type { NoteOptions } from "./note.ts";
import type { Terminal } from "./prompt.ts";
import type { SetupOptions } from "./setup.ts";
import type { RecallOptions } from "./recall.ts";
import type { SearchOptions } from "./search.ts";
import type { SuggestOptions } from "./suggest.ts";
import type { TagsOptions } from "./tags.ts";
import type { UiOptions } from "./ui.ts";

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
  openExternal?: (target: string) => Promise<void>; // opens a URL or file in the default app (magpie ui); default: the platform's command
  untilStopped?: () => Promise<void>; // resolves when magpie ui should stop; default: Ctrl+C (SIGINT) or SIGTERM
  terminal?: Terminal; // setup's prompts read keys here; default: stdin, drawn on stderr
  self?: { execPath: string; entry: string }; // the node and the entry file running this; default: this process's
  gh?: GhLogin; // `gh auth token` for the GitHub token (decision 0053); default: gh on env's PATH
}

const JOURNAL_COMMANDS = new Set(["note", "import", "tags", "domains", "search", "catalog", "recall", "suggest", "init", "adopt", "delete", "discover"]);

// Runs repomagpie with the given arguments and returns the exit code (spec section 1).
export async function run(argv: string[], io: Io): Promise<number> {
  let code = 0;
  const program = new Command("repomagpie")
    .description("Remembers what you and your team learned about every dependency.")
    .version(packageVersion())
    .addHelpText("after", "\nmagpie works as a short alias when no other magpie command is on your PATH.")
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
    .option("--alternative <target>", "a package you named to use instead: a name, a PURL or a file stem (repeatable)", (target: string, targets: string[] = []) => [...targets, target])
    .option("--use-when <text>", "when you'd use it, in your words: one item (repeatable)", (item: string, items: string[] = []) => [...items, item])
    .option("--avoid-when <text>", "when you'd avoid it, in your words: one item (repeatable); RepoMagpie then asks before it is installed", (item: string, items: string[] = []) => [...items, item])
    .option("--domain <domain>", `a concern it addresses, confirmed by you (repeatable, at most 3): ${DOMAIN_IDS.join(", ")}`, (domain: string, domains: string[] = []) => [...domains, domain])
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
    .command("tags")
    .description("add GitHub topics as tags to your notes, or merge two spellings of a tag")
    .argument("[tags...]", "with --merge: the tag to replace, then the tag to keep")
    .option("--from-topics", "add each note's GitHub topics that aren't tags yet, until it has 8 tags")
    .option("--merge", "replace one tag with another in every note, and make it an alias in tags.md")
    .addOption(new Option("--journal <journal>", "the journal to tag").choices(["personal", "project"]).default("personal"))
    .option("--dry-run", "report what would happen; write nothing")
    .action(async (tags: string[], _options: unknown, command: Command) => {
      code = await (await import("./tags.ts")).tagsCommand(tags, command.optsWithGlobals<TagsOptions>(), io);
    });

  program
    .command("domains")
    .description("suggest domains for notes that have none, from their tags and topics")
    .option("--suggest", "write suggested domains to every note that has no domains yet")
    .addOption(new Option("--journal <journal>", "the journal to suggest for").choices(["personal", "project"]).default("personal"))
    .option("--dry-run", "report what would happen; write nothing")
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./domains.ts")).domainsCommand(command.optsWithGlobals<DomainsOptions>(), io);
    });

  program
    .command("search")
    .description("keyword search across both journals")
    .argument("<query>", "words to look for")
    .option("--domain <domain>", `a concern the question is about (repeatable): ${DOMAIN_IDS.join(", ")}`, (domain: string, domains: string[]) => [...domains, domain], [])
    .option("--tag <tag>", "a technology the question names; any spelling in tags.md works (repeatable)", (tag: string, tags: string[]) => [...tags, tag], [])
    .addOption(new Option("--match <how>", "boost: domains and tags rank notes higher; filter: only notes with one of them").choices(["boost", "filter"]).default("boost"))
    .addOption(new Option("--kind <kind>", "only notes of this kind").choices(KINDS))
    .addOption(new Option("--journal <journal>", "search one journal only").choices(["personal", "project"]))
    .option("--limit <n>", "show at most n results", positiveInteger, 10)
    .action(async (query: string, _options: unknown, command: Command) => {
      code = await (await import("./search.ts")).searchCommand(query, command.optsWithGlobals<SearchOptions>(), io);
    });

  program
    .command("catalog")
    .description("list every note in one compact row, in pages")
    .option("--tag <tag>", "only notes with this tag (repeatable: every tag must match)", (tag: string, tags: string[]) => [...tags, tag], [])
    .addOption(new Option("--kind <kind>", "only notes of this kind").choices(KINDS))
    .addOption(new Option("--journal <journal>", "list one journal only").choices(["personal", "project"]))
    .option("--limit <n>", "show at most n notes, from 1 to 1000", catalogLimit, 100)
    .option("--cursor <cursor>", "the next page: next_cursor from the previous page")
    .option("--full", "with --json: every field of each note, instead of compact rows")
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./catalog.ts")).catalogCommand(command.optsWithGlobals<CatalogOptions>(), io);
    });

  program
    .command("discover")
    .description("search GitHub for repositories: stars, activity, licence, and whether a journal has them")
    .argument("[words]", "words to look for in names, descriptions and topics")
    .addOption(new Option("--domain <domain>", "repositories for this concern, by its GitHub topics").choices(DOMAIN_IDS))
    .addOption(new Option("--kind <kind>", "repositories of this kind (library, cli, plugin, app and other are estimated)").choices(KINDS))
    .option("--topic <topic>", "a GitHub topic the repository must have (repeatable)", (topic: string, topics: string[]) => [...topics, topic], [])
    .option("--language <language>", "the repository's main language, as GitHub names it")
    .option("--min-stars <n>", "at least n stars", wholeNumber, 10)
    .option("--updated-within <months>", "pushed to in the last n months; 0 for any time", wholeNumber, 24)
    .option("--include-archived", "also show archived repositories")
    .addOption(new Option("--sort <order>", "stars, forks, updated (recently pushed) or best (GitHub's best match)").choices(["stars", "forks", "updated", "best"]).default("stars"))
    .option("--limit <n>", "results a page, from 1 to 50", discoverLimit, 20)
    .option("--page <n>", "the page of results", positiveInteger, 1)
    .action(async (words: string | undefined, _options: unknown, command: Command) => {
      code = await (await import("./discover.ts")).discoverCommand(words, command.optsWithGlobals<DiscoverOptions>(), io);
    });

  program
    .command("recall")
    .description("show your notes before an install")
    .argument("<package...>", "package names (a version or extras are ignored) or PURLs")
    .addOption(new Option("--type <type>", "the package type of a bare name").choices(["npm", "pypi", "cargo"]))
    .option("--full", "show every section and every alternative of each note")
    .action(async (packages: string[], _options: unknown, command: Command) => {
      code = await (await import("./recall.ts")).recallCommand(packages, command.optsWithGlobals<RecallOptions>(), io);
    });

  program
    .command("suggest")
    .description("show the notes that fit this project")
    .argument("[description]", "what the project does; default: its manifests and README")
    .addOption(new Option("--journal <journal>", "read one journal only").choices(["personal", "project"]))
    .option("--limit <n>", "show at most n candidates", positiveInteger, 20)
    .action(async (description: string | undefined, _options: unknown, command: Command) => {
      code = await (await import("./suggest.ts")).suggestCommand(description, command.optsWithGlobals<SuggestOptions>(), io);
    });

  program
    .command("init")
    .description("your notes on this project's packages")
    .option("--auto", "group the dependencies (an avoid note, a note, no note); in a terminal, ask for a Verdict on each one without a note")
    .addOption(new Option("--to <journal>", "the journal new notes go to").choices(["personal", "project"]).default("personal"))
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./init.ts")).initCommand(command.optsWithGlobals<InitOptions>(), io);
    });

  program
    .command("adopt")
    .description("copy a note into the project journal")
    .argument("<name-or-purl>", "a package name or PURL that has a note in your personal journal")
    .addOption(new Option("--type <type>", "the package type of a bare name").choices(["npm", "pypi", "cargo"]))
    .action(async (target: string, _options: unknown, command: Command) => {
      code = await (await import("./adopt.ts")).adoptCommand(target, command.optsWithGlobals<AdoptOptions>(), io);
    });

  program
    .command("delete")
    .description("move a note to its journal's trash")
    .argument("<name>", "a package name, a PURL or a URL that has a note")
    .addOption(new Option("--journal <journal>", "the journal of the note, when both have one").choices(["personal", "project"]))
    .option("--yes", "don't ask; needed when there is no terminal")
    .action(async (target: string, _options: unknown, command: Command) => {
      code = await (await import("./delete.ts")).deleteCommand(target, command.optsWithGlobals<DeleteOptions>(), io);
    });

  program
    .command("ui")
    .description("open the local app in your browser")
    .option("--port <n>", "the port to listen on (default: a free one)", portNumber)
    .option("--no-open", "don't open the browser; only print the URL")
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./ui.ts")).uiCommand(command.optsWithGlobals<UiOptions>(), io);
    });

  program
    .command("setup")
    .description("set up RepoMagpie's MCP server in your coding agents: a plan, a question, then the changes, each file backed up first")
    .option("--yes", "apply the plan without asking")
    .option("--dry-run", "show the plan; change nothing")
    .option("--agents <list>", "only these agents, comma-separated: claude-code, codex, cursor, gemini, vscode, antigravity, copilot")
    .option("--remove", "remove RepoMagpie's entries instead")
    .option("--allow-write", "turn on the note tool in the entries (without this or --no-allow-write, each entry keeps its own; setup asks when it can)")
    .option("--no-allow-write", "turn off the note tool in the entries")
    .option("--delete-backups", "delete setup's backups instead (repomagpie doctor lists them), after asking")
    .option("--keep-latest", "with --delete-backups: keep the newest backup of each file")
    .option("--capture-reminder", "also add Claude Code's Stop reminder: once a session, after an install of a package without a note, the agent is reminded to offer one")
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./setup.ts")).setupCommand(command.optsWithGlobals<SetupOptions>(), io);
    });

  program
    .command("doctor")
    .description("show what is wired: commands on PATH, the skill, the hook, each agent's MCP server, the journals")
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./doctor.ts")).doctorCommand(command.optsWithGlobals<GlobalOptions>(), io);
    });

  program
    .command("mcp")
    .description("an MCP server on stdio, for coding agents (started by the agent, not typed by people)")
    .option("--allow-write", "also serve the note tool, which records the user's Verdict or alternative")
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./mcp.ts")).mcpCommand(command.optsWithGlobals<McpCommandOptions>(), io);
    });

  const hook = program.command("hook").description("adapters that agent hooks run (not typed by people)");
  hook
    .command("claude-code")
    .description("the Claude Code PreToolUse hook: reads the tool call on stdin, recalls notes for package installs")
    .option("--inform-only", "never ask, also for notes that say to avoid a package (for unattended claude -p runs)")
    .addHelpText("after", HOOK_HELP)
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./hook.ts")).hookCommand("claude-code", command.optsWithGlobals<HookOptions>(), io);
    });
  hook
    .command("codex")
    .description("the Codex CLI PreToolUse hook: reads the tool call on stdin, recalls notes for package installs")
    .option("--inform-only", "never deny, also for notes that say to avoid a package (for unattended runs)")
    .addHelpText("after", CODEX_HOOK_HELP)
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./hook.ts")).hookCommand("codex", command.optsWithGlobals<HookOptions>(), io);
    });
  hook
    .command("gemini-cli")
    .description("the Gemini CLI BeforeTool hook: reads the tool call on stdin, recalls notes for package installs")
    .option("--inform-only", "never ask, also for notes that say to avoid a package (for unattended gemini -p runs)")
    .addHelpText("after", GEMINI_HOOK_HELP)
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./hook.ts")).hookCommand("gemini-cli", command.optsWithGlobals<HookOptions>(), io);
    });
  hook
    .command("antigravity")
    .description("the Antigravity CLI PreToolUse hook: reads the tool call on stdin, recalls notes for package installs")
    .option("--inform-only", "never ask (Antigravity shows other notes to nobody, so this prints nothing)")
    .addHelpText("after", ANTIGRAVITY_HOOK_HELP)
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./hook.ts")).hookCommand("antigravity", command.optsWithGlobals<HookOptions>(), io);
    });
  hook
    .command("copilot")
    .description("the Copilot CLI preToolUse hook: reads the tool call on stdin, recalls notes for package installs")
    .option("--inform-only", "never deny (Copilot CLI shows other notes to nobody, so this prints nothing)")
    .addHelpText("after", COPILOT_HOOK_HELP)
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./hook.ts")).hookCommand("copilot", command.optsWithGlobals<HookOptions>(), io);
    });
  hook
    .command("cursor")
    .description("the Cursor beforeShellExecution hook: reads the command on stdin, recalls notes for package installs")
    .option("--inform-only", "never deny (Cursor shows other notes to nobody, so this prints nothing)")
    .addHelpText("after", CURSOR_HOOK_HELP)
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./hook.ts")).hookCommand("cursor", command.optsWithGlobals<HookOptions>(), io);
    });
  hook
    .command("claude-code-stop")
    .description("the Claude Code Stop reminder (opt-in): reads the session's transcript, reminds the agent once to offer a note")
    .action(async (_options: unknown, command: Command) => {
      code = await (await import("./hook.ts")).hookCommand("claude-code-stop", command.optsWithGlobals<HookOptions>(), io);
    });

  try {
    await program.parseAsync(argv, { from: "user" });
    // What a journal command skipped (decision 0032). The hook logs it instead; quick commands such
    // as --version load nothing for it.
    if (JOURNAL_COMMANDS.has(argv[0])) (await import("./context.ts")).reportSkipped(io);
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    if (error.code === "commander.version" || error.code === "commander.helpDisplayed") return 0;
    // Exit 2 from a PreToolUse hook blocks the tool call, so hook commands fail open (spec §6).
    if (argv[0] === "hook") return 0;
    return 2; // every other commander error is a mistake in the command line
  }
  return code;
}

function portNumber(value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1 || n > 65535) throw new InvalidArgumentError("Use a port number from 1 to 65535.");
  return n;
}

// catalog's --limit: at most 1000 rows a page (decision 0034, "Limits").
function catalogLimit(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1000) throw new InvalidArgumentError("Use a whole number from 1 to 1000.");
  return n;
}

// discover's --limit: GitHub's search gives at most 100 a page; 50 keeps a page readable (decision 0045).
function discoverLimit(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new InvalidArgumentError("Use a whole number from 1 to 50.");
  return n;
}

function wholeNumber(value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n)) throw new InvalidArgumentError("Use a whole number of 0 or more.");
  return n;
}

function positiveInteger(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new InvalidArgumentError("Use a whole number of 1 or more.");
  return n;
}
