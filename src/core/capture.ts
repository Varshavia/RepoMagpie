// What `magpie note` and `magpie import` write for one item (spec §2): a new note, or an update
// to an existing one that never overwrites human-owned content (schema rule 2).
// Pure: text in, text out. The caller finds the existing note, fetches metadata and writes the file.
import { PackageURL } from "packageurl-js";
import { draftKind, type RepoMetadata } from "./github.ts";
import { readNote, type SectionName } from "./note.ts";
import { topicTags, type KnownTags } from "./topic-tags.ts";
import { addSectionItems, appendSkillLine, renderNote, setToolFields, setVerdict } from "./write.ts";

export interface CaptureInput {
  purl: string;
  source: string; // what the user typed: keeps a GitHub name's case when there is no metadata
  skillPath?: string; // from a skill URL
  verdict?: string; // the user's own words (decision 0018)
  useWhen?: string[]; // import's use: text, written as a draft
  avoidWhen?: string[]; // import's avoid: text, written as a draft
  ownUseWhen?: string[]; // note's --use-when: the user's own items, never a draft
  ownAvoidWhen?: string[]; // note's --avoid-when: the user's own items, never a draft
  myNotes?: string; // import's unlabelled text
  metadata: RepoMetadata | null; // GitHub metadata; null when not fetched or the fetch failed
  today: string; // YYYY-MM-DD
  known: KnownTags; // for ranking the topics that become a new note's tags (decision 0030)
  tags?: string[]; // a new note's tags as the user chose them in Add's preview, in place of the draft
}

export interface Capture {
  result: "created" | "updated" | "unchanged" | "failed";
  text: string | null; // the text to write; null when nothing is written
  tags: string[]; // the tags a created note was written with; none otherwise
  name: string | null;
  status: "inbox" | "reviewed" | null;
  error: string | null;
  warnings: string[];
  items: Items; // what the user's own --use-when and --avoid-when items did
}

export type ListName = "use_when" | "avoid_when";
export interface Items {
  changed: ListName[]; // the sections written
  draftsReplaced: ListName[]; // sections whose draft the user's items replaced
  present: string[]; // items a section already had, so not written again
}
const noItems = (): Items => ({ changed: [], draftsReplaced: [], present: [] });

export function captureNote(existing: string | null, input: CaptureInput): Capture {
  if (input.verdict !== undefined && /[\r\n]/.test(input.verdict.trim())) {
    return { result: "failed", text: null, tags: [], name: null, status: null, error: "The Verdict must be one line of text.", warnings: [], items: noItems() };
  }
  return existing === null ? create(input) : update(existing, input);
}

// The user's own items, each once (ignoring case), without blank ones.
function own(items: string[] | undefined): string[] {
  const out: string[] = [];
  for (const item of (items ?? []).map((i) => i.trim())) if (item && !out.some((o) => o.toLowerCase() === item.toLowerCase())) out.push(item);
  return out;
}

function create(input: CaptureInput): Capture {
  const m = input.metadata;
  const name = m?.name ?? displayName(input.purl, input.source);
  const skills = [...(m?.skills ?? [])];
  const skill = skillName(input.skillPath);
  if (skill && !skills.includes(skill)) skills.push(skill);
  const useWhen = own(input.ownUseWhen);
  const avoidWhen = own(input.ownAvoidWhen);
  // The user's own items are human-written; import's use: and avoid: text is a draft (schema rule 7).
  const drafts: SectionName[] = ["What it does", ...(useWhen.length ? [] : ["Use when" as const]), ...(avoidWhen.length ? [] : ["Avoid when" as const])];
  const items: Items = { changed: [...(useWhen.length ? ["use_when" as const] : []), ...(avoidWhen.length ? ["avoid_when" as const] : [])], draftsReplaced: [], present: [] };
  const tags = input.tags ?? (m ? topicTags(m.topics, input.purl, input.known) : []);
  const text = renderNote({
    id: input.purl,
    name,
    url: m?.url ?? registryUrl(input.purl, name),
    language: m?.language ?? undefined,
    license: m?.license,
    topics: m?.topics,
    packages: m?.packages ?? undefined,
    explored: input.today,
    kind: m ? draftKind(m) : startingKind(input.purl),
    tags,
    verdict: input.verdict,
    whatItDoes: m?.description ?? undefined,
    useWhen: useWhen.length ? useWhen : input.useWhen,
    avoidWhen: avoidWhen.length ? avoidWhen : input.avoidWhen,
    myNotes: input.myNotes,
    skills,
    drafts,
  });
  return { result: "created", text, tags, name, status: readNote(text).status, error: null, warnings: [], items };
}

