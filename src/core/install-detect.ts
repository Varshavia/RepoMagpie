// Finds package installs in a shell command line (spec section 6), for recall and the hook, and
// package removals, for the Stop reminder (decision 0042).
// The command line is split the way .claude/hooks/git-guard.mjs does it (ported, not imported):
// chains (&&, ||, ;, |), quotes, line continuations (\ and `), $( ... ), redirections, prefixes
// such as sudo or env, and nested shells (bash -c "..."). Best effort: commands built at runtime
// are not seen. Pure: no file system, no printing.
import { normalizePackage, type PackageType } from "./identity.ts";

export interface Install {
  type: PackageType;
  name: string; // without version or extras (spec section 5)
  spec: string; // as written in the command
}

const SEP = Symbol("separator");
type Token = string | typeof SEP | { redirect: string };

// Words that can precede the real command. On Windows: cmd's `call` (a batch file runs npm.cmd
// with it) and `start`, PowerShell's dot-sourcing; then wsl, and npx or corepack running a manager.
const PREFIXES = new Set(["sudo", "env", "command", "builtin", "exec", "time", "nice", "nohup", "timeout", "stdbuf", "xargs",
  "if", "then", "else", "elif", "do", "while", "until", "!", "call", "start", ".", "wsl", "npx", "bunx", "corepack"]);
// Shells whose arguments are themselves a command line, and PowerShell's Invoke-Expression.
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "pwsh", "powershell", "cmd", "iex", "invoke-expression"]);
const POWERSHELL = new Set(["pwsh", "powershell"]);
// PowerShell takes any unambiguous start of a parameter's name, and -ec, for -EncodedCommand.
const ENCODED = /^-(ec|e|en|enc|enco|encod|encode|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)$/i;
const MAX_DEPTH = 3;

// Splits a Bash or PowerShell command line into words, separators and redirections.
function tokenize(cmd: string): Token[] {
  const out: Token[] = [];
  let word: string | null = null;
  let quote: string | null = null;
  const end = () => { if (word !== null) out.push(word); word = null; };
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote === '"' && ch === "$" && cmd[i + 1] === "(") {
      // $( ... ) inside double quotes still runs: tokenize its body as commands.
      let depth = 0, j = i + 1;
      for (; j < cmd.length; j++) {
        if (cmd[j] === "(") depth++;
        else if (cmd[j] === ")" && --depth === 0) break;
      }
      out.push(SEP, ...tokenize(cmd.slice(i + 2, j)), SEP);
      i = j;
    } else if (quote) {
      if (ch === quote) quote = null;
      else if (quote === '"' && (ch === "\\" || ch === "`") && cmd[i + 1] === '"') word += cmd[++i];
      else word += ch;
    } else if ((ch === "\\" || ch === "`") && /^\r?\n/.test(cmd.slice(i + 1))) {
      end(); // line continuation
      i += cmd[i + 1] === "\r" ? 2 : 1;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      word ??= "";
    } else if (ch === ">" || (ch === "&" && cmd[i + 1] === ">")) {
      // A stream number right before the operator (2>, *>) belongs to it, not to the arguments.
      if (word !== null && /^(\d+|\*)$/.test(word)) word = null;
      end();
      if (ch === "&") i++; // &> and &>>
      if (cmd[i + 1] === ">" || cmd[i + 1] === "|") i++; // >> and >|
      let j = i + 1;
      while (j < cmd.length && /[ \t]/.test(cmd[j])) j++;
      if (cmd[j] === "&" && /[\d-]/.test(cmd[j + 1] ?? "")) {
        // >&1, >&2, >&-: another stream, not a file.
        j++;
        while (j < cmd.length && /[\d-]/.test(cmd[j])) j++;
        i = j - 1;
        continue;
      }
      if (cmd[j] === "&") j++; // >& file
      while (j < cmd.length && /[ \t]/.test(cmd[j])) j++;
      let target = "", q: string | null = null;
      for (; j < cmd.length; j++) {
        const c = cmd[j];
        if (q) { if (c === q) q = null; else target += c; }
        else if (c === "'" || c === '"') q = c;
        else if (/\s/.test(c) || ";&|<>(){}`".includes(c)) break;
        else target += c;
      }
      out.push({ redirect: target });
      i = j - 1;
    } else if (";&|\n(){}`".includes(ch) || (ch === "$" && cmd[i + 1] === "(")) {
      end();
      out.push(SEP);
    } else if (/\s/.test(ch)) {
      end();
    } else {
      word = (word ?? "") + ch;
    }
  }
  end();
  return out;
}

