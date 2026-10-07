import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    { type: "note", key: "note:github--a--list.md", id: "pkg:github/a/list", file: "github--a--list.md", name: "list", kind: "awesome-list", kind_group: "resource", status: "inbox", tried: false, rating: null, tags: [], language: null, degree: 0 },
    { type: "note", key: "note:github--a--odd.md", id: "pkg:github/a/odd", file: "github--a--odd.md", name: null, kind: "not-a-kind", kind_group: "other", status: "inbox", tried: false, rating: null, tags: [], language: null, degree: 0 },
    { type: "note", key: "note:npm--pdfkit.md", id: "pkg:npm/pdfkit", file: "npm--pdfkit.md", name: "pdfkit", kind: "library", kind_group: "tool", status: "reviewed", tried: true, rating: 2, tags: ["pdf", "node"], language: "JavaScript", degree: 3 },
    { type: "note", key: "note:npm--puppeteer.md", id: "pkg:npm/puppeteer", file: "npm--puppeteer.md", name: "puppeteer", kind: "skill-pack", kind_group: "skill-pack", status: "inbox", tried: false, rating: null, tags: ["pdf"], language: null, degree: 2 },
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

test("graphData: similarity keeps a note's top 3; an edge exists if either note keeps it", () => {
  // x shares one topic with each y (score 1/2); the ys share both topics (score 1), so each y keeps
  // three other ys, never x. x keeps its top 3, ties broken by file name: y1, y2, y3.
  const ys = Object.fromEntries([1, 2, 3, 4, 5].map((k) => [`npm--y${k}.md`, note({ id: `pkg:npm/y${k}`, topics: ["pdf", "print"] })]));
  const graph = graphData(journal({ "npm--x.md": note({ id: "pkg:npm/x", topics: ["pdf"] }), ...ys }));
  assert.deepEqual(similarOf(graph.edges, "note:npm--x.md"), ["note:npm--y1.md", "note:npm--y2.md", "note:npm--y3.md"]);
  // y4 and y5 keep y1, y2 and y3, so neither keeps the other.
  assert.deepEqual(similarOf(graph.edges, "note:npm--y5.md"), ["note:npm--y1.md", "note:npm--y2.md", "note:npm--y3.md"]);
  assert.deepEqual(similarOf(graph.edges, "note:npm--y1.md"), ["note:npm--x.md", "note:npm--y2.md", "note:npm--y3.md", "note:npm--y4.md", "note:npm--y5.md"]);
  const edge = edgesOf(graph.edges, "similar").find((e) => e.source === "note:npm--x.md" && e.target === "note:npm--y1.md");
  assert.equal(edge?.score, 0.5);
  assert.equal(graph.counts.edges_by_type.similar, 12);
});

test("graphData: the similarity threshold (0.25, with 0.1 for the same language); no shared topic, no edge", () => {
  const root = journal({
    // One shared topic of five: 0.2, under the threshold; 0.3 with the same language.
    "npm--a.md": note({ id: "pkg:npm/a", topics: ["pdf", "a1", "a2"], language: "Go" }),
    "npm--b.md": note({ id: "pkg:npm/b", topics: ["pdf", "b1", "b2"], language: "Rust" }),
    "npm--c.md": note({ id: "pkg:npm/c", topics: ["PDF", "c1", "c2"], language: "go" }),
    // One shared topic of four: 0.25, at the threshold.
    "npm--d.md": note({ id: "pkg:npm/d", topics: ["yaml", "d1"] }),
    "npm--e.md": note({ id: "pkg:npm/e", topics: ["yaml", "e1", "e2"] }),
    // The same language and no shared topic: no edge.
    "npm--f.md": note({ id: "pkg:npm/f", topics: ["f1"], language: "Go" }),
  });
  assert.deepEqual(edgesOf(graphData(root).edges, "similar"), [
    { type: "similar", source: "note:npm--a.md", target: "note:npm--c.md", score: 0.3 },
    { type: "similar", source: "note:npm--d.md", target: "note:npm--e.md", score: 0.25 },
  ]);
});

test("graphData: notes joined by a link or an alternative get no similarity edge", () => {
  const root = journal({
    "npm--a.md": note({ id: "pkg:npm/a", topics: ["pdf"] }, "## Related\n- [[npm--b]]\n"),
    "npm--b.md": note({ id: "pkg:npm/b", topics: ["pdf"] }),
    "npm--c.md": note({ id: "pkg:npm/c", topics: ["yaml"], alternatives: ["[[npm--d]]"] }),
    "npm--d.md": note({ id: "pkg:npm/d", topics: ["yaml"] }),
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
    "npm--z.md": note({ id: "pkg:npm/z", topics: ["pdf", "z1"] }),
    ...close,
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
