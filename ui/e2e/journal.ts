// End-to-end fixtures: a temporary journal under <repo>/.scratch/e2e/ (never the OS temp folder, never
// the real ~/.magpie), and magpie ui started on it from the source, serving the built app in dist/ui/.
// The journal holds the example vault's notes, some of them back in the inbox, a note that can't be
// read, and a project journal with one note. No network: nothing here fetches from GitHub.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderNote } from "../../src/core/write.ts";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const VAULT = join(REPO, "examples", "vault");
export const SCRATCH = join(REPO, ".scratch", "e2e");

// Example notes that go back to the inbox: the Verdict is emptied, the drafts stay.
const TO_INBOX = ["github--microsoft--playwright-cli.md", "github--voltagent--awesome-design-md.md", "github--egonex-ai--understand-anything.md"];

export const PDFKIT = renderNote({
  id: "pkg:npm/pdfkit",
  name: "pdfkit",
  explored: "2026-10-03",
  kind: "library",
  tags: [],
  verdict: "avoid: async streams painful; use puppeteer",
  avoidWhen: ["you need streamed output for large PDFs"],
});

// For the screenshots (screens.spec.ts): real-looking npm notes beside the example vault's, so every
// screen shows a journal as a person keeps one: full sections, tried and rating, an inbox draft.
const SCREEN_NOTES: Record<string, string> = {
  "npm--pdfkit.md": renderNote({
    id: "pkg:npm/pdfkit",
    name: "pdfkit",
    explored: "2026-09-12",
    kind: "library",
    tags: [],
    tried: true,
    rating: 2,
    verdict: "avoid: async streams painful; use puppeteer",
    useWhen: ["a small, synchronous PDF with a few lines of text"],
    avoidWhen: ["you need streamed output for large PDFs", "the layout comes from HTML and CSS"],
    whatItDoes: "A PDF generation library for Node and the browser, with a drawing API for text, vectors and images.",
    myNotes: "Tried it for the invoice export in September. Piping the document into a stream and awaiting the end took a day of debugging; [[puppeteer]] printed the existing HTML template in an hour.",
  }).replace("status: reviewed\n", 'status: reviewed\nalternatives: ["[[puppeteer]]", "[[pdf-lib]]"]\n'),
  "npm--zod.md": renderNote({
    id: "pkg:npm/zod",
    name: "zod",
    url: "https://github.com/colinhacks/zod",
    license: "MIT",
    explored: "2026-08-30",
    kind: "library",
    tags: [],
    tried: true,
    rating: 5,
    verdict: "Default for validating API input in TypeScript; infer the types from the schema.",
    useWhen: ["parsing request bodies, config files or anything else from outside the program"],
    avoidWhen: ["a hot path parses millions of small objects; a hand-written check is faster"],
    whatItDoes: "Schema declaration and validation, with static types inferred from the schema.",
    myNotes: "Error messages need a formatter before they reach users; z.prettifyError is enough for CLIs.",
    related: "- [[npm--commander|commander]] for the CLI that reads the config",
  }),
  "npm--commander.md": renderNote({
    id: "pkg:npm/commander",
    name: "commander",
    url: "https://github.com/tj/commander.js",
    license: "MIT",
    explored: "2026-09-20",
    kind: "library",
    tags: [],
    tried: true,
    rating: 4,
    verdict: "Fine for small CLIs; choices and help come for free.",
    useWhen: ["a CLI with a handful of commands and flags"],
    whatItDoes: "Command-line parsing for Node: commands, options, choices and generated help.",
  }),
  "npm--vitest.md": renderNote({
    id: "pkg:npm/vitest",
    name: "vitest",
    url: "https://github.com/vitest-dev/vitest",
    license: "MIT",
    explored: "2026-09-02",
    kind: "library",
    tags: ["testing"],
    useWhen: ["a Vite project that needs unit tests with a Jest-like API"],
    whatItDoes: "A test runner built on Vite, with a Jest-compatible API, watch mode and in-source tests.",
    drafts: ["Use when", "What it does"],
  }),
};

// A note whose frontmatter can't be read: shown read-only.
export const BROKEN_FILE = "npm--broken.md";
export const BROKEN = "---\nid: [broken\n---\n\n## Verdict\nsomething\n";