// The plain words of the command whose arguments start at tokens[i], up to the next separator.
function argsOf(tokens: Token[], i: number): string[] {
  const args: string[] = [];
  for (; i < tokens.length && tokens[i] !== SEP; i++) if (typeof tokens[i] === "string") args.push(tokens[i] as string);
  return args;
}

// Flags that take a value as the next word, per tool (--flag=value is handled for every flag).
const NPM_VALUES = ["--prefix", "-C", "--registry", "-w", "--workspace", "--tag", "--omit", "--include", "--cache", "--userconfig",
  "--globalconfig", "--install-strategy", "--loglevel", "--save-prefix"];
const PNPM_VALUES = ["-C", "--dir", "--filter", "-F", "--registry", "--store-dir", "--reporter", "--loglevel", "--config"];
const YARN_VALUES = ["--cwd", "--registry", "--modules-folder", "--cache-folder"];
const BUN_VALUES = ["--cwd", "--registry", "--backend", "--cache-dir", "--config", "-c"];
const PIP_VALUES = ["-r", "--requirement", "-c", "--constraint", "-e", "--editable", "-i", "--index-url", "--extra-index-url", "-t",
  "--target", "--prefix", "--root", "-f", "--find-links", "--trusted-host", "--platform", "--python-version", "--implementation",
  "--abi", "--src", "--upgrade-strategy", "--progress-bar", "--cache-dir", "--log", "--proxy", "--retries", "--timeout",
  "--exists-action", "--cert", "--client-cert", "--no-binary", "--only-binary", "-C", "--config-settings", "--global-option",
  "--report", "--python", "--keyring-provider", "--root-user-action", "--group"];
const UV_VALUES = ["-r", "--requirements", "-c", "--constraints", "--overrides", "--group", "--optional", "--package", "--index",
  "--default-index", "--index-url", "--extra-index-url", "--directory", "--project", "--python", "-p", "--tag", "--branch", "--rev",
  "--marker", "-m", "--extra", "--script", "--bounds", "--config-file", "--cache-dir", "-e", "--editable", "--target", "--prefix",
  "-i", "-f", "--find-links"];
const CARGO_VALUES = ["-F", "--features", "-p", "--package", "--git", "--branch", "--tag", "--rev", "--path", "--registry", "--rename",
  "--target", "--manifest-path", "--lockfile-path", "--config", "-Z", "--base", "--color"];

// The positional words of a tool's arguments: flags and their values are skipped.
function positionals(args: string[], valueFlags: readonly string[]): string[] {
  const out: string[] = [];
  for (let k = 0; k < args.length; k++) {
    const arg = args[k];
    if (arg.startsWith("-") && arg.length > 1) {
      if (!arg.includes("=") && valueFlags.includes(arg)) k++;
    } else out.push(arg);
  }
  return out;
}

const lower = (word: string | undefined) => word?.toLowerCase();

