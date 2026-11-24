import { mock, test } from "node:test";
import assert from "node:assert/strict";
import fs, { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { scratchBase } from "./fixtures/scratch.ts";
import { graphData, type GraphEdge, type GraphNode } from "./graph.ts";

// A note file: frontmatter fields as given (JSON is YAML), then the body.
function note(fields: Record<string, unknown>, body = "## Verdict\n"): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

function journal(notes: Record<string, string>, tags?: string): string {
  const root = join(scratchBase("graph"), "journal");
  mkdirSync(join(root, "notes"), { recursive: true });
  for (const [file, text] of Object.entries(notes)) writeFileSync(join(root, "notes", file), text);
  if (tags !== undefined) writeFileSync(join(root, "tags.md"), tags);
  return root;
}

const edgesOf = (edges: GraphEdge[], type: GraphEdge["type"]) => edges.filter((e) => e.type === type);
const nodeByKey = (nodes: GraphNode[], key: string) => nodes.find((n) => n.key === key);
const similarOf = (edges: GraphEdge[], key: string) =>
  edgesOf(edges, "similar").filter((e) => e.source === key || e.target === key).map((e) => (e.source === key ? e.target : e.source)).sort();

test("graphData: note nodes with their fields, kind group and degree; tag nodes with their count; sorted", () => {
  const root = journal(
    {
      "npm--pdfkit.md": note(
        { id: "pkg:npm/pdfkit", name: "pdfkit", kind: "library", tags: ["pdf", "node"], language: "JavaScript", tried: true, rating: 2 },
        "## Verdict\navoid: use [[npm--puppeteer]]\n",
      ),
      "npm--puppeteer.md": note({ id: "pkg:npm/puppeteer", name: "puppeteer", kind: "skill-pack", tags: ["pdf"] }),
      "github--a--list.md": note({ id: "pkg:github/a/list", name: "list", kind: "awesome-list" }),
      "github--a--odd.md": note({ id: "pkg:github/a/odd", kind: "not-a-kind", tags: "pdf" }),
    },
    "# Tags\n\n- `pdf`\n",
  );
  const graph = graphData(root);
  assert.deepEqual(graph.nodes, [
    { type: "note", key: "note:github--a--list.md", id: "pkg:github/a/list", file: "github--a--list.md", name: "list", kind: "awesome-list", kind_group: "resource", status: "inbox", tried: false, rating: null, tags: [], language: null, domain: null, domain_suggested: false, degree: 0 },
    { type: "note", key: "note:github--a--odd.md", id: "pkg:github/a/odd", file: "github--a--odd.md", name: null, kind: "not-a-kind", kind_group: "other", status: "inbox", tried: false, rating: null, tags: [], language: null, domain: null, domain_suggested: false, degree: 0 },
    { type: "note", key: "note:npm--pdfkit.md", id: "pkg:npm/pdfkit", file: "npm--pdfkit.md", name: "pdfkit", kind: "library", kind_group: "tool", status: "reviewed", tried: true, rating: 2, tags: ["pdf", "node"], language: "JavaScript", domain: null, domain_suggested: false, degree: 3 },
    { type: "note", key: "note:npm--puppeteer.md", id: "pkg:npm/puppeteer", file: "npm--puppeteer.md", name: "puppeteer", kind: "skill-pack", kind_group: "skill-pack", status: "inbox", tried: false, rating: null, tags: ["pdf"], language: null, domain: null, domain_suggested: false, degree: 2 },
    // "node" is not in tags.md; a note carries it, so it is a node too.
    { type: "tag", key: "tag:node", tag: "node", count: 1 },
    { type: "tag", key: "tag:pdf", tag: "pdf", count: 2 },
  ]);
  assert.deepEqual(edgesOf(graph.edges, "tagged"), [
    { type: "tagged", source: "note:npm--pdfkit.md", target: "tag:node" },
    { type: "tagged", source: "note:npm--pdfkit.md", target: "tag:pdf" },
    { type: "tagged", source: "note:npm--puppeteer.md", target: "tag:pdf" },
  ]);
  assert.deepEqual(graph.counts, { notes: 4, tags: 2, edges_by_type: { tagged: 3, link: 1, alternative: 0, similar: 0 } });
});

test("graphData: a note's colour domain is its first confirmed one, else its first suggested one; unknown values are skipped", () => {
  const root = journal({
    "npm--a.md": note({ id: "pkg:npm/a", domains: ["database", "security"], domains_suggested: ["api"] }),
    "npm--b.md": note({ id: "pkg:npm/b", domains: [], domains_suggested: ["testing"] }),
    "npm--c.md": note({ id: "pkg:npm/c", domains: ["not-a-domain", "auth"] }),
    "npm--d.md": note({ id: "pkg:npm/d", domains: "database" }),
  });
  const domain = (key: string) => {
    const n = nodeByKey(graphData(root).nodes, key);
    return n?.type === "note" ? [n.domain, n.domain_suggested] : null;
  };
  assert.deepEqual(domain("note:npm--a.md"), ["database", false]);
  assert.deepEqual(domain("note:npm--b.md"), ["testing", true]);
  assert.deepEqual(domain("note:npm--c.md"), ["auth", false]);
  assert.deepEqual(domain("note:npm--d.md"), [null, false], "not a list");
});

test("graphData: one link edge per pair, whichever direction, counting every body link; no edge to itself", () => {
  const root = journal({
    "npm--a.md": note({ id: "pkg:npm/a", name: "a" }, "## Verdict\n[[npm--b]] and [[b]]\n\n## My notes\n[[npm--a]] itself\n"),
    "npm--b.md": note({ id: "pkg:npm/b", name: "b" }, "## Related\n- [[npm--a|back]]\n"),
    "npm--c.md": note({ id: "pkg:npm/c", name: "c" }, "## Related\n- [[a]]\n"),
  });
  const graph = graphData(root);
  assert.deepEqual(edgesOf(graph.edges, "link"), [
    { type: "link", source: "note:npm--a.md", target: "note:npm--b.md", count: 3 },
    { type: "link", source: "note:npm--a.md", target: "note:npm--c.md", count: 1 },
  ]);
  assert.equal((nodeByKey(graph.nodes, "note:npm--a.md") as { degree: number }).degree, 2);
});

test("graphData: an alternative is one edge per pair, also when both notes list each other; a link beside it is its own edge", () => {
  const root = journal({
    "npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", name: "pdfkit", alternatives: ["[[npm--puppeteer]]"] }, "## Verdict\nuse [[puppeteer]]\n"),
    "npm--puppeteer.md": note({ id: "pkg:npm/puppeteer", name: "puppeteer", alternatives: ["[[pdfkit|PDFKit]]", "[[npm--puppeteer]]"] }),
  });
  const graph = graphData(root);
  assert.deepEqual(edgesOf(graph.edges, "alternative"), [{ type: "alternative", source: "note:npm--pdfkit.md", target: "note:npm--puppeteer.md" }]);
  assert.deepEqual(edgesOf(graph.edges, "link"), [{ type: "link", source: "note:npm--pdfkit.md", target: "note:npm--puppeteer.md", count: 1 }]);
  assert.deepEqual(graph.counts.edges_by_type, { tagged: 0, link: 1, alternative: 1, similar: 0 });
});

