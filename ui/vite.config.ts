// Builds the local app (decision 0022) into dist/ui/, which magpie ui serves (docs/ui.md).
// The server serves the page at / and every other file flat under /assets/<file>, so the bundle's
// files are written next to index.html and referenced from /assets/.
//
// Development: `npm run dev:ui` with MAGPIE_UI_URL set to the URL a running `magpie ui --no-open`
// printed. Vite's dev server then forwards /api to it, with the session cookie, the token header and
// the Origin that server expects. The dev server has no CSP; magpie ui's server always sends one.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

function apiProxy(): Record<string, ProxyOptions> | undefined {
  const raw = process.env.MAGPIE_UI_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  const token = url.searchParams.get("token") ?? "";
  const target = `${url.protocol}//${url.host}`;
  return {
    "/api": {
      target,
      changeOrigin: true,
      headers: { origin: target, cookie: `magpie_${url.port}=${token}`, "x-magpie-token": token },
    },
  };
}

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: command === "build" ? "/assets/" : "/",
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("../dist/ui/", import.meta.url)),
    emptyOutDir: true,
    assetsDir: "",
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
  },
  server: { proxy: apiProxy() },
}));