// What is looked for: installs (recall and the hooks), or removals (the Stop reminder, decision
// 0042). Each tool's verbs for each.
export type Action = "install" | "remove";
const VERBS: Record<Action, { npm: string[]; pnpm: string[]; bun: string[]; yarn: string[]; pip: string[]; uv: string[]; uvPip: string[]; cargo: string[] }> = {
  // npm's own list (docs.npmjs.com/cli/v11/commands/npm-install, "aliases: add, i, in, ins, inst, insta,
  // instal, isnt, isnta, isntal, isntall"), and install-test, "alias: it", which takes the same arguments.
  install: {
    npm: ["install", "i", "add", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall", "install-test", "it"],
    pnpm: ["add", "install", "i"], bun: ["add", "install", "i"], yarn: ["add"], pip: ["install"], uv: ["add"], uvPip: ["install"], cargo: ["add"],
  },
  remove: {
    npm: ["uninstall", "remove", "rm", "r", "un", "unlink"], pnpm: ["remove", "rm", "uninstall", "un"], bun: ["remove", "rm"], yarn: ["remove"],
    pip: ["uninstall"], uv: ["remove"], uvPip: ["uninstall"], cargo: ["remove", "rm"],
  },
};

// The package words of one command, given its name and arguments; null when it is no install (or,
// with "remove", no removal).
function packagesOf(name: string, args: string[], action: Action = "install"): { type: PackageType; words: string[] } | null {
  const verbs = VERBS[action];
  const is = (word: string | undefined, list: string[]) => list.includes(lower(word) ?? "");
  if (name === "npm") {
    const p = positionals(args, NPM_VALUES);
    return is(p[0], verbs.npm) ? { type: "npm", words: p.slice(1) } : null;
  }
  if ((name === "pnpm" || name === "yarn") && lower(positionals(args, name === "pnpm" ? PNPM_VALUES : YARN_VALUES)[0]) === "dlx") {
    return ran(args.slice(args.findIndex((a) => lower(a) === "dlx") + 1), action);
  }
  if (name === "pnpm" || name === "bun") {
    const p = positionals(args, name === "pnpm" ? PNPM_VALUES : BUN_VALUES);
    return is(p[0], name === "pnpm" ? verbs.pnpm : verbs.bun) ? { type: "npm", words: p.slice(1) } : null;
  }
  if (name === "yarn") {
    const p = positionals(args, YARN_VALUES);
    if (is(p[0], verbs.yarn)) return { type: "npm", words: p.slice(1) };
    if (lower(p[0]) === "workspace" && is(p[2], verbs.yarn)) return { type: "npm", words: p.slice(3) };
    if (lower(p[0]) === "global" && is(p[1], verbs.yarn)) return { type: "npm", words: p.slice(2) }; // Yarn 1
    return null;
  }
  if (/^pip(\d+(\.\d+)?)?$/.test(name)) {
    const p = positionals(args, PIP_VALUES);
    return is(p[0], verbs.pip) ? { type: "pypi", words: p.slice(1) } : null;
  }
  if (/^(python(\d+(\.\d+)?)?|py)$/.test(name)) {
    // -m pip, or -mpip: CPython and the py launcher take the module name attached too.
    const m = args.findIndex((a) => a === "-m" || a === "-mpip");
    if (m === -1) return null;
    if (args[m] === "-mpip") return packagesOf("pip", args.slice(m + 1), action);
    return args[m + 1] === "pip" ? packagesOf("pip", args.slice(m + 2), action) : null;
  }
  if (name === "uv") {
    const p = positionals(args, UV_VALUES);
    if (is(p[0], verbs.uv)) return { type: "pypi", words: p.slice(1) };
    if (lower(p[0]) === "pip" && is(p[1], verbs.uvPip)) return { type: "pypi", words: p.slice(2) };
    return null;
  }
  if (name === "cargo") {
    const p = positionals(args, CARGO_VALUES).filter((word) => !word.startsWith("+")); // +nightly
    return is(p[0], verbs.cargo) ? { type: "cargo", words: p.slice(1) } : null;
  }
  return null;
}

// A manager's name as a command: its file name, lowercased, without a Windows extension, and, for
// a JavaScript manager, without the version npx, bunx, corepack, pnpm dlx and yarn dlx take
// (npm@latest, pnpm@9).
function commandName(word: string): string {
  const name = (word.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
  return name.replace(/^(npm|pnpm|yarn|bun)@[^@/\\]+$/, "$1");
}

// The command pnpm dlx or yarn dlx runs: the first word that isn't a flag, and what follows it.
function ran(args: string[], action: Action): { type: PackageType; words: string[] } | null {
  const k = args.findIndex((a) => !a.startsWith("-"));
  return k === -1 ? null : packagesOf(commandName(args[k]), args.slice(k + 1), action);
}

// A registry package as written, or null for a path, URL, git source, tarball or other non-name.
function registryName(word: string, type: PackageType): string | null {
  if (/^[.~/\\]/.test(word) || /^[a-z][\w+.-]*:/i.test(word) || /\.(tgz|tar|tar\.gz|tar\.bz2|zip|whl)$/i.test(word)) return null;
  if (type === "npm") {
    // An npm alias, my-alias@npm:real@2 or @x/y@npm:real, installs "real".
    if (NPM_ALIAS.test(word)) return registryName(word.slice(word.indexOf("@npm:") + 5), type);
    if (word.includes("/") && !word.startsWith("@")) return null; // user/repo is a GitHub shorthand
  } else if (/[/\\]/.test(word)) return null;
  const name = normalizePackage(word, type);
  return /^(@[\w.~-]+\/)?[\w.~-]+$/.test(name) ? name : null;
}

const NPM_ALIAS = /^(@[^@/:]+\/)?[^@/:]+@npm:/;

// Every package install in the command line, in order, each package once.
export const detectInstalls = (command: string): Install[] => detectCommand(command).installs;

// The installs, and whether part of the command couldn't be read: a PowerShell -EncodedCommand that
// isn't base64 of UTF-16 text, whose installs nobody can see. With "remove", the removals instead.
export function detectCommand(command: string, action: Action = "install"): { installs: Install[]; unreadable: boolean } {
  const found: Install[] = [];
  const seen = new Set<string>();
  const state = { unreadable: false };
  walk(command, 0, (type, word) => {
    // An npm alias installs the real package under the alias's name: both are looked up.
    const alias = type === "npm" && NPM_ALIAS.test(word) ? registryName(word.slice(0, word.indexOf("@npm:")), type) : null;
    for (const name of [registryName(word, type), alias]) {
      if (name === null || seen.has(`${type}:${name}`)) continue;
      seen.add(`${type}:${name}`);
      found.push({ type, name, spec: word });
    }
  }, state, action);
  return { installs: found, unreadable: state.unreadable };
}

// PowerShell's -EncodedCommand: base64 of the command in UTF-16LE. null when it isn't that.
function decodePowerShell(value: string): string | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length % 2 !== 0) return null;
  const text = bytes.toString("utf16le");
  return /[\u0000-\u0008\u000e-\u001f�]/.test(text) ? null : text;
}

