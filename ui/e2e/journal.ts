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

export interface Journal {
  root: string;
  journal: string;
  project: string;
  note: (file: string, scope?: "personal" | "project") => string;
}

// generated: that many generated notes instead of the example notes; empty: no notes at all.
export function makeJournal(options: { generated?: number; empty?: boolean } = {}): Journal {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "journal-"));
  mkdirSync(join(root, ".git")); // a fence: no walk for a git root or .magpie leaves the folder
  const journal = join(root, "journal");
  const project = join(root, "project");
  const notes = join(journal, "notes");
  mkdirSync(notes, { recursive: true });
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(join(project, ".magpie", "notes"), { recursive: true });
  writeFileSync(join(journal, "tags.md"), readFileSync(join(VAULT, "tags.md")));

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
    writeFileSync(join(notes, "npm--pdfkit.md"), PDFKIT);
    writeFileSync(join(notes, "npm--broken.md"), "---\nid: [broken\n---\n\n## Verdict\nsomething\n");
    writeFileSync(
      join(project, ".magpie", "notes", "npm--puppeteer.md"),
      renderNote({ id: "pkg:npm/puppeteer", name: "puppeteer", explored: "2026-10-02", kind: "library", tags: [], verdict: "default for PDF rendering in new projects" }),
    );
  }
  return {
    root,
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
  const env: Record<string, string | undefined> = { ...process.env, MAGPIE_HOME: j.journal };
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