// Notes with one topic each that no other note has: they never pair, and they make the journal big
// enough that the topics a test shares are on a minority of its notes (a topic on half the notes or
// more weighs nothing).
const fillers = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, k) => [`npm--filler${k}.md`, note({ id: `pkg:npm/filler${k}`, topics: [`only-${k}`] })]));
// A topic's weight on df of n notes (BM25's inverse document frequency), and a pair's score as the
// graph rounds it: the weighted Jaccard index of their topics, plus 0.1 for the same language.
const idf = (df: number, n: number) => Math.max(0, Math.log((n - df + 0.5) / (df + 0.5)));
const score = (shared: number[], all: number[], language = false) => Math.round((shared.reduce((a, b) => a + b, 0) / all.reduce((a, b) => a + b, 0) + (language ? 0.1 : 0)) * 1000) / 1000;

test("graphData: similarity keeps a note's top 3; an edge exists if either note keeps it", () => {
  // x shares one topic with each y; the ys share both topics (score 1), so each y keeps three other
  // ys, never x. x keeps its top 3, ties broken by file name: y1, y2, y3. 20 notes in all.
  const ys = Object.fromEntries([1, 2, 3, 4, 5].map((k) => [`npm--y${k}.md`, note({ id: `pkg:npm/y${k}`, topics: ["pdf", "print"] })]));
  const graph = graphData(journal({ "npm--x.md": note({ id: "pkg:npm/x", topics: ["pdf"] }), ...ys, ...fillers(14) }));
  assert.deepEqual(similarOf(graph.edges, "note:npm--x.md"), ["note:npm--y1.md", "note:npm--y2.md", "note:npm--y3.md"]);
  // y4 and y5 keep y1, y2 and y3, so neither keeps the other.
  assert.deepEqual(similarOf(graph.edges, "note:npm--y5.md"), ["note:npm--y1.md", "note:npm--y2.md", "note:npm--y3.md"]);
  assert.deepEqual(similarOf(graph.edges, "note:npm--y1.md"), ["note:npm--x.md", "note:npm--y2.md", "note:npm--y3.md", "note:npm--y4.md", "note:npm--y5.md"]);
  const edge = edgesOf(graph.edges, "similar").find((e) => e.source === "note:npm--x.md" && e.target === "note:npm--y1.md");
  const pdf = idf(6, 20);
  const print = idf(5, 20);
  assert.equal(edge?.score, score([pdf], [pdf, print]));
  assert.equal(edge?.score, 0.436);
  assert.equal(graph.counts.edges_by_type.similar, 12);
});

