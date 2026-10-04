// Test helper: runs magpie in a temporary home, journal and project, with recorded responses
// instead of the network. The real home directory is never used.
// Not part of the build (tsconfig.build.json excludes fixtures/).
import { after } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { fakeFetch } from "../../core/fixtures/fake-fetch.ts";
import { run, type Io } from "../program.ts";

const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

// A temporary folder with home/, project/.git and the given files (null: a folder).
// The personal journal is <root>/journal (MAGPIE_HOME), created by the first write.
export function sandbox(files: Record<string, string | null> = {}) {
  const root = mkdtempSync(join(tmpdir(), "magpie-cli-"));
  roots.push(root);
  for (const [path, content] of Object.entries({ "home/": null, "project/.git/": null, ...files })) {
    const full = join(root, path);
    if (content === null) mkdirSync(full, { recursive: true });
    else {
      mkdirSync(parse(full).dir, { recursive: true });
      writeFileSync(full, content);
    }
  }
  return {
    root,
    journal: join(root, "journal"),
    home: join(root, "home"),
    project: join(root, "project"),
    note: (name: string) => join(root, "journal", "notes", name),
  };
}

export type Box = ReturnType<typeof sandbox>;

export async function magpie(box: Box, argv: string[], over: Partial<Io> = {}) {
  let out = "";
  let err = "";
  const io: Io = {
    out: (s) => { out += s; },
    err: (s) => { err += s; },
    env: { MAGPIE_HOME: box.journal },
    cwd: box.project,
    home: box.home,
    fetch: fakeFetch({}),
    today: () => "2026-10-04",
    interactive: false,
    ask: () => Promise.reject(new Error("no prompt expected")),
    ...over,
  };
  const code = await run(argv, io);
  return { code, out, err };
}
