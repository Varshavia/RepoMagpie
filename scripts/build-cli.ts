// Builds the CLI for publishing (spec §9, decision 0025): src/cli/main.ts and everything it imports,
// the libraries included, bundled by Vite into dist/cli/: main.js, and beside it the chunks it loads
// on demand, so the hook loads only its own code and never the command-line parser. Node's startup
// on Windows is mostly loading many small files. The chunks sit next to main.js, so paths relative
// to import.meta.url (../../package.json, ../../dist/ui/) hold as they do from src/. The licences
// of the bundled libraries go to dist/cli/THIRD-PARTY-LICENSES.md.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
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
});
