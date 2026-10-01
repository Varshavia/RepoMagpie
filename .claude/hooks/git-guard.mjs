// PreToolUse hook: agents may run only read-only git subcommands.
// Based on mattpocock/skills git-guardrails-claude-code, rewritten as an allowlist
// that understands Bash and PowerShell command lines. Best effort, not a sandbox:
// commands built at runtime (variables, eval of computed strings) are not detected.
// Exit code 2 blocks the tool call; stderr is shown to the agent.

import { readFileSync } from "node:fs";

const ALLOWED = new Set(["status", "diff", "log", "show", "blame", "ls-files", "check-ignore"]);
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

// Returns the first forbidden "git <subcommand>" in cmd, or null.
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
  process.stderr.write(
    `BLOCKED: "${blocked}" is not allowed. Agents may only run git ${[...ALLOWED].join(", ")}. ` +
    "The maintainer does all staging, commits and pushes by hand; print a suggested commit message instead (see CLAUDE.md section 1).\n");
  process.exit(2);
}
