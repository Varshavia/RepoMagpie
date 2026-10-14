// npm run check:build: the bundled CLI in dist/cli/ (decision 0025) answers as the source does. Both
// run the same commands on a scratch journal copied from the example vault, in a scratch project
// with a package.json; stdout and the exit code must be equal. The hook always exits 0 (it fails
// open), so its output is what shows a broken bundle. Then the packed package (decision 0031): the
// tarball from npm pack, installed into a scratch prefix with no network, runs as `repomagpie` and as
// `magpie` (on Windows through npm's .cmd shims), and `npx <tarball>` runs it too: with two bins, npx
// runs the one named like the package, and fails when none is. Run npm run build first.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

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
// quiet: the command prints nothing (the hook on a command that installs nothing).
const CASES: { args: string[]; input?: string; quiet?: boolean }[] = [
  { args: ["--version"] },
  { args: ["--help"] },
  { args: ["recall", "@playwright/cli", "--type", "npm", "--json"] },
  { args: ["search", "browser", "--json"] },
  { args: ["catalog", "--json"] },
  { args: ["suggest", "--json"] },
  { args: ["tags", "--from-topics", "--dry-run", "--json"] },
  { args: ["hook", "claude-code"], input: hook("npm install @playwright/cli") },
  { args: ["hook", "claude-code"], input: hook("npm test"), quiet: true },
];

// What the package may ship: npm's own files, the licences, and the built CLI and app.
const REQUIRED = ["package.json", "README.md", "LICENSE", "dist/cli/main.js", "dist/cli/THIRD-PARTY-LICENSES.md", "dist/ui/index.html", "dist/ui/THIRD-PARTY-LICENSES.md", "dist/ui/icons-LICENSE.txt"];
const SHIPPED = [
  ...REQUIRED.map((file) => new RegExp(`^${file.replace(/[.]/g, "\\.")}$`)),
  /^dist\/cli\/[A-Za-z0-9_-]+\.js$/,
  /^dist\/ui\/[A-Za-z0-9_.-]+\.(js|css|svg)$/,
];

let failed = 0;
try {
  mkdirSync(join(root, ".git"));
  cpSync(fileURLToPath(new URL("../examples/vault/notes/", import.meta.url)), join(root, "journal", "notes"), { recursive: true });
  const project = join(root, "project");
  mkdirSync(project);
  writeFileSync(join(project, "package.json"), JSON.stringify({ description: "Let an agent test a web app in a browser", devDependencies: { "@playwright/test": "*" } }));
  const env = { ...process.env, MAGPIE_HOME: join(root, "journal"), NO_COLOR: "1" };
  for (const { args, input, quiet } of CASES) {
    const run = (main: string) => spawnSync(process.execPath, [main, ...args], { cwd: project, input, encoding: "utf8", env });
    const [b, s] = [run(built), run(source)];
    const same = b.status === s.status && b.stdout === s.stdout && (b.stdout === "") === Boolean(quiet);
    if (!same) failed++;
    console.log(`${same ? "same" : "DIFFERENT"}  repomagpie ${args.join(" ")}`);
    if (!same) console.log(`  built (exit ${b.status}): ${b.stdout.slice(0, 200)}${b.stderr.slice(0, 200)}\n  source (exit ${s.status}): ${s.stdout.slice(0, 200)}`);
  }
  failed += checkInlinedLicenses();
  failed += checkPackage(join(root, "pack"));
} finally {
  rmSync(root, { recursive: true, force: true });
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

// The libraries the MCP SDK inlines in its own files (their pnpm paths are in its comments; the
// bundle drops comments) each have a notice in the built THIRD-PARTY-LICENSES.md, at that version
// (scripts/licenses-inlined.md). A newer SDK that inlines other versions fails here until updated.
function checkInlinedLicenses(): number {
  const sdk = fileURLToPath(new URL("../node_modules/@modelcontextprotocol/server/dist/", import.meta.url));
  const files = readdirSync(sdk).filter((file) => file.endsWith(".mjs")).map((file) => readFileSync(join(sdk, file), "utf8")).join("\n");
  const inlined = new Set([...files.matchAll(/node_modules\/\.pnpm\/((?:@[^/@]+\/)?[^/@]+)@(\d[^/_"' ]*)/g)].map((m) => `${m[1]} - ${m[2]}`));
  const licenses = readFileSync(fileURLToPath(new URL("../dist/cli/THIRD-PARTY-LICENSES.md", import.meta.url)), "utf8");
  const missing = [...inlined].filter((entry) => !licenses.includes(`## ${entry} (`));
  return report(inlined.size > 0 && !missing.length, `a licence notice for each library the MCP SDK inlines (${inlined.size})`, `missing: ${missing.join(", ") || "none found"}`);
}

function report(ok: boolean, what: string, output: string): number {
  console.log(`${ok ? "ok" : "FAILED"}  ${what}`);
  if (!ok) console.log(`  ${output.trim().slice(0, 400)}`);
  return ok ? 0 : 1;
}
