// PreToolUse hook: agents may run only read-only git subcommands and read-only gh commands,
// and may not write files from the shell (in-place edits, tee, redirection); they use the Edit/Write tools.
// Based on mattpocock/skills git-guardrails-claude-code, rewritten as an allowlist
// that understands Bash and PowerShell command lines. Best effort, not a sandbox:
// commands built at runtime (variables, eval of computed strings) are not detected.
// Exit code 2 blocks the tool call; stderr is shown to the agent.

import { readFileSync } from "node:fs";

const ALLOWED = new Set(["status", "diff", "log", "show", "blame", "ls-files", "check-ignore"]);
// gh runs with the maintainer's GitHub credentials. "gh api" is handled separately (GET only).
const GH_ALLOWED = new Set(["repo view", "issue list", "issue view", "pr list", "pr view", "release list", "release view", "auth status"]);
// Global git options whose value is the next word.
const OPTS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env"]);
// Words that can precede the real command.
const PREFIXES = new Set(["sudo", "env", "command", "builtin", "exec", "time", "nice", "nohup", "timeout", "stdbuf", "xargs",
  "if", "then", "else", "elif", "do", "while", "until", "!"]);
// Shells whose arguments are themselves a command line.
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "pwsh", "powershell", "cmd"]);
// PowerShell cmdlets whose job is writing a file.
const WRITE_CMDLETS = new Set(["set-content", "add-content", "out-file"]);
// Redirection and tee targets that are not files.
const NULL_TARGETS = new Set(["/dev/null", "nul", "$null"]);
const SEP = Symbol("separator");

