// Builds the CLI for publishing (spec §9, decision 0025): src/cli/main.ts and everything it imports,
// the libraries included, bundled by Vite into dist/cli/: main.js, and beside it the chunks it loads
// on demand, so the hook loads only its own code and never the command-line parser. Node's startup
// on Windows is mostly loading many small files. The chunks sit next to main.js, so paths relative
// to import.meta.url (../../package.json, ../../dist/ui/) hold as they do from src/. The licences
// of the bundled libraries go to dist/cli/THIRD-PARTY-LICENSES.md.
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { removeFolder } from "../src/core/copy-folder.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
removeFolder(fileURLToPath(new URL("../dist/", import.meta.url)));
await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    ssr: "src/cli/main.ts",
    outDir: "dist/cli",
    target: "node22",
    minify: false,
    license: { fileName: "THIRD-PARTY-LICENSES.md" },
    rollupOptions: { output: { entryFileNames: "main.js", chunkFileNames: "[name]-[hash].js" } },
  },
  ssr: { noExternal: true, target: "node" },
  // The MCP SDK's default validator, without ajv's generated code (src/mcp/sdk-shims.ts).
  resolve: { alias: [{ find: /^@modelcontextprotocol\/server\/_shims$/, replacement: fileURLToPath(new URL("../src/mcp/sdk-shims.ts", import.meta.url)) }] },
});
// Libraries inlined in another package's own files are bundled without a package.json of their own,
// so Vite can't list them: their notices are kept in scripts/licenses-inlined.md (decision 0034).
appendFileSync(new URL("../dist/cli/THIRD-PARTY-LICENSES.md", import.meta.url), readFileSync(new URL("licenses-inlined.md", import.meta.url), "utf8"));