function update(existing: string, input: CaptureInput): Capture {
  const before = readNote(existing);
  const name = typeof before.frontmatter.name === "string" ? before.frontmatter.name : null;
  const failed = (error: string): Capture => ({ result: "failed", text: null, tags: [], name, status: before.status, error, warnings: [], items: noItems() });
  if (input.verdict?.trim() && before.verdict) return failed("This note already has a Verdict; edit the file to change it.");

  const warnings: string[] = [];
  if (input.useWhen?.length || input.avoidWhen?.length || input.myNotes?.trim()) {
    warnings.push("The note already exists, so its use:, avoid: and unlabelled text were ignored; those sections are yours to edit.");
  }
  if (input.tags) warnings.push("The note already exists, so its tags were not changed; edit them in the note.");
  let text = existing;
  const m = input.metadata;
  if (m) {
    const fields = setToolFields(text, {
      name: m.name,
      url: m.url,
      language: m.language,
      license: m.license,
      topics: m.topics,
      ...(m.packages ? { packages: m.packages } : {}),
    });
    text = fields.text;
    warnings.push(...fields.warnings);
  }
  for (const skill of [...(m?.skills ?? []), skillName(input.skillPath)]) {
    if (!skill) continue;
    const added = appendSkillLine(text, skill);
    text = added.text;
    warnings.push(...added.warnings);
  }
  if (input.verdict?.trim()) {
    const written = setVerdict(text, input.verdict);
    if (!written.changed) return failed(written.warnings[0]);
    text = written.text;
  }
  // The user's own items, in the same write: a section that can't take them fails the whole note.
  const items = noItems();
  for (const [section, list, given] of [["Use when", "use_when", input.ownUseWhen], ["Avoid when", "avoid_when", input.ownAvoidWhen]] as const) {
    if (!own(given).length) continue;
    const added = addSectionItems(text, section, own(given));
    if (added.warnings.length) return failed(added.warnings[0]);
    text = added.text;
    if (added.changed) items.changed.push(list);
    if (added.replacedDraft) items.draftsReplaced.push(list);
    items.present.push(...added.present);
  }
  const changed = text !== existing;
  return { result: changed ? "updated" : "unchanged", text: changed ? text : null, tags: [], name, status: readNote(text).status, error: null, warnings: [...new Set(warnings)], items };
}

// The kind of a note made without GitHub data (decision 0039): a registry package (npm, PyPI,
// Cargo) is a published package, as decision 0030's rule 9; a GitHub repository whose fetch
// failed or was skipped says nothing about itself.
function startingKind(purl: string): string {
  return PackageURL.fromString(purl).type === "github" ? "other" : "library";
}

// The name people know a subject by: owner/repo for GitHub (with the case typed in a URL),
// @scope/name for npm, the package name otherwise.
function displayName(purl: string, source: string): string {
  const p = PackageURL.fromString(purl);
  if (p.type === "github") {
    const typed = source.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
    return typed ? `${typed[1]}/${typed[2].replace(/\.git$/, "")}` : `${p.namespace}/${p.name}`;
  }
  return p.namespace ? `${p.namespace}/${p.name}` : p.name;
}

// The subject's page: the repository, or the package on its registry.
function registryUrl(purl: string, name: string): string {
  const type = purl.slice(4, purl.indexOf("/"));
  if (type === "github") return `https://github.com/${name}`;
  if (type === "npm") return `https://www.npmjs.com/package/${name}`;
  if (type === "pypi") return `https://pypi.org/project/${name}/`;
  return `https://crates.io/crates/${name}`;
}

function skillName(skillPath: string | undefined): string | undefined {
  return skillPath?.split("/").filter((part) => part).at(-1);
}
