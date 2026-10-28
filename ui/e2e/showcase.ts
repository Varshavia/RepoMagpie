// The showcase journal, for the README's screenshots only (readme-shots.spec.ts): about 45 notes a
// person could keep, so the graph has labels a reader can follow. The example vault's notes and the
// screens notes (journal.ts), the public repositories of the retrieval baseline
// (scripts/fixtures/retrieval.json) written as an import writes them, from that metadata only, and
// a few npm notes. Verdicts on real projects say what the note is for, never how good a project is;
// the one avoid note is pdfkit. No network: nothing here fetches.
import { readFileSync } from "node:fs";
import { captureNote } from "../../src/core/capture.ts";
import { countSkillFolders, type RepoMetadata } from "../../src/core/github.ts";
import { fileNameFor, resolveTarget } from "../../src/core/identity.ts";
import { renderNote } from "../../src/core/write.ts";

interface Repository { full_name: string; description: string | null; topics: string[]; language: string | null; license: string; is_template: boolean }
interface Kind { full_name: string; skill_md: string[]; packages?: string[]; plugin?: boolean; bin?: boolean }

const fixture = JSON.parse(readFileSync(new URL("../../scripts/fixtures/retrieval.json", import.meta.url), "utf8")) as { repositories: Repository[] };
const kinds = (JSON.parse(readFileSync(new URL("../../src/core/fixtures/kinds.json", import.meta.url), "utf8")) as { repositories: Kind[] }).repositories;

// The tag list: the example vault's, and the tags these notes add.
export const SHOWCASE_TAGS = `
- \`ai-agents\` — agents and the models behind them
- \`cli\` — command-line tools
- \`crawling\` — turning web pages into data
- \`database\` — databases and backends
- \`pdf\` — making and editing PDFs
- \`self-hosting\` — services run on my own server
`;

// Suggested domains for the example notes the showcase puts back in the inbox, as a capture from
// GitHub suggests them, so the inbox review shows them.
export const SHOWCASE_SUGGESTED: Record<string, string[]> = {
  "github--egonex-ai--understand-anything.md": ["ai", "tooling"],
};

const stem = (fullName: string) => fileNameFor(`pkg:github/${fullName.toLowerCase()}`).replace(/\.md$/, "");
const link = (fullName: string) => `[[${stem(fullName)}|${fullName.split("/")[1]}]]`;

// Per repository: its tags, a Verdict (none: an inbox note), and optional links and alternatives.
// Left out: repositories the example vault has, and the ones the npm notes below stand for.
const NOTES: Record<string, { tags: string[]; verdict?: string; myNotes?: string; alternatives?: string[]; explored: string }> = {
  "coollabsio/coolify": { tags: ["self-hosting"], verdict: "use for deploying side projects to my own server", explored: "2026-08-14" },
  "OpenHands/OpenHands": { tags: ["ai-agents"], explored: "2026-10-12" },
  "getmaxun/maxun": { tags: ["crawling", "browser-automation"], explored: "2026-10-13" },
  "open-webui/open-webui": { tags: ["ai-agents", "self-hosting"], verdict: "use as the chat interface for local models", myNotes: `Runs against ${link("ollama/ollama")} on the home server.`, explored: "2026-09-03" },
  "browser-use/browser-use": { tags: ["ai-agents", "browser-automation"], verdict: "use when an agent should drive a real browser from Python", explored: "2026-09-18" },
  "langflow-ai/langflow": { tags: ["ai-agents", "workflow"], verdict: "use for sketching an LLM pipeline visually before writing it", explored: "2026-09-09" },
  "supabase/supabase": { tags: ["database"], verdict: "use for Postgres, auth and storage behind one API", explored: "2026-08-21" },
  "Stirling-Tools/Stirling-PDF": { tags: ["pdf", "self-hosting"], verdict: "use for merging and converting PDFs by hand", explored: "2026-09-25" },
  "unclecode/crawl4ai": { tags: ["crawling", "ai-agents"], verdict: "use for turning a few web pages into Markdown for a model", alternatives: [link("firecrawl/firecrawl")], explored: "2026-09-27" },
  "langgenius/dify": { tags: ["ai-agents", "workflow"], verdict: "use for an LLM app that people outside the team edit", alternatives: [link("langflow-ai/langflow")], explored: "2026-09-10" },
  "microsoft/playwright": { tags: ["testing", "browser-automation"], verdict: "default for end-to-end tests of web apps", myNotes: `For checks an agent runs, see ${link("microsoft/playwright-cli")}.`, explored: "2026-08-05" },
  "ollama/ollama": { tags: ["ai-agents", "cli"], verdict: "use for running open models locally", explored: "2026-09-02" },
  "n8n-io/n8n": { tags: ["workflow", "self-hosting"], verdict: "use for automations between web services", explored: "2026-08-28" },
  "meilisearch/meilisearch": { tags: ["database", "self-hosting"], verdict: "use for search inside an app's own content", explored: "2026-09-14" },
  "excalidraw/excalidraw": { tags: ["design"], verdict: "use for quick architecture sketches", explored: "2026-08-11" },
  "pocketbase/pocketbase": { tags: ["database", "self-hosting"], verdict: "use for a small app's backend in one binary", explored: "2026-09-21" },
  "umami-software/umami": { tags: ["self-hosting", "frontend"], verdict: "use for page analytics on my own server", explored: "2026-09-29" },
  "jgm/pandoc": { tags: ["cli"], verdict: "use for converting Markdown to Word and PDF", explored: "2026-08-19" },
  "yt-dlp/yt-dlp": { tags: ["cli"], verdict: "use for saving conference talks to watch offline", explored: "2026-10-02" },
  "immich-app/immich": { tags: ["self-hosting"], explored: "2026-10-14" },
  "prisma/orm": { tags: ["database"], verdict: "use for typed database access in TypeScript", explored: "2026-08-25" },
  "firecrawl/firecrawl": { tags: ["crawling", "ai-agents"], verdict: "use for crawling a whole site into Markdown", explored: "2026-09-28" },
  "lovell/sharp": { tags: ["frontend"], verdict: "use for resizing images in a Node build step", explored: "2026-09-06" },
  "caddyserver/caddy": { tags: ["self-hosting"], verdict: "use as the reverse proxy, with HTTPS certificates handled", myNotes: `${link("pocketbase/pocketbase")} and ${link("umami-software/umami")} run behind it.`, explored: "2026-08-30" },
  "louislam/uptime-kuma": { tags: ["self-hosting"], verdict: "use for uptime checks of the services on the home server", explored: "2026-09-30" },
};

