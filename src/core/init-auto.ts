// repomagpie init --auto (spec §2): the project's dependencies, read from its manifests as suggest
// reads them, in three groups by what the user's journals say about each: an avoid note, a note, no
// note. Reads only; the CLI asks for Verdicts in a terminal and saves them through runNote. Never
// prints.
import type { PackageType } from "./identity.ts";
import type { Place } from "./journals.ts";
import { readProject } from "./manifests.ts";
import type { Outcome } from "./outcome.ts";
import { isAvoid, openRecallSources, recall, type RecallSource } from "./recall.ts";
import { CAPS, clean, forAgent } from "./text.ts";

// A dependency with a note: the first note recall finds for it (the project journal first).
export interface NotedDependency {
  name: string;
  type: PackageType;
  id: string;
  journal: RecallSource["scope"];
  confidence: "exact" | "name-only";
  verdict: string | null; // null for a note without a Verdict (inbox)
  status: "inbox" | "reviewed";
  path: string;
}

// The --json document of repomagpie init --auto.
export interface InitAutoJson {
  folder: string;
  manifests: string[];
  dependencies: number; // each once
  avoid: NotedDependency[]; // an avoid note: named first
  noted: NotedDependency[];
  none: { name: string; type: PackageType }[];
  error?: string;
}

export interface InitAutoRun {
  outcome: Outcome;
  document: InitAutoJson;
  warnings: string[];
}

const NOTED_CAPS = { name: CAPS.name, id: CAPS.id, verdict: CAPS.verdict, path: Infinity };

export function runInitAuto(place: Place): InitAutoRun {
  // A cloned repository's manifests are written by strangers (decision 0032): names cleaned first.
  const project = readProject(place.cwd, place.home);
  const dependencies = project.dependencies.map((d) => ({ ...d, name: clean(d.name) }));
  const document: InitAutoJson = { folder: project.folder, manifests: project.manifests, dependencies: dependencies.length, avoid: [], noted: [], none: [] };
  if (!project.manifests.length) {
    document.error = `No package.json, pyproject.toml or Cargo.toml in ${project.folder}. Run repomagpie init --auto in a project folder.`;
    return { outcome: "usage", document, warnings: [] };
  }
  const { sources, warnings } = openRecallSources({ home: place.home, env: place.env, cwd: place.cwd, homeFlag: place.homeFlag, projectFlag: place.projectFlag });
  for (const dependency of dependencies) {
    const matches = recall(sources, dependency.name, [dependency.type]);
    if (!matches.length) {
      document.none.push(dependency);
      continue;
    }
    // An avoid note in either journal puts the dependency first, whatever the other one says.
    const match = matches.find(isAvoid) ?? matches[0];
    const noted = forAgent({ name: dependency.name, type: dependency.type, id: match.id, journal: match.journal, confidence: match.confidence, verdict: match.verdict, status: match.status, path: match.path }, NOTED_CAPS);
    (isAvoid(match) ? document.avoid : document.noted).push(noted);
  }
  return { outcome: "ok", document, warnings };
}