// Split a Bash or PowerShell command line into words, separators and redirections.
// An unquoted > or >> becomes { redirect: target }; stream forms like 2>&1 are dropped.
function tokenize(cmd) {
  const out = [];
  let word = null;
  let quote = null;
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
      let target = "", q = null;
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

// The plain words of the command whose arguments start at words[i], up to the next separator.
function argsOf(words, i) {
  const args = [];
  for (; i < words.length && words[i] !== SEP; i++) if (typeof words[i] === "string") args.push(words[i]);
  return args;
}

function gitSubcommand(words, i) {
  for (; i < words.length && words[i] !== SEP; i++) {
    if (typeof words[i] !== "string") continue;
    if (OPTS_WITH_VALUE.has(words[i])) i++;
    else if (!words[i].startsWith("-")) return words[i];
  }
  return null;
}

// "gh api" may only send GET: no non-GET method, no body fields (they switch gh to POST).
// Short flags may be combined (-iXPOST, -ftitle=x), so every short-flag word is scanned.
function ghApiBlocked(args) {
  for (let k = 0; k < args.length; k++) {
    const w = args[k];
    let method = null;
    if (/^--(field|raw-field|input)(=|$)/.test(w)) return `gh api ${w}`;
    if (/^--method(=|$)/.test(w)) method = w.includes("=") ? w.slice(w.indexOf("=") + 1) : args[++k] ?? "";
    else if (/^-[^-]/.test(w)) {
      if (/[fF]/.test(w)) return `gh api ${w}`;
      const x = w.indexOf("X");
      if (x > 0) method = w.slice(x + 1) || (args[++k] ?? "");
    }
    if (method !== null && method.toUpperCase() !== "GET") return `gh api -X ${method}`;
  }
  return null;
}

// Returns the forbidden part of a gh call whose arguments start at words[i], or null.
// Flags before the command make a flag value look like the command, which blocks: fail-safe.
function ghBlocked(words, i) {
  const args = argsOf(words, i);
  const positional = args.filter((w) => !w.startsWith("-"));
  if (positional.length === 0) return null; // gh, gh --version
  if (positional[0] === "api") return ghApiBlocked(args);
  const cmd = positional.slice(0, 2).join(" ");
  if (!GH_ALLOWED.has(cmd)) return `gh ${cmd}`;
  // auth status -t / --show-token prints the token.
  if (cmd === "auth status" && args.some((w) => /^--show-token/.test(w) || /^-[^-]*t/.test(w))) return "gh auth status --show-token";
  return null;
}

// True if `flag` appears in a short-option word (-ni, -pi) before any letter that takes a value.
function shortFlagFirst(word, flag, valueLetters) {
  for (const c of word.slice(1)) {
    if (c === flag) return true;
    if (valueLetters.includes(c)) return false;
  }
  return false;
}

// Returns how a command writes a file in place, or null.
function writeBlocked(name, args) {
  if (WRITE_CMDLETS.has(name)) return name;
  if (name === "tee") {
    const file = args.find((a) => !a.startsWith("-") && !NULL_TARGETS.has(a.toLowerCase()));
    return file ? `tee ${file}` : null;
  }
  if (name === "sed" || name === "gsed") {
    const a = args.find((w) => /^--in-place(=|$)/.test(w) || (/^-[^-]/.test(w) && shortFlagFirst(w, "i", "efl")));
    return a ? `${name} ${a}` : null;
  }
  if (name === "perl" || name === "ruby") {
    const a = args.find((w) => /^-[^-]/.test(w) && shortFlagFirst(w, "i", "eEMmIxdDlFCrKW0"));
    return a ? `${name} ${a}` : null;
  }
  if (name === "awk" || name === "gawk") {
    for (let k = 0; k < args.length; k++) {
      if ((args[k] === "-i" || args[k] === "--include") && /inplace/.test(args[k + 1] ?? "")) return `${name} -i inplace`;
      if (/^(-i|--include=)inplace/.test(args[k])) return `${name} ${args[k]}`;
    }
  }
  return null;
}

// Returns the first forbidden command in cmd as { kind: "git" | "gh" | "write", what }, or null.
function findBlocked(cmd, depth = 0) {
  const words = tokenize(cmd);
  let atCommand = true;
  let inShell = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === SEP) { atCommand = true; inShell = false; continue; }
    if (typeof w === "object") {
      if (w.redirect && !NULL_TARGETS.has(w.redirect.toLowerCase())) return { kind: "write", what: `> ${w.redirect}` };
      continue;
    }
    if (inShell && /\s/.test(w) && depth < 3) {
      const hit = findBlocked(w, depth + 1);
      if (hit) return hit;
    }
    if (w === "-exec" || w === "-execdir") { atCommand = true; continue; }
    if (!atCommand) continue;
    const name = w.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");
    if (/^\w+=/.test(w) || /^-/.test(w) || /^\/\w$/.test(w) || /^\d/.test(w) || PREFIXES.has(name)) continue;
    atCommand = false;
    if (name === "git") {
      const sub = gitSubcommand(words, i + 1);
      if (sub !== null && !ALLOWED.has(sub)) return { kind: "git", what: `git ${sub}` };
    } else if (name === "gh") {
      const hit = ghBlocked(words, i + 1);
      if (hit) return { kind: "gh", what: hit };
    } else if (SHELLS.has(name)) {
      inShell = true;
      atCommand = true;
    } else {
      const hit = writeBlocked(name, argsOf(words, i + 1));
      if (hit) return { kind: "write", what: hit };
    }
  }
  return null;
}

const MESSAGES = {
  git: (what) => `BLOCKED: "${what}" is not allowed. Agents may only run git ${[...ALLOWED].join(", ")}. ` +
    "The maintainer does all staging, commits and pushes by hand; print a suggested commit message instead (see CLAUDE.md section 1).\n",
  gh: (what) => `BLOCKED: "${what}" is not allowed. Agents may only run gh ${[...GH_ALLOWED].join(", ")} (no --show-token), ` +
    "and gh api with GET only (no -f, -F, --field, --raw-field, --input). The maintainer does all GitHub writes by hand (see CLAUDE.md section 1).\n",
  write: (what) => `BLOCKED: "${what}" writes a file from the shell. Agents must use the Edit/Write tools to create and change files. ` +
    "Redirection is allowed only to /dev/null, NUL or $null, or between streams (2>&1) (see CLAUDE.md section 1).\n",
};

const command = JSON.parse(readFileSync(0, "utf8")).tool_input?.command;
const blocked = typeof command === "string" && findBlocked(command);
if (blocked) {
  process.stderr.write(MESSAGES[blocked.kind](blocked.what));
  process.exit(2);
}
