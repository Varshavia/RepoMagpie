// npm run check:build: the bundled CLI in dist/cli/ (decision 0025) answers as the source does. Both
// run the same commands on a scratch journal copied from the example vault, in a scratch project
// with a package.json; stdout and the exit code must be equal. The hook always exits 0 (it fails
// open), so its output is what shows a broken bundle. Then the packed package (decision 0031): the
// tarball from npm pack, installed into a scratch prefix with no network, runs as `repomagpie` and as
// `magpie` (on Windows through npm's .cmd shims), and `npx <tarball>` runs it too: with two bins, npx
// runs the one named like the package, and fails when none is. Run npm run build first.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyFolder, removeFolder } from "../src/core/copy-folder.ts";
import { HOOK_AGENTS } from "../src/hook/agents.ts";

const built = fileURLToPath(new URL("../dist/cli/main.js", import.meta.url));
const source = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));
if (!existsSync(built)) {
  console.error("No build found in dist/cli/. Run npm run build first.");
  process.exit(1);
}

const base = fileURLToPath(new URL("../.scratch/check-build/", import.meta.url));
mkdirSync(base, { recursive: true });
const root = mkdtempSync(join(base, "run-"));
const hook = (command: string) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
// quiet: the command prints nothing (the hook on a command that installs nothing). restores: the
// example note the command moves to the trash, put back before each run; the trash name's UTC stamp
// may differ between the two runs, so it isn't compared. github: the run gets recorded answers from
// GitHub's search instead of the network (src/core/fixtures/fake-github.ts) and starts without
// Discover's cache, so the second run doesn't read the first's answer.
const CASES: { args: string[]; input?: string; quiet?: boolean; restores?: string; github?: boolean }[] = [
  { args: ["--version"] },
  { args: ["--help"] },
  { args: ["recall", "@playwright/cli", "--type", "npm", "--json"] },
  { args: ["search", "browser", "--json"] },
  { args: ["catalog", "--json"] },
  { args: ["suggest", "--json"] },
  { args: ["tags", "--from-topics", "--dry-run", "--json"] },
  { args: ["doctor", "--json"] },
  { args: ["hook", "claude-code"], input: hook("npm install @playwright/cli") },
  { args: ["hook", "claude-code"], input: hook("npm test"), quiet: true },
  // Not an avoid note: a deny would be recorded, and the second run would get the retry's answer.
  { args: ["hook", "codex"], input: hook("npm install @playwright/cli") },
  { args: ["hook", "codex"], input: hook("npm test"), quiet: true },
  { args: ["hook", "gemini-cli"], input: JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "npm install @playwright/cli" } }) },
  // The example vault has no avoid note, and Antigravity's adapter prints only for one.
  { args: ["hook", "antigravity"], input: JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "npm install @playwright/cli" } } }), quiet: true },
  // Copilot CLI's adapter prints only a deny, for an avoid note.
  { args: ["hook", "copilot"], input: JSON.stringify({ toolName: "powershell", toolArgs: { command: "npm install @playwright/cli" } }), quiet: true },
  // So does Cursor's.
  { args: ["hook", "cursor"], input: JSON.stringify({ hook_event_name: "beforeShellExecution", command: "npm install @playwright/cli" }), quiet: true },
  { args: ["discover", "design system", "--json"], github: true },
  { args: ["discover", "design system"], github: true },
  { args: ["delete","https://github.com/mattpocock/skills", "--yes", "--json"], restores: "github--mattpocock--skills.md" },
];
const vault = fileURLToPath(new URL("../examples/vault/notes/", import.meta.url));

// What the package may ship: npm's own files, the licences, the built CLI and app, and the agent
// skill that repomagpie setup installs (decision 0035).
const REQUIRED = ["package.json", "README.md", "LICENSE", "dist/cli/main.js", "dist/cli/THIRD-PARTY-LICENSES.md", "dist/ui/index.html", "dist/ui/THIRD-PARTY-LICENSES.md", "dist/ui/icons-LICENSE.txt", "skills/repomagpie/SKILL.md"];
const SHIPPED = [
  ...REQUIRED.map((file) => new RegExp(`^${file.replace(/[.]/g, "\\.")}$`)),
  /^dist\/cli\/[A-Za-z0-9_-]+\.js$/,
  /^dist\/ui\/[A-Za-z0-9_.-]+\.(js|css|svg)$/,
  /^skills\/repomagpie\/references\/[a-z0-9-]+\.md$/,
];

