import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCommand, detectInstalls } from "./install-detect.ts";

// Spec section 6: the install commands recall recognises, and how a command line is split.
// Each case: the command, then the packages found as "<type>:<name>" (versions and extras dropped).
const CASES: [string, string[]][] = [
  // The spec's table
  ["npm install pdfkit", ["npm:pdfkit"]],
  ["npm i pdfkit", ["npm:pdfkit"]],
  ["npm add pdfkit", ["npm:pdfkit"]],
  ["pnpm add pdfkit", ["npm:pdfkit"]],
  ["yarn add pdfkit", ["npm:pdfkit"]],
  ["bun add pdfkit", ["npm:pdfkit"]],
  ["pip install requests", ["pypi:requests"]],
  ["pip3 install requests", ["pypi:requests"]],
  ["python -m pip install requests", ["pypi:requests"]],
  ["python3 -m pip install requests", ["pypi:requests"]],
  ["py -m pip install requests", ["pypi:requests"]],
  ["uv add requests", ["pypi:requests"]],
  ["uv pip install requests", ["pypi:requests"]],
  ["cargo add serde", ["cargo:serde"]],

  // Several names; versions, extras and scopes (spec section 5)
  ["npm i -D typescript @types/node", ["npm:typescript", "npm:@types/node"]],
  ["npm install pdfkit@1.2.0 @scope/name@^3", ["npm:pdfkit", "npm:@scope/name"]],
  ['npm install "chalk@>=5 <6"', ["npm:chalk"]],
  ["npm install my-alias@npm:real-pkg@2", ["npm:real-pkg", "npm:my-alias"]], // the real package, then the alias's name
  ["pip install 'requests[socks]>=2' flask==3.0 Django~=5.0", ["pypi:requests", "pypi:flask", "pypi:Django"]],
  ["pip install requests @ https://example.com/requests.whl", ["pypi:requests"]],
  ["cargo add serde@1.0 serde_json --features derive", ["cargo:serde", "cargo:serde_json"]],
  ["uv add --dev pytest ruff", ["pypi:pytest", "pypi:ruff"]],
  ["yarn add -D vitest", ["npm:vitest"]],
  ["bun add -d @biomejs/biome", ["npm:@biomejs/biome"]],

  // Flags and their values are skipped
  ["npm install --prefix ./app --registry https://r.example pdfkit", ["npm:pdfkit"]],
  ["npm install -w app pdfkit", ["npm:pdfkit"]],
  ["npm install --workspace=app --save-exact pdfkit", ["npm:pdfkit"]],
  ["pnpm --filter web add react", ["npm:react"]],
  ["pnpm -C packages/web add -D react", ["npm:react"]],
  ["yarn --cwd web add react", ["npm:react"]],
  ["yarn workspace web add react", ["npm:react"]],
  ["pip install -i https://pypi.example/simple --target ./vendor requests", ["pypi:requests"]],
  ["pip install -c constraints.txt requests", ["pypi:requests"]],
  ["pip install --upgrade --user requests", ["pypi:requests"]],
  ["uv add --group docs mkdocs", ["pypi:mkdocs"]],
  ["uv pip install --python 3.12 requests", ["pypi:requests"]],
  ["cargo add -F derive --package core serde", ["cargo:serde"]],
  ["cargo add --git https://github.com/serde-rs/serde serde", ["cargo:serde"]],
  ["cargo +nightly add serde", ["cargo:serde"]],

  // Chains, pipes, subshells, nested shells, prefixes
  ["cd app && npm i pdfkit; pip install requests | tee log.txt", ["npm:pdfkit", "pypi:requests"]],
  ["npm test || npm i chalk", ["npm:chalk"]],
  ["echo $(npm install chalk)", ["npm:chalk"]],
  ['bash -c "npm i pdfkit && cargo add serde"', ["npm:pdfkit", "cargo:serde"]],
  ["sh -c 'pip install requests'", ["pypi:requests"]],
  ["cmd /c npm install pdfkit", ["npm:pdfkit"]],
  ['powershell -Command "npm install pdfkit"', ["npm:pdfkit"]],
  ["sudo npm install -g pdfkit", ["npm:pdfkit"]],
  ["env CI=1 npm install pdfkit", ["npm:pdfkit"]],
  ["NODE_ENV=dev npm i pdfkit", ["npm:pdfkit"]],
  ["npm install pdfkit > install.log 2>&1", ["npm:pdfkit"]],
  ["npm install \\\n  pdfkit", ["npm:pdfkit"]],
  ["npm install `\n  pdfkit", ["npm:pdfkit"]], // PowerShell line continuation
  ["C:\\tools\\npm.cmd install pdfkit", ["npm:pdfkit"]],
  ["/usr/bin/pip3 install requests", ["pypi:requests"]],
  ["NPM Install PDFKit", ["npm:PDFKit"]], // PowerShell is case-insensitive about command names

  // Forms the agents used on Windows in the pre-check (decision 0036): npm's shims by name,
  // PowerShell's call operator, a quoted full path, and the commands around an install
  ["npm.cmd install left-pad", ["npm:left-pad"]],
  ["npm.ps1 install left-pad", ["npm:left-pad"]],
  ["& npm install left-pad --no-fund", ["npm:left-pad"]],
  ['& "C:\\Program Files\\nodejs\\npm.cmd" install left-pad', ["npm:left-pad"]],
  ["pnpm.cmd add left-pad", ["npm:left-pad"]],
  ["yarn.cmd add left-pad", ["npm:left-pad"]],
  ["bun.exe add left-pad", ["npm:left-pad"]],
  ["Set-Location app; npm.cmd i left-pad; Get-ChildItem", ["npm:left-pad"]],
  ["npx.cmd create-vite app", []],
  ["repomagpie.cmd recall left-pad --json", []],
  ["Get-Content 'C:\\Users\\me\\.agents\\skills\\repomagpie\\SKILL.md'", []],
  ["Get-ChildItem -Force | Select-Object Name,Length", []],
  ["Get-Content package.json; npm.cmd ls pdfkit --depth=0", []], // Codex, live test: it checks without installing
  ["npm ls pdfkit", []],
  ["npm list pdfkit --all", []],
  ["npm view pdfkit version", []],
  ["npm explain pdfkit", []],

  // Every name a manager installs under. npm's docs: npm-install, "aliases: add,
  // i, in, ins, inst, insta, instal, isnt, isnta, isntal, isntall"; npm-install-test, "alias: it",
  // with "exactly the same arguments as npm install". bun's install and i; Yarn 1's global add.
  ["npm in pdfkit", ["npm:pdfkit"]],
  ["npm ins pdfkit", ["npm:pdfkit"]],
  ["npm inst pdfkit", ["npm:pdfkit"]],
  ["npm insta pdfkit", ["npm:pdfkit"]],
  ["npm instal pdfkit", ["npm:pdfkit"]],
  ["npm isnt pdfkit", ["npm:pdfkit"]],
  ["npm isnta pdfkit", ["npm:pdfkit"]],
  ["npm isntal pdfkit", ["npm:pdfkit"]],
  ["npm isntall pdfkit", ["npm:pdfkit"]],
  ["npm install-test pdfkit", ["npm:pdfkit"]],
  ["npm it pdfkit", ["npm:pdfkit"]],
  ["bun i pdfkit", ["npm:pdfkit"]],
  ["bun install pdfkit", ["npm:pdfkit"]],
  ["yarn global add pdfkit", ["npm:pdfkit"]],
  ["pnpm i pdfkit", ["npm:pdfkit"]],
  ["pnpm install pdfkit", ["npm:pdfkit"]],
  ["npm it", []],
  ["bun install", []],
  ["bun i", []],
  ["pnpm i", []],

  // pip run by Python with -m attached: CPython and the py launcher both take it
  ["python -mpip install requests", ["pypi:requests"]],
  ["python3 -mpip install requests", ["pypi:requests"]],
  ["py -mpip install requests", ["pypi:requests"]],
  ["python -mpipx install requests", []],

  // A manager at a version, run by another
  ["npx -y npm@latest install pdfkit", ["npm:pdfkit"]],
  ["npx npm@10.9.0 i pdfkit", ["npm:pdfkit"]],
  ["corepack pnpm@9 add pdfkit", ["npm:pdfkit"]],
  ["corepack yarn@1.22.22 add pdfkit", ["npm:pdfkit"]],
  ["bunx npm@latest install pdfkit", ["npm:pdfkit"]],
  ["pnpm dlx npm@10 install pdfkit", ["npm:pdfkit"]],
  ["yarn dlx npm@10 install pdfkit", ["npm:pdfkit"]],
  ["bunx create-vite app", []],
  ["pnpm dlx create-vite app", []],
  ["yarn dlx create-vite app", []],

  // A scoped alias installs the real package; both names are looked up
  ["npm install --save-exact @types/react@npm:types-react@rc", ["npm:types-react", "npm:@types/react"]],
  ["npm i @x/y@npm:@evil/real@1", ["npm:@evil/real", "npm:@x/y"]],

  // The same package twice is reported once
  ["npm i pdfkit && npm i pdfkit@2", ["npm:pdfkit"]],

  // Not package names: paths, URLs, git, tarballs, requirement files
  ["npm install ./local ../lib /abs/pkg file:../x git+https://github.com/a/b.git https://x.example/p.tgz user/repo github:user/repo pkg.tgz", []],
  ["pip install . -e ./src ./dist/pkg-1.0-py3-none-any.whl pkg.tar.gz git+https://github.com/a/b", []],
  ["cargo add --path ../local", []],

  // Installs without package names are ignored in v0.1
  ["npm install", []],
  ["npm ci", []],
  ["pnpm install", []],
  ["yarn", []],
  ["pip install -r requirements.txt", []],
  ["uv sync", []],
  ["uv add -r requirements.txt", []],

  // Not installs at all
  ["npm run build", []],
  ["npx create-vite app", []],
  ["echo npm install pdfkit", []],
  ["git commit -m 'npm install pdfkit'", []],
  ["pip list", []],
  ["cargo build", []],
  ["", []],
];