test("graphData: the similarity threshold (0.25, with 0.1 for the same language); no shared topic, no edge", () => {
  // 20 notes. A topic on one note weighs idf(1, 20) = 2.565, on two 2.002, on three 1.609.
  const one = idf(1, 20);
  const two = idf(2, 20);
  const root = journal({
    // One shared topic (on three notes) of five: 0.136, under the threshold even with the same language (0.236).
    "npm--a.md": note({ id: "pkg:npm/a", topics: ["pdf", "a1", "a2"], language: "Go" }),
    "npm--b.md": note({ id: "pkg:npm/b", topics: ["pdf", "b1", "b2"], language: "Rust" }),
    "npm--c.md": note({ id: "pkg:npm/c", topics: ["PDF", "c1", "c2"], language: "go" }),
    // One shared topic (on two notes) of three: 0.281, over the threshold.
    "npm--d.md": note({ id: "pkg:npm/d", topics: ["yaml", "d1"] }),
    "npm--e.md": note({ id: "pkg:npm/e", topics: ["yaml", "e1"] }),
    // One shared topic (on two notes) of four: 0.206 alone, 0.306 with the same language.
    "npm--g.md": note({ id: "pkg:npm/g", topics: ["zip", "g1"], language: "Go" }),
    "npm--h.md": note({ id: "pkg:npm/h", topics: ["zip", "h1", "h2"], language: "go" }),
    "npm--i.md": note({ id: "pkg:npm/i", topics: ["tar", "i1"] }),
    "npm--j.md": note({ id: "pkg:npm/j", topics: ["tar", "j1", "j2"] }),
    // The same language and no shared topic: no edge.
    "npm--f.md": note({ id: "pkg:npm/f", topics: ["f1"], language: "Go" }),
    ...fillers(10),
  });
  assert.deepEqual(edgesOf(graphData(root).edges, "similar"), [
    { type: "similar", source: "note:npm--d.md", target: "note:npm--e.md", score: score([two], [two, one, one]) },
    { type: "similar", source: "note:npm--g.md", target: "note:npm--h.md", score: score([two], [two, one, one, one], true) },
  ]);
  assert.deepEqual([score([idf(3, 20)], [idf(3, 20), one, one, one, one], true), score([two], [two, one, one]), score([two], [two, one, one, one]), score([two], [two, one, one, one], true)], [0.236, 0.281, 0.206, 0.306]);
});

