import { readFileSync } from "node:fs";

// The version in package.json. The relative path is the same from src/core/ and dist/cli/ (the bundle).
export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}