export interface Journal {
  root: string;
  home: string; // the home directory magpie ui runs with (HOME, USERPROFILE): never the real one
  journal: string;
  project: string;
  note: (file: string, scope?: "personal" | "project") => string;
}

// generated: that many generated notes instead of the example notes; empty: no notes at all;
// screens: the example notes with SCREEN_NOTES, and no unreadable note.
export function makeJournal(options: { generated?: number; empty?: boolean; screens?: boolean } = {}): Journal {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "journal-"));
  mkdirSync(join(root, ".git")); // a fence: no walk for a git root or .magpie leaves the folder
  // A fake home, so the app shows paths as ~/.magpie/notes/… and nothing of the machine it runs on
  // (screenshots), and magpie never reads the real ~/.magpie/config.yaml.
  const home = join(root, "home");
  const journal = join(home, ".magpie");
  const project = join(home, "code", "app");
  const notes = join(journal, "notes");
  mkdirSync(notes, { recursive: true });
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(join(project, ".magpie", "notes"), { recursive: true });
  writeFileSync(join(journal, "tags.md"), readFileSync(join(VAULT, "tags.md"), "utf8").replace(/\r\n/g, "\n")); // LF, like the notes below

  if (options.empty) {
    // tags.md only
  } else if (options.generated) {
    for (let i = 0; i < options.generated; i++) {
      const inbox = i % 5 === 0;
      writeFileSync(
        join(notes, `npm--package-${String(i).padStart(4, "0")}.md`),
        renderNote({ id: `pkg:npm/package-${String(i).padStart(4, "0")}`, name: `package-${String(i).padStart(4, "0")}`, explored: "2026-10-04", kind: "library", tags: ["testing"], verdict: inbox ? undefined : `fine for test ${i}; keep an eye on releases` }),
      );
    }
  } else {
    for (const file of readdirSync(join(VAULT, "notes"))) {
      // LF, as .gitattributes stores them; a Windows checkout may have CRLF.
      let text = readFileSync(join(VAULT, "notes", file), "utf8").replace(/\r\n/g, "\n");
      if (TO_INBOX.includes(file)) text = text.replace(/## Verdict\n[^\n#][^\n]*\n/, "## Verdict\n").replace("status: reviewed", "status: inbox");
      writeFileSync(join(notes, file), text);
    }
    if (options.screens) {
      for (const [file, text] of Object.entries(SCREEN_NOTES)) writeFileSync(join(notes, file), text);
    } else {
      writeFileSync(join(notes, "npm--pdfkit.md"), PDFKIT);
      writeFileSync(join(notes, BROKEN_FILE), BROKEN);
    }
    writeFileSync(
      join(project, ".magpie", "notes", "npm--puppeteer.md"),
      renderNote({ id: "pkg:npm/puppeteer", name: "puppeteer", explored: "2026-10-02", kind: "library", tags: [], verdict: "default for PDF rendering in new projects" }),
    );
  }
  return {
    root,
    home,
    journal,
    project,
    note: (file, scope = "personal") => (scope === "personal" ? join(notes, file) : join(project, ".magpie", "notes", file)),
  };
}

export interface Running {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

// magpie ui --no-open --json, from the source, on the journal; resolves once it prints its URL.
export function startMagpie(j: Journal): Promise<Running> {
  const env: Record<string, string | undefined> = { ...process.env, HOME: j.home, USERPROFILE: j.home, MAGPIE_HOME: j.journal };
  delete env.GITHUB_TOKEN;
  const child: ChildProcess = spawn(process.execPath, [join(REPO, "src", "cli", "main.ts"), "ui", "--no-open", "--json"], { cwd: j.project, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stderr?.on("data", (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => reject(new Error(`magpie ui exited with ${code}: ${err}`)));
    child.stdout?.on("data", (chunk) => {
      out += chunk;
      const line = out.split("\n")[0];
      if (!out.includes("\n")) return;
      const { url, port } = JSON.parse(line) as { url: string; port: number };
      child.removeAllListeners("exit");
      resolve({
        url,
        port,
        // Safe to call twice (a test may stop the server itself).
        stop: () =>
          new Promise((done) => {
            if (child.exitCode !== null || child.signalCode !== null) return done();
            child.once("exit", () => done());
            child.kill();
          }),
      });
    });
  });
}

export function removeJournal(j: Journal): void {
  rmSync(j.root, { recursive: true, force: true });
}
