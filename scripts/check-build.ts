// npm run check:build: the bundled CLI in dist/cli/ (decision 0025) answers as the source does. Both
// run the same commands on a scratch journal copied from the example vault, in a scratch project
// with a package.json; stdout and the exit code must be equal. The hook always exits 0 (it fails
// open), so its output is what shows a broken bundle. Run npm run build first.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  { args: ["suggest", "--json"] },
  { args: ["tags", "--from-topics", "--dry-run", "--json"] },
  { args: ["hook", "claude-code"], input: hook("npm install @playwright/cli") },
  { args: ["hook", "claude-code"], input: hook("npm test"), quiet: true },
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
    console.log(`${same ? "same" : "DIFFERENT"}  magpie ${args.join(" ")}`);
    if (!same) console.log(`  built (exit ${b.status}): ${b.stdout.slice(0, 200)}${b.stderr.slice(0, 200)}\n  source (exit ${s.status}): ${s.stdout.slice(0, 200)}`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
if (failed) {
  console.error(`${failed} of ${CASES.length} commands answer differently from the source.`);
  process.exitCode = 1;
}
