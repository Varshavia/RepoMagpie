import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInstalls } from "./install-detect.ts";

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
  ["npm install my-alias@npm:real-pkg@2", ["npm:real-pkg"]],
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

test("a very long or deeply nested command never throws", () => {
  assert.deepEqual(detectInstalls("bash -c 'bash -c \"bash -c \\\"bash -c npm\\\"\"'"), []);
  assert.equal(detectInstalls(`npm i ${"a ".repeat(5000)}`).length, 1);
});