function walk(cmd: string, depth: number, add: (type: PackageType, word: string) => void, state: { unreadable: boolean }, action: Action): void {
  const tokens = tokenize(cmd);
  let atCommand = true;
  let inShell = false;
  let powershell = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === SEP) { atCommand = true; inShell = false; powershell = false; continue; }
    if (typeof t !== "string") continue;
    if (powershell && ENCODED.test(t)) {
      const value = tokens[i + 1];
      const decoded = typeof value === "string" ? decodePowerShell(value) : null;
      if (decoded === null) state.unreadable = true;
      else if (depth < MAX_DEPTH) walk(decoded, depth + 1, add, state, action);
      i++;
      continue;
    }
    if (inShell && /\s/.test(t) && depth < MAX_DEPTH) walk(t, depth + 1, add, state, action);
    if (!atCommand) continue;
    const name = commandName(t);
    if (!t || /^\w+=/.test(t) || t.startsWith("-") || /^\/\w$/.test(t) || /^\d/.test(t) || (PREFIXES.has(name) && !(name === "start" && startProcess(argsOf(tokens, i + 1), true)))) continue;
    atCommand = false;
    if (SHELLS.has(name)) {
      inShell = true;
      powershell = POWERSHELL.has(name);
      atCommand = true;
      continue;
    }
    const args = argsOf(tokens, i + 1);
    const started = name === "start-process" || name === "saps" || name === "start" ? startProcess(args, name === "start") : null;
    const install = started ? packagesOf(started.name, started.args, action) : packagesOf(name, args, action);
    for (const word of install?.words ?? []) add(install!.type, word);
  }
}

// PowerShell's Start-Process (saps, or start as its alias): the program, from -FilePath or the first
// positional word, and its -ArgumentList, a list of words split on commas and spaces. null without
// an argument list, or, for `start` (also cmd's), without the -ArgumentList parameter itself.
function startProcess(args: string[], explicit: boolean): { name: string; args: string[] } | null {
  let file: string | undefined;
  let list: string[] | null = null;
  let named = false;
  for (let k = 0; k < args.length; k++) {
    const arg = args[k];
    if (/^-(f|fi|fil|file|filep|filepa|filepat|filepath)$/i.test(arg)) file = args[++k];
    else if (/^-(a|ar|arg|args|argu|argum|argume|argumen|argument|argumentl|argumentli|argumentlis|argumentlist)$/i.test(arg)) {
      list = (args[++k] ?? "").split(/[,\s]+/).filter(Boolean);
      named = true;
    } else if (arg.startsWith("-")) k++; // another parameter and its value
    else if (file === undefined) file = arg;
    else if (list === null) list = arg.split(/[,\s]+/).filter(Boolean);
  }
  if (!file || list === null || (explicit && !named)) return null;
  return { name: (file.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, ""), args: list };
}