const NPM = (name: string, explored: string, tags: string[], verdict: string, whatItDoes: string, extra: { myNotes?: string } = {}) =>
  [`npm--${name}.md`, renderNote({ id: `pkg:npm/${name}`, name, url: `https://www.npmjs.com/package/${name}`, explored, kind: "library", tags, verdict, whatItDoes, ...extra })] as const;

// The personal journal's showcase notes, by file name: written over the screens notes and beside
// the example vault's.
export function showcaseNotes(screens: Record<string, string>): Record<string, string> {
  const notes: Record<string, string> = {
    ...screens,
    // The screens notes, with tags, so they join the graph.
    "npm--pdfkit.md": screens["npm--pdfkit.md"].replace("tags: []", "tags: [pdf]"),
    "npm--commander.md": screens["npm--commander.md"].replace("tags: []", "tags: [cli]"),
    ...Object.fromEntries([
      NPM("puppeteer", "2026-09-12", ["browser-automation", "pdf"], "default for PDF rendering", "Controls Chrome or Firefox from Node; prints pages to PDF and takes screenshots."),
      NPM("pdf-lib", "2026-09-13", ["pdf"], "use for editing existing PDFs: forms, merging pages", "Creates and modifies PDF documents in any JavaScript environment."),
      NPM("vite", "2026-08-07", ["frontend"], "default dev server and bundler for new frontends", "A dev server with hot module replacement, and a production bundler."),
      NPM("msw", "2026-09-04", ["testing"], "use for mocking HTTP in tests and in the browser", "Intercepts requests at the network level, with the same handlers in Node and the browser.", { myNotes: "Pairs with [[npm--vitest|vitest]] for the API client's tests." }),
      NPM("react-hook-form", "2026-08-17", ["react", "frontend"], "use for forms in React with validation from a schema", "Form state and validation for React, with uncontrolled inputs.", { myNotes: "The schema comes from [[npm--zod|zod]]." }),
    ]),
  };
  for (const repo of fixture.repositories) {
    const spec = NOTES[repo.full_name];
    if (!spec) continue;
    const target = resolveTarget(`https://github.com/${repo.full_name}`);
    if (target.kind !== "ok") throw new Error(`${repo.full_name}: ${JSON.stringify(target)}`);
    const kind = kinds.find((k) => k.full_name === repo.full_name);
    const metadata: RepoMetadata = {
      name: repo.full_name, url: `https://github.com/${repo.full_name}`, description: repo.description, language: repo.language, license: repo.license,
      topics: repo.topics, skills: [], skillFolders: kind ? countSkillFolders(kind.skill_md) : 0, template: repo.is_template,
      packages: kind?.packages ?? [], plugin: kind?.plugin ?? false, bin: kind?.bin ?? false,
    };
    const note = captureNote(null, { purl: target.purl, source: metadata.url, metadata, today: spec.explored, known: { tagList: [], shared: new Set() }, tags: spec.tags, verdict: spec.verdict, myNotes: spec.myNotes });
    if (!note.text) throw new Error(`${repo.full_name}: ${note.error}`);
    const alternatives = spec.alternatives ? `alternatives: [${spec.alternatives.map((a) => JSON.stringify(a)).join(", ")}]\n` : "";
    notes[fileNameFor(target.purl)] = note.text.replace("status: reviewed\n", `status: reviewed\n${alternatives}`);
  }
  return notes;
}

// The project journal's notes (~/code/app/.magpie): what the team agreed on for this repository.
export const SHOWCASE_PROJECT: Record<string, string> = Object.fromEntries([
  NPM("puppeteer", "2026-10-02", [], "default for PDF rendering in new projects", "Controls Chrome or Firefox from Node; prints pages to PDF and takes screenshots."),
  NPM("zod", "2026-10-03", [], "validate the checkout API's input with it", "Schema declaration and validation, with static types inferred from the schema."),
  NPM("msw", "2026-10-06", ["testing"], "use for the checkout's API mocks in tests", "Intercepts requests at the network level, with the same handlers in Node and the browser."),
]);