test("graphData: a topic on most notes never makes an edge on its own; a rare topic they also share does", () => {
  // javascript is on 14 of 20 notes, so it weighs nothing: notes that share only it, even notes with
  // no other topic, are not similar. r1 and r2 also share a topic only they have.
  const most = Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`npm--m${k}.md`, note({ id: `pkg:npm/m${k}`, topics: ["javascript", `m${k}`] })]));
  const root = journal({
    ...most,
    "npm--bare1.md": note({ id: "pkg:npm/bare1", topics: ["javascript"] }),
    "npm--bare2.md": note({ id: "pkg:npm/bare2", topics: ["javascript"] }),
    "npm--r1.md": note({ id: "pkg:npm/r1", topics: ["javascript", "pdf-render", "r1"] }),
    "npm--r2.md": note({ id: "pkg:npm/r2", topics: ["javascript", "pdf-render", "r2"] }),
    ...fillers(6),
  });
  assert.equal(idf(14, 20), 0);
  const two = idf(2, 20);
  const one = idf(1, 20);
  assert.deepEqual(edgesOf(graphData(root).edges, "similar"), [
    { type: "similar", source: "note:npm--r1.md", target: "note:npm--r2.md", score: score([two], [two, one, one]) },
  ]);
});

test("graphData: a common topic counts for less than a rare one", () => {
  // a and b share a topic on 8 of 20 notes; c and d one on 2. Both pairs have three topics in all.
  const common = Object.fromEntries(Array.from({ length: 6 }, (_, k) => [`npm--k${k}.md`, note({ id: `pkg:npm/k${k}`, topics: ["web", `k${k}`] })]));
  const root = journal({
    "npm--a.md": note({ id: "pkg:npm/a", topics: ["web", "a1"] }),
    "npm--b.md": note({ id: "pkg:npm/b", topics: ["web", "b1"] }),
    "npm--c.md": note({ id: "pkg:npm/c", topics: ["pdf", "c1"] }),
    "npm--d.md": note({ id: "pkg:npm/d", topics: ["pdf", "d1"] }),
    ...common,
    ...fillers(10),
  });
  const pair = (x: string, y: string) => edgesOf(graphData(root).edges, "similar").find((e) => e.source === `note:npm--${x}.md` && e.target === `note:npm--${y}.md`);
  assert.equal(pair("c", "d")?.score, score([idf(2, 20)], [idf(2, 20), idf(1, 20), idf(1, 20)]));
  assert.equal(pair("a", "b"), undefined, `web weighs ${idf(8, 20).toFixed(3)}, so a and b score ${score([idf(8, 20)], [idf(8, 20), idf(1, 20), idf(1, 20)])}`);
});

test("graphData: notes joined by a link or an alternative get no similarity edge", () => {
  const root = journal({
    "npm--a.md": note({ id: "pkg:npm/a", topics: ["pdf"] }, "## Related\n- [[npm--b]]\n"),
    "npm--b.md": note({ id: "pkg:npm/b", topics: ["pdf"] }),
    "npm--c.md": note({ id: "pkg:npm/c", topics: ["yaml"], alternatives: ["[[npm--d]]"] }),
    "npm--d.md": note({ id: "pkg:npm/d", topics: ["yaml"] }),
    ...fillers(16), // so pdf and yaml weigh something: without the link, each pair would be similar
  });
  const graph = graphData(root);
  assert.deepEqual(edgesOf(graph.edges, "similar"), []);
  assert.equal(graph.counts.edges_by_type.link, 1);
  assert.equal(graph.counts.edges_by_type.alternative, 1);
});

test("graphData: notes already joined don't take a similar neighbour's place", () => {
  // x's three best matches are linked from x; its fourth is still kept.
  const close = Object.fromEntries([1, 2, 3].map((k) => [`npm--y${k}.md`, note({ id: `pkg:npm/y${k}`, topics: ["pdf", "print"] })]));
  const root = journal({
    "npm--x.md": note({ id: "pkg:npm/x", topics: ["pdf", "print"] }, "## Related\n[[npm--y1]] [[npm--y2]] [[npm--y3]]\n"),
    "npm--z.md": note({ id: "pkg:npm/z", topics: ["pdf", "print", "z1"] }),
    ...close,
    ...fillers(15),
  });
  assert.deepEqual(similarOf(graphData(root).edges, "note:npm--x.md"), ["note:npm--z.md"]);
});

