// magpie adopt <name> (spec §2): copies a note from the personal journal into the project journal
// and names the install command, unless the note's Verdict says to avoid the package. It never installs anything. Returns the --json document, which the
// CLI prints and the local app's API returns as is (decision 0023). Writes one note; never prints.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { PackageURL } from "packageurl-js";
import { fileNameClash, readablePurl, type PackageType } from "./identity.ts";
import { createJournal, listNotes, noteFor } from "./journals.ts";
import { readNote } from "./note.ts";
import type { Outcome } from "./outcome.ts";
import { verdictSaysAvoid } from "./recall.ts";
import { locateJournal, resolveInput, type Context } from "./save.ts";
import { setToolFields } from "./write.ts";

export interface AdoptRequest {
  target: string; // a package name, a PURL or a URL
  type?: PackageType;
}

// The --json document of magpie adopt (spec §2).
export interface AdoptJson {
  id: string | null;
  from: string | null;
  to: string | null;
  install: string | null; // null when there is no single command (see install_choices), and on failure
  install_choices: string[]; // a repository note with several packages: one command per package
  error?: string;
}

export interface AdoptRun {
  outcome: Outcome;
  document: AdoptJson;
  name: string | null; // the note's name, for people
  url: string | null; // a GitHub repository's URL, for one without packages
  avoid: boolean; // the Verdict says to avoid the package, so no install command is named
  notices: string[]; // things done on the way, such as creating the project journal
  warnings: string[];
}

export async function runAdopt(request: AdoptRequest, context: Context, ask?: (question: string) => Promise<string>): Promise<AdoptRun> {
  const personal = locateJournal("personal", context);
  const warnings = personal.warnings;
  const stop = (error: string, outcome: Outcome, document: Partial<AdoptJson> = {}): AdoptRun =>
    ({ outcome, document: { id: null, from: null, to: null, install: null, install_choices: [], ...document, error }, name: null, url: null, avoid: false, notices: [], warnings });

  const resolved = await resolveInput(request.target, request.type, context.cwd, ask);
  if (!resolved.ok) return stop(resolved.error, "usage");
  const source = noteFor(listNotes(personal.path), resolved.purl);
  const readable = readablePurl(resolved.purl);
  if (!source?.id) return stop(`Your personal journal has no note for ${readable}. Write one first with magpie note ${readable}.`, "failed");

  const project = locateJournal("project", context);
  if (project.error) return stop(project.error, "failed", { id: source.id, from: source.path });
  const to = join(project.path, "notes", basename(source.path));
  const found = { id: source.id, from: source.path, to };

  // One note per subject (schema rule 6): the project may already have it under any of its PURLs.
  const projectNotes = listNotes(project.path);
  const there = [source.id, ...source.packages].map((purl) => noteFor(projectNotes, purl)).find((entry) => entry);
  if (there) return stop(`Already in this project: ${there.path}`, "failed", { ...found, to: there.path });
  if (existsSync(to)) {
    const clash = fileNameClash(source.id, projectNotes.find((entry) => entry.path === to)?.id);
    return stop(clash ?? `${to} has no readable id, so it was left unchanged.`, "failed", found);
  }

  const text = readFileSync(source.path, "utf8");
  const copy = setToolFields(text, { adopted: context.today() });
  const notices: string[] = [];
  try {
    if (createJournal(project.path, "project")) notices.push(`Created the project journal: ${project.path}`);
    writeFileSync(to, copy.text, { flag: "wx" }); // never over a file that appeared meanwhile
  } catch (error) {
    return stop(`Couldn't write ${to}: ${(error as Error).message}`, "failed", found);
  }

  // A repository named by itself: its packages decide. One is the command; several are choices.
  // A Verdict that says to avoid the package gets no command at all.
  const { frontmatter, verdict } = readNote(text);
  const avoid = verdictSaysAvoid(verdict);
  const root = dirname(project.path);
  const commands = avoid ? [] : (resolved.purl.startsWith("pkg:github/") ? source.packages : [resolved.purl])
    .map((purl) => installCommand(purl, root))
    .filter((command): command is string => command !== null);
  const install = commands.length === 1 ? commands[0] : null;
  return {
    outcome: "ok",
    document: { ...found, install, install_choices: commands.length > 1 ? commands : [] },
    name: typeof frontmatter.name === "string" ? frontmatter.name : readablePurl(source.id),
    url: resolved.purl.startsWith("pkg:github/") ? repositoryUrl(resolved.purl) : null,
    avoid,
    notices,
    warnings: [...warnings, ...copy.warnings],
  };
}

// The install command for a package (spec §2 adopt, step 5), from its PURL type and the lockfile in
// the project root. A GitHub repository has none.
export function installCommand(purl: string, projectRoot: string): string | null {
  const p = PackageURL.fromString(purl);
  const name = p.namespace ? `${p.namespace}/${p.name}` : p.name;
  const has = (file: string) => existsSync(join(projectRoot, file));
  if (p.type === "npm") {
    const tool = has("pnpm-lock.yaml") ? "pnpm add" : has("yarn.lock") ? "yarn add" : has("bun.lock") || has("bun.lockb") ? "bun add" : "npm install";
    return `${tool} ${name}`;
  }
  if (p.type === "pypi") return `${has("uv.lock") ? "uv add" : "pip install"} ${name}`;
  if (p.type === "cargo") return `cargo add ${name}`;
  return null;
}

function repositoryUrl(purl: string): string {
  const p = PackageURL.fromString(purl);
  return `https://github.com/${p.namespace}/${p.name}`;
}
