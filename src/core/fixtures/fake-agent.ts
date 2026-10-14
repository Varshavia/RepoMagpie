// Test helper: fake agent CLIs for repomagpie setup's tests. `node fake-agent.ts <agent> <args...>`
// appends {agent, args} to FAKE_AGENT_LOG, then does what the real CLI's docs say (docs/agents.md)
// to a file in the scratch home (HOME / USERPROFILE): `mcp add` and `mcp remove` for claude, codex
// and gemini, `--add-mcp` for code. FAKE_AGENT_FAIL=<agent> makes that agent exit 1;
// FAKE_AGENT_MANGLE=<agent> makes it record a different command, as a CLI with a bug would.
// Not part of the build.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [agent, ...args] = process.argv.slice(2);
appendFileSync(process.env.FAKE_AGENT_LOG as string, `${JSON.stringify({ agent, args })}\n`);
if (process.env.FAKE_AGENT_FAIL === agent) {
  process.stderr.write(`${agent}: something went wrong\n`);
  process.exit(1);
}
const home = (process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME) as string;
const mangle = (command: string) => (process.env.FAKE_AGENT_MANGLE === agent ? `${command}-mangled` : command);

const json = (file: string, change: (root: Record<string, Record<string, unknown>>) => void) => {
  const root = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  change(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(root, null, 2)}\n`);
};

// "mcp add [options] <name> -- <command> [args...]"
const added = () => {
  const dash = args.indexOf("--");
  const name = args[dash - 1];
  return { name, command: mangle(args[dash + 1]), rest: args.slice(dash + 2) };
};

if (agent === "claude" || agent === "gemini") {
  const file = agent === "claude" ? join(home, ".claude.json") : join(home, ".gemini", "settings.json");
  if (args[0] === "mcp" && args[1] === "add") {
    const { name, command, rest } = added();
    json(file, (root) => { root.mcpServers = { ...root.mcpServers, [name]: agent === "claude" ? { type: "stdio", command, args: rest, env: {} } : { command, args: rest } }; });
  } else if (args[0] === "mcp" && args[1] === "remove") {
    json(file, (root) => { delete root.mcpServers?.[args.at(-1) as string]; });
  }
} else if (agent === "codex") {
  const file = join(process.env.CODEX_HOME ?? join(home, ".codex"), "config.toml");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (args[1] === "add") {
    const { name, command, rest } = added();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${text}${text && !text.endsWith("\n\n") ? "\n" : ""}[mcp_servers.${name}]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(rest)}\n`);
  } else if (args[1] === "remove") {
    const lines = text.split("\n");
    const start = lines.indexOf(`[mcp_servers.${args[2]}]`);
    if (start >= 0) {
      let end = start + 1;
      while (end < lines.length && !lines[end].startsWith("[")) end++;
      lines.splice(start, end - start);
    }
    writeFileSync(file, lines.join("\n"));
  }
} else if (agent === "code" && args[0] === "--add-mcp") {
  const { name, ...entry } = JSON.parse(args[1]) as { name: string; command: string };
  const user = process.platform === "win32" ? join(process.env.APPDATA as string, "Code", "User")
    : process.platform === "darwin" ? join(home, "Library", "Application Support", "Code", "User") : join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "Code", "User");
  json(join(user, "mcp.json"), (root) => { root.servers = { ...root.servers, [name]: { ...entry, command: mangle(entry.command) } }; });
  process.stdout.write(`Added MCP servers: ${name}\n`);
}
