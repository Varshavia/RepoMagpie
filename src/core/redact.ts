// Secrets out of text that repomagpie doctor and setup show from other tools' config files (decision
// 0035: "It never prints a secret"). Config files hold tokens in env (shown as names only), but
// also in a server's arguments, a hook's command and URLs. A value counts as a secret when a
// secret-looking name stands before it (TOKEN=, --api-key=, --token <value>, "password":), when it
// has a well-known token format, or when it is a URL's password. Never prints.

const NAME = "[\\w.-]*?(?:token|secret|passw(?:or)?d|pwd|api[-_]?key|apikey|auth|credential|private[-_]?key|access[-_]?key|session)[\\w.-]*";
const ASSIGNED = new RegExp(`(\\b${NAME}["']?\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^\\s"'&;,]+)`, "gi");
const FLAG = new RegExp(`^--?${NAME}$`, "i");
const URL_PASSWORD = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)([^\s/@]+)(@)/gi;
// GitHub, OpenAI and Anthropic-style keys, Slack, AWS access key ids, JWTs, npm tokens.
const FORMATS = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|npm_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g;

export const REDACTED = "<redacted>";

export function redactText(text: string): string {
  return text.replace(URL_PASSWORD, `$1${REDACTED}$3`).replace(ASSIGNED, `$1${REDACTED}`).replace(FORMATS, REDACTED);
}

// A command's arguments: also the value after a flag named like a secret (--token <value>).
export function redactArgs(args: string[]): string[] {
  return args.map((arg, i) => (i > 0 && FLAG.test(args[i - 1]) ? REDACTED : redactText(arg)));
}