let failed = 0;
try {
  mkdirSync(join(root, ".git"));
  copyFolder(vault, join(root, "journal", "notes"));
  const project = join(root, "project");
  mkdirSync(project);
  writeFileSync(join(project, "package.json"), JSON.stringify({ description: "Let an agent test a web app in a browser", devDependencies: { "@playwright/test": "*" } }));
  // A scratch home too, so doctor reads no real agent's settings.
  const home = join(root, "home");
  mkdirSync(home);
  const env = { ...process.env, MAGPIE_HOME: join(root, "journal"), NO_COLOR: "1", HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData", "Roaming"), XDG_CONFIG_HOME: join(home, ".config"), CODEX_HOME: join(home, ".codex") };
  const fakeGithub = pathToFileURL(fileURLToPath(new URL("../src/core/fixtures/fake-github.ts", import.meta.url))).href;
  for (const { args, input, quiet, restores, github } of CASES) {
    const run = (main: string) => {
      if (restores) {
        removeFolder(join(root, "journal", ".trash"));
        copyFileSync(join(vault, restores), join(root, "journal", "notes", restores));
      }
      if (github) removeFolder(join(root, "journal", ".cache"));
      const result = spawnSync(process.execPath, [...(github ? ["--import", fakeGithub] : []), main, ...args], { cwd: project, input, encoding: "utf8", env });
      return restores ? { ...result, stdout: result.stdout.replace(/\.\d{8}-\d{6}Z\.md/g, ".<stamp>.md") } : result;
    };
    const [b, s] = [run(built), run(source)];
    const same = b.status === s.status && b.stdout === s.stdout && (b.stdout === "") === Boolean(quiet);
    if (!same) failed++;
    console.log(`${same ? "same" : "DIFFERENT"}  repomagpie ${args.join(" ")}`);
    if (!same) console.log(`  built (exit ${b.status}): ${b.stdout.slice(0, 200)}${b.stderr.slice(0, 200)}\n  source (exit ${s.status}): ${s.stdout.slice(0, 200)}`);
  }
  failed += checkInlinedLicenses();
  failed += checkHookChunks();
  failed += checkPackage(join(root, "pack"));
} finally {
  removeFolder(root);
}
if (failed) {
  console.error(`${failed} checks failed: commands that answer differently from the source, or the packed package.`);
  process.exitCode = 1;
}

// Returns the number of failed checks. npm and npx are .cmd files on Windows, which Node runs only
// through a shell; the shell gets every argument quoted. The npm cache is a scratch folder too.
function checkPackage(dir: string): number {
  const windows = process.platform === "win32";
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const shell = (command: string, args: string[], cwd = dir) =>
    spawnSync([command, ...args].map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(" "), { cwd, encoding: "utf8", shell: true });
  mkdirSync(dir, { recursive: true });
  const npm = ["--offline", "--no-audit", "--no-fund", "--no-update-notifier", "--cache", join(dir, "cache")];
  const packed = shell("npm", ["pack", "--json", "--pack-destination", dir], repo);
  if (packed.status !== 0) return report(false, "npm pack", packed.stderr);
  const [pack] = JSON.parse(packed.stdout) as { filename: string; files: { path: string }[] }[];
  const tarball = join(dir, pack.filename);
  // Only the allowlisted files ship: no tests, fixtures, sources, .worklog or .scratch. And the
  // package has no runtime dependencies (decision 0025).
  const shipped = pack.files.map((file) => file.path.replace(/\\/g, "/"));
  const unexpected = shipped.filter((file) => !SHIPPED.some((allowed) => allowed.test(file)));
  const missing = REQUIRED.filter((file) => !shipped.includes(file));
  const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  const dependencies = Object.keys(pkg.dependencies ?? {});
  let failures = report(!unexpected.length && !missing.length && !dependencies.length, `npm pack ships only the allowlisted files (${shipped.length}), no runtime dependencies`,
    [...unexpected.map((f) => `not allowed: ${f}`), ...missing.map((f) => `missing: ${f}`), ...dependencies.map((d) => `runtime dependency: ${d}`)].join("\n  "));
  const prefix = join(dir, "prefix");
  const install = shell("npm", ["install", "--global", "--prefix", prefix, ...npm, tarball]);
  if (install.status !== 0) return report(false, "npm install of the tarball (offline)", install.stderr);
  const version = (JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { version: string }).version;
  for (const name of ["repomagpie", "magpie"]) {
    const run = shell(windows ? join(prefix, `${name}.cmd`) : join(prefix, "bin", name), ["--version"]);
    failures += report(run.status === 0 && run.stdout.trim() === version, `${name} --version from the installed tarball`, run.stdout + run.stderr);
  }
  // A relative path: npx takes an absolute Windows path (C:\…) for a command, not a package. npx
  // resolves it from the nearest package.json, so the folder gets its own, away from the repository's.
  writeFileSync(join(dir, "package.json"), "{}\n");
  const npx = shell("npx", ["--yes", ...npm, `./${basename(tarball)}`, "--version"]);
  failures += report(npx.status === 0 && npx.stdout.trim() === version, "npx <tarball> --version", `exit ${npx.status}: ${npx.stdout}${npx.stderr}`);
  return failures;
}

// The libraries the MCP SDK inlines in its own files each have a notice in the built
// THIRD-PARTY-LICENSES.md, at that version (scripts/licenses-inlined.md), and no notice is left for
// one the bundle no longer carries. The bundle names each SDK file it includes in a //#region
// comment; that file, in node_modules, names what it inlines by its pnpm path (a scope's "/" is
// "+" there). A newer SDK that inlines other versions fails here until the notices are updated.
function checkInlinedLicenses(): number {
  const dist = fileURLToPath(new URL("../dist/cli/", import.meta.url));
  const bundle = readdirSync(dist).filter((file) => file.endsWith(".js")).map((file) => readFileSync(join(dist, file), "utf8")).join("\n");
  const sdkFiles = new Set([...bundle.matchAll(/\/\/#region (node_modules\/@modelcontextprotocol\/[a-z]+\/dist\/[\w.-]+\.mjs)/g)].map((m) => m[1]));
  const inlined = new Set<string>();
  for (const file of sdkFiles) {
    const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
    for (const m of text.matchAll(/node_modules\/\.pnpm\/(@?[^/@]+)@(\d[^/_"' ]*)/g)) inlined.add(`${m[1].replace("+", "/")} - ${m[2]}`);
  }
  const licenses = readFileSync(join(dist, "THIRD-PARTY-LICENSES.md"), "utf8");
  const listed = (readFileSync(fileURLToPath(new URL("licenses-inlined.md", import.meta.url)), "utf8").match(/^## .+ - \S+(?= \()/gm) ?? []).map((h) => h.slice(3));
  const missing = [...inlined].filter((entry) => !licenses.includes(`## ${entry} (`));
  const stale = listed.filter((entry) => !inlined.has(entry));
  return report(sdkFiles.size > 0 && !missing.length && !stale.length, `a licence notice for each library the MCP SDK inlines in the bundle (${inlined.size})`,
    [...missing.map((e) => `missing: ${e}`), ...stale.map((e) => `not bundled any more: ${e}`)].join("\n  ") || "no SDK file found in the bundle");
}

// Each hook adapter is its own chunk (src/hook/<agent>.ts → <agent>-<hash>.js), and what it loads
// statically holds no other adapter: hook claude-code never loads the others, nor the retry record
// (decision 0036). The command's own chunk loads the adapters only on demand.
function checkHookChunks(): number {
  const dist = fileURLToPath(new URL("../dist/cli/", import.meta.url));
  const files = readdirSync(dist).filter((file) => file.endsWith(".js"));
  const chunkOf = (agent: string) => files.find((file) => new RegExp(`^${agent}-[\\w-]{8}\\.js$`).test(file));
  const loads = (file: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(file)) return seen;
    seen.add(file);
    for (const m of readFileSync(join(dist, file), "utf8").matchAll(/^(?:import|export)\b[^;]*?\bfrom "\.\/([\w.-]+\.js)"/gm)) loads(m[1], seen);
    return seen;
  };
  const problems: string[] = [];
  for (const agent of HOOK_AGENTS) {
    const chunk = chunkOf(agent);
    if (!chunk) {
      problems.push(`no chunk for ${agent}`);
      continue;
    }
    const graph = loads(chunk);
    for (const other of HOOK_AGENTS.filter((a) => a !== agent)) if (graph.has(chunkOf(other) ?? "")) problems.push(`${agent} loads ${other}`);
    if (agent === "claude-code" && [...graph].some((file) => readFileSync(join(dist, file), "utf8").includes("hook-retry.json"))) problems.push("claude-code loads the retry record");
  }
  return report(!problems.length, `each hook adapter is its own chunk and loads no other (${HOOK_AGENTS.join(", ")})`, problems.join("\n  "));
}

function report(ok: boolean, what: string, output: string): number {
  console.log(`${ok ? "ok" : "FAILED"}  ${what}`);
  if (!ok) console.log(`  ${output.trim().slice(0, 400)}`);
  return ok ? 0 : 1;
}