for (const [command, expected] of CASES) {
  test(`detectInstalls: ${JSON.stringify(command)}`, () => {
    assert.deepEqual(detectInstalls(command).map((i) => `${i.type}:${i.name}`), expected);
  });
}

test("each install keeps the package as written", () => {
  assert.deepEqual(detectInstalls("npm i pdfkit@1.2.0 && pip install 'requests[socks]>=2'"), [
    { type: "npm", name: "pdfkit", spec: "pdfkit@1.2.0" },
    { type: "pypi", name: "requests", spec: "requests[socks]>=2" },
  ]);
});

// Removals, for the Stop reminder (decision 0042): each tool's verbs, through the same splitting.
const REMOVALS: [string, string[]][] = [
  ["npm uninstall moment", ["npm:moment"]],
  ["npm rm moment lodash", ["npm:moment", "npm:lodash"]],
  ["npm remove @scope/old", ["npm:@scope/old"]],
  ["npm un moment && npm i date-fns", ["npm:moment"]],
  ["pnpm remove moment", ["npm:moment"]],
  ["yarn remove moment", ["npm:moment"]],
  ["yarn workspace web remove moment", ["npm:moment"]],
  ["bun rm moment", ["npm:moment"]],
  ["pip uninstall -y requests", ["pypi:requests"]],
  ["python -m pip uninstall requests", ["pypi:requests"]],
  ["uv remove requests", ["pypi:requests"]],
  ["uv pip uninstall requests", ["pypi:requests"]],
  ["cargo remove serde", ["cargo:serde"]],
  ["bash -c 'npm uninstall moment'", ["npm:moment"]],
  // Not removals: installs, other commands, and words that only look like the verbs
  ["npm install moment", []],
  ["npm run remove-moment", []],
  ["rm -rf node_modules", []],
  ["git rm moment.js", []],
];

for (const [command, expected] of REMOVALS) {
  test(`detectCommand (remove): ${JSON.stringify(command)}`, () => {
    assert.deepEqual(detectCommand(command, "remove").installs.map((i) => `${i.type}:${i.name}`), expected);
  });
}

test("installs stay installs: a removal is never found as one", () => {
  assert.deepEqual(detectInstalls("npm uninstall moment && pip uninstall requests && cargo rm serde"), []);
});

test("a very long or deeply nested command never throws", () => {
  assert.deepEqual(detectInstalls("bash -c 'bash -c \"bash -c \\\"bash -c npm\\\"\"'"), []);
  assert.equal(detectInstalls(`npm i ${"a ".repeat(5000)}`).length, 1);
});
