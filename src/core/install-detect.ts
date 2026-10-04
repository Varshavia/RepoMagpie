// Finds package installs in a shell command line (spec section 6), for recall and the hook.
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

// Words that can precede the real command.
const PREFIXES = new Set(["sudo", "env", "command", "builtin", "exec", "time", "nice", "nohup", "timeout", "stdbuf", "xargs",
  "if", "then", "else", "elif", "do", "while", "until", "!"]);
// Shells whose arguments are themselves a command line.
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "pwsh", "powershell", "cmd"]);
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

// The package words of one command, given its name and arguments; null when it is no install.
function packagesOf(name: string, args: string[]): { type: PackageType; words: string[] } | null {
  if (name === "npm") {
    const p = positionals(args, NPM_VALUES);
    return ["install", "i", "add"].includes(lower(p[0]) ?? "") ? { type: "npm", words: p.slice(1) } : null;
  }
  if (name === "pnpm" || name === "bun") {
    const p = positionals(args, name === "pnpm" ? PNPM_VALUES : BUN_VALUES);
    return lower(p[0]) === "add" ? { type: "npm", words: p.slice(1) } : null;
  }
  if (name === "yarn") {
    const p = positionals(args, YARN_VALUES);
    if (lower(p[0]) === "add") return { type: "npm", words: p.slice(1) };
    if (lower(p[0]) === "workspace" && lower(p[2]) === "add") return { type: "npm", words: p.slice(3) };
    return null;
  }
  if (/^pip(\d+(\.\d+)?)?$/.test(name)) {
    const p = positionals(args, PIP_VALUES);
    return lower(p[0]) === "install" ? { type: "pypi", words: p.slice(1) } : null;
  }
  if (/^(python(\d+(\.\d+)?)?|py)$/.test(name)) {
    const m = args.indexOf("-m");
    return m !== -1 && args[m + 1] === "pip" ? packagesOf("pip", args.slice(m + 2)) : null;
  }
  if (name === "uv") {
    const p = positionals(args, UV_VALUES);
    if (lower(p[0]) === "add") return { type: "pypi", words: p.slice(1) };
    if (lower(p[0]) === "pip" && lower(p[1]) === "install") return { type: "pypi", words: p.slice(2) };
    return null;
  }
  if (name === "cargo") {
    const p = positionals(args, CARGO_VALUES).filter((word) => !word.startsWith("+")); // +nightly
    return lower(p[0]) === "add" ? { type: "cargo", words: p.slice(1) } : null;
  }
  return null;
}

// A registry package as written, or null for a path, URL, git source, tarball or other non-name.
function registryName(word: string, type: PackageType): string | null {
  if (/^[.~/\\]/.test(word) || /^[a-z][\w+.-]*:/i.test(word) || /\.(tgz|tar|tar\.gz|tar\.bz2|zip|whl)$/i.test(word)) return null;
  if (type === "npm") {
    // An npm alias, my-alias@npm:real@2, installs "real".
    if (/^[^@:]+@npm:/.test(word)) return registryName(word.slice(word.indexOf("@npm:") + 5), type);
    if (word.includes("/") && !word.startsWith("@")) return null; // user/repo is a GitHub shorthand
  } else if (/[/\\]/.test(word)) return null;
  const name = normalizePackage(word, type);
  return /^(@[\w.~-]+\/)?[\w.~-]+$/.test(name) ? name : null;
}

// Every package install in the command line, in order, each package once.
export function detectInstalls(command: string): Install[] {
  const found: Install[] = [];
  const seen = new Set<string>();
  walk(command, 0, (type, word) => {
    const name = registryName(word, type);
    if (name === null || seen.has(`${type}:${name}`)) return;
    seen.add(`${type}:${name}`);
    found.push({ type, name, spec: word });
  });
  return found;
}

function walk(cmd: string, depth: number, add: (type: PackageType, word: string) => void): void {
  const tokens = tokenize(cmd);
  let atCommand = true;
  let inShell = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === SEP) { atCommand = true; inShell = false; continue; }
    if (typeof t !== "string") continue;
    if (inShell && /\s/.test(t) && depth < MAX_DEPTH) walk(t, depth + 1, add);
    if (!atCommand) continue;
    const name = (t.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
    if (/^\w+=/.test(t) || t.startsWith("-") || /^\/\w$/.test(t) || /^\d/.test(t) || PREFIXES.has(name)) continue;
    atCommand = false;
    if (SHELLS.has(name)) {
      inShell = true;
      atCommand = true;
      continue;
    }
    const install = packagesOf(name, argsOf(tokens, i + 1));
    for (const word of install?.words ?? []) add(install!.type, word);
  }
}