test("graphData: ghost nodes for unresolved targets, only when asked, with link and alternative edges to them", () => {
  const notes = {
    "npm--pdfkit.md": note({ id: "pkg:npm/pdfkit", name: "pdfkit", alternatives: ["wkhtmltopdf"] }, "## Verdict\n[[Puppeteer]] or [[puppeteer]], or [[two]]\n"),
    "npm--x.md": note({ id: "pkg:npm/x", name: "two" }),
    "npm--y.md": note({ id: "pkg:npm/y", name: "two" }, "## Related\n[[puppeteer]]\n"),
  };
  const plain = graphData(journal(notes));
  assert.deepEqual(plain.nodes.filter((n) => n.type === "ghost"), []);
  assert.ok(plain.edges.every((e) => !e.target.startsWith("ghost:")));

  const graph = graphData(journal(notes), { ghosts: true });
  assert.deepEqual(graph.nodes.filter((n) => n.type === "ghost"), [
    { type: "ghost", key: "ghost:puppeteer", target: "Puppeteer", reason: "missing" },
    { type: "ghost", key: "ghost:two", target: "two", reason: "ambiguous" },
    { type: "ghost", key: "ghost:wkhtmltopdf", target: "wkhtmltopdf", reason: "missing" },
  ]);
  assert.deepEqual(graph.edges.filter((e) => e.target.startsWith("ghost:")), [
    { type: "link", source: "note:npm--pdfkit.md", target: "ghost:puppeteer", count: 2 },
    { type: "link", source: "note:npm--pdfkit.md", target: "ghost:two", count: 1 },
    { type: "link", source: "note:npm--y.md", target: "ghost:puppeteer", count: 1 },
    { type: "alternative", source: "note:npm--pdfkit.md", target: "ghost:wkhtmltopdf" },
  ]);
  // Edges to missing notes don't count as connections.
  assert.equal((nodeByKey(graph.nodes, "note:npm--pdfkit.md") as { degree: number }).degree, 0);
});

test("graphData: unreadable notes are skipped, with their tags, links and topics", () => {
  const root = journal({
    "npm--a.md": note({ id: "pkg:npm/a", tags: ["pdf"], topics: ["pdf"] }, "## Related\n[[npm--broken]] [[npm--bare]]\n"),
    "npm--broken.md": "---\nid: [broken\ntags: [\"secret\"]\n---\n\n## Related\n[[npm--a]]\n",
    "npm--bare.md": "## Related\n[[npm--a]]\n",
    "npm--noid.md": note({ name: "no id", tags: ["secret"], topics: ["pdf"] }),
  });
  const graph = graphData(root, { ghosts: true });
  assert.deepEqual(graph.nodes.map((n) => n.key), ["note:npm--a.md", "tag:pdf", "ghost:npm--bare", "ghost:npm--broken"]);
  assert.deepEqual(graph.counts, { notes: 1, tags: 1, edges_by_type: { tagged: 1, link: 2, alternative: 0, similar: 0 } });
});

test("graphData: an empty journal, or one without notes/, draws nothing", () => {
  const empty = { nodes: [], edges: [], counts: { notes: 0, tags: 0, edges_by_type: { tagged: 0, link: 0, alternative: 0, similar: 0 } } };
  assert.deepEqual(graphData(journal({}, "# Tags\n\n- `pdf`\n")), empty);
  assert.deepEqual(graphData(join(scratchBase("graph"), "nothing")), empty);
});

test("graphData: the same journal gives the same graph; nothing is written but the caches", () => {
  const root = journal({
    "npm--a.md": note({ id: "pkg:npm/a", tags: ["pdf"], topics: ["pdf", "x"] }, "## Related\n[[npm--b]]\n"),
    "npm--b.md": note({ id: "pkg:npm/b", tags: ["pdf"], topics: ["pdf"] }),
    "npm--c.md": note({ id: "pkg:npm/c", topics: ["pdf", "x"] }),
  });
  const first = graphData(root, { ghosts: true });
  assert.deepEqual(graphData(root, { ghosts: true }), first);
});

