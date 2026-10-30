// Builds the local app (decision 0022) into dist/ui/, which magpie ui serves (docs/ui.md).
// The server serves the page at / and every other file flat under /assets/<file>, so the bundle's
// files are written next to index.html and referenced from /assets/.
//
// Development: `npm run dev:ui` with MAGPIE_UI_URL set to the URL a running `magpie ui --no-open`
// printed (unused: the link works once). Vite's dev server then forwards /api to it, with the session
// cookie, the write token header and the Origin that server expects. The dev server has no CSP; magpie
// ui's server always sends one.
//
// Licences: the notices of the bundled libraries go to dist/ui/THIRD-PARTY-LICENSES.md, and the
// icons' notice (copied paths, not a package) to dist/ui/icons-LICENSE.txt, so both ship with the app.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

function iconsLicense(): Plugin {
  return {
    name: "magpie-icons-license",
    apply: "build",
    generateBundle() {
      const source = readFileSync(new URL("src/icons-LICENSE.txt", import.meta.url), "utf8");
      this.emitFile({ type: "asset", fileName: "icons-LICENSE.txt", source });
    },
  };
}

// The printed URL works once: it is exchanged here, as a browser would, for the session cookie,
// and the page's meta tag gives the write token.
async function apiProxy(): Promise<Record<string, ProxyOptions> | undefined> {
  const raw = process.env.MAGPIE_UI_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  const target = `${url.protocol}//${url.host}`;
  const exchange = await fetch(raw, { redirect: "manual" });
  const cookie = (exchange.headers.getSetCookie()[0] ?? "").split(";")[0];
  if (exchange.status !== 303 || !cookie) throw new Error(`MAGPIE_UI_URL: the exchange answered ${exchange.status}. Start repomagpie ui --no-open again and use the new URL.`);
  const page = await (await fetch(`${target}/`, { headers: { cookie } })).text();
  const token = /<meta name="magpie-token" content="([0-9a-f]*)">/.exec(page)?.[1] ?? "";
  return {
    "/api": {
      target,
      changeOrigin: true,
      headers: { origin: target, cookie, "x-magpie-token": token },
    },
  };
}

export default defineConfig(async ({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: command === "build" ? "/assets/" : "/",
  plugins: [react(), iconsLicense()],
  build: {
    outDir: fileURLToPath(new URL("../dist/ui/", import.meta.url)),
    emptyOutDir: true,
    assetsDir: "",
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    license: { fileName: "THIRD-PARTY-LICENSES.md" },
  },
  server: { proxy: command === "serve" ? await apiProxy() : undefined },
}));
