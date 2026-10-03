// PreToolUse hook: agents may run only read-only git subcommands and read-only gh commands.
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
const SEP = Symbol("separator");

// Split a Bash or PowerShell command line into words and separators.
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

function gitSubcommand(words, i) {
  for (; i < words.length && words[i] !== SEP; i++) {
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
  const args = [];
  for (; i < words.length && words[i] !== SEP; i++) args.push(words[i]);
  const positional = args.filter((w) => !w.startsWith("-"));
  if (positional.length === 0) return null; // gh, gh --version
  if (positional[0] === "api") return ghApiBlocked(args);
  const cmd = positional.slice(0, 2).join(" ");
  if (!GH_ALLOWED.has(cmd)) return `gh ${cmd}`;
  // auth status -t / --show-token prints the token.
  if (cmd === "auth status" && args.some((w) => /^--show-token/.test(w) || /^-[^-]*t/.test(w))) return "gh auth status --show-token";
  return null;
}

// Returns the first forbidden "git <subcommand>" or gh command in cmd, or null.
function findBlocked(cmd, depth = 0) {
  const words = tokenize(cmd);
  let atCommand = true;
  let inShell = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === SEP) { atCommand = true; inShell = false; continue; }
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
      if (sub !== null && !ALLOWED.has(sub)) return `git ${sub}`;
    } else if (name === "gh") {
      const hit = ghBlocked(words, i + 1);
      if (hit) return hit;
    } else if (SHELLS.has(name)) {
      inShell = true;
      atCommand = true;
    }
  }
  return null;
}

const command = JSON.parse(readFileSync(0, "utf8")).tool_input?.command;
const blocked = typeof command === "string" && findBlocked(command);
if (blocked) {
  process.stderr.write(blocked.startsWith("gh ")
    ? `BLOCKED: "${blocked}" is not allowed. Agents may only run gh ${[...GH_ALLOWED].join(", ")} (no --show-token), ` +
      "and gh api with GET only (no -f, -F, --field, --raw-field, --input). The maintainer does all GitHub writes by hand (see CLAUDE.md section 1).\n"
    : `BLOCKED: "${blocked}" is not allowed. Agents may only run git ${[...ALLOWED].join(", ")}. ` +
      "The maintainer does all staging, commits and pushes by hand; print a suggested commit message instead (see CLAUDE.md section 1).\n");
  process.exit(2);
}