test("graph cache: .cache/graph.json; unchanged notes come from it, changed notes from disk", () => {
  const root = journal({
    "npm--a.md": note({ id: "pkg:npm/a", tags: ["pdf"] }),
    "npm--b.md": note({ id: "pkg:npm/b", tags: ["pdf"] }),
  });
  graphData(root);
  const cacheFile = join(root, ".cache", "graph.json");
  const cache = JSON.parse(readFileSync(cacheFile, "utf8")) as { data: Record<string, { tags: string[] }> };
  cache.data["npm--a.md"].tags = ["from-the-cache"];
  writeFileSync(cacheFile, JSON.stringify(cache));
  assert.deepEqual(graphData(root).nodes.filter((n) => n.type === "tag").map((n) => n.key), ["tag:from-the-cache", "tag:pdf"]);

  writeFileSync(join(root, "notes", "npm--a.md"), note({ id: "pkg:npm/a", tags: ["yaml"] }, "## Verdict\nfine\n"));
  assert.deepEqual(graphData(root).nodes.filter((n) => n.type === "tag").map((n) => n.key), ["tag:pdf", "tag:yaml"]);
});

const CACHE_NOTES = {
  "npm--a.md": note({ id: "pkg:npm/a", tags: ["pdf"], topics: ["pdf"] }, "## Related\n[[npm--b]] [[gone]]\n"),
  "npm--b.md": note({ id: "pkg:npm/b", tags: ["pdf"], topics: ["pdf"] }),
  "npm--c.md": note({ id: "pkg:npm/c", topics: ["pdf"] }),
};

test("graph cache: written whole to a temporary file, then renamed into place; nothing is left behind", (t) => {
  const root = journal(CACHE_NOTES);
  const cacheFile = join(root, ".cache", "graph.json");
  // writeCache imports writeFileSync and renameSync by name; syncing the built-in's exports makes the spies reach it.
  const writes = mock.method(fs, "writeFileSync");
  const renames = mock.method(fs, "renameSync");
  syncBuiltinESMExports();
  t.after(() => {
    mock.restoreAll();
    syncBuiltinESMExports();
  });
  graphData(root);
  const written = writes.mock.calls.map((call) => String(call.arguments[0])).filter((path) => path.includes("graph.json"));
  assert.equal(written.length, 1);
  assert.match(written[0], /graph\.json\.\d+\.[0-9a-f]{12}\.tmp$/); // the pid and random bytes
  assert.deepEqual(renames.mock.calls.filter((call) => String(call.arguments[1]) === cacheFile).map((call) => String(call.arguments[0])), written);
  assert.ok(readdirSync(join(root, ".cache")).every((name) => !name.endsWith(".tmp")));
  assert.equal((JSON.parse(readFileSync(cacheFile, "utf8")) as { version: number }).version, 4);
});

test("graph cache: a corrupt, truncated or mismatched graph.json is ignored and rebuilt, without an error", () => {
  const root = journal(CACHE_NOTES);
  const cacheFile = join(root, ".cache", "graph.json");
  const expected = graphData(root, { ghosts: true });
  const good = readFileSync(cacheFile, "utf8");
  const cache = JSON.parse(good) as { version: number; files: unknown; data: Record<string, unknown> };
  const garbage = [
    good.slice(0, Math.floor(good.length / 2)), // truncated, as by a crash mid-write
    "",
    "\u0000\u0001 not json",
    "null",
    "[]",
    JSON.stringify({ ...cache, version: 999 }),
    JSON.stringify({ ...cache, data: "nonsense" }),
    // Valid JSON for the right files, but entries of the wrong shape.
    JSON.stringify({ ...cache, data: { ...cache.data, "npm--a.md": "nonsense" } }),
    JSON.stringify({ ...cache, data: { ...cache.data, "npm--a.md": { id: "pkg:npm/a", tags: "pdf" } } }),
    JSON.stringify({ ...cache, data: { ...cache.data, "npm--b.md": null } }),
  ];
  for (const text of garbage) {
    writeFileSync(cacheFile, text);
    assert.deepEqual(graphData(root, { ghosts: true }), expected, `with graph.json: ${JSON.stringify(text.slice(0, 60))}`);
    assert.deepEqual(JSON.parse(readFileSync(cacheFile, "utf8")), JSON.parse(good), "the cache is rewritten whole");
  }
});
