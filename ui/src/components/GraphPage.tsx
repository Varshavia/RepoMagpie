// The graph page (decision 0028, docs/ui.md §7): one journal's notes, the tags they carry and the
// connections between them, drawn with sigma (WebGL) and laid out by ForceAtlas2 in a worker. Loaded
// on demand, in its own chunk, so the other screens never load sigma or graphology. The canvas is a
// visual aid, hidden from assistive technology; the status line and the legend say in words what it
// shows.
import Graph from "graphology";
import { assignLayoutChanges, graphToByteArrays } from "graphology-layout-forceatlas2/helpers.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";
import type { NodeHoverDrawingFunction } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import { api, type ApiError, type GraphJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import { DEFAULT_SOURCES, drawable, edgeStyle, graphState, KIND_COLOR, LAYOUT, layoutSettings, mixRgb, nodeSize, seedPosition, statusLine, type Shown } from "../logic/graph.ts";
import type { LayoutReply, LayoutRequest } from "../layout.worker.ts";
import { MOD, type Theme } from "../platform.ts";
import { EmptyState } from "./common.tsx";
import "./GraphPage.css";

type Load = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; doc: GraphJson };
type Colors = Record<(typeof TOKENS)[number], string>;

const TOKENS = [
  "--graph-skill-pack",
  "--graph-tool",
  "--graph-resource",
  "--graph-other",
  "--graph-tag",
  "--graph-edge-tagged",
  "--graph-edge-link",
  "--graph-edge-alternative",
  "--graph-edge-similar",
  "--canvas",
  "--surface-2",
  "--ink",
] as const;

const KIND_GROUPS: [string, string][] = [
  ["skill-pack", "Skill pack"],
  ["tool", "Tool"],
  ["resource", "Resource"],
  ["other", "Other"],
];

const INBOX_FADE = 0.55; // toward the canvas
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

interface Props {
  journal: Scope;
  theme: Theme;
  onAdd: () => void;
}

export default function GraphPage({ journal, theme, onAdd }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [webgl, setWebgl] = useState(hasWebGL);
  const [settled, setSettled] = useState(false);
  const [scheme, setScheme] = useState(0); // the system's colour scheme changed
  const container = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const drawn = useRef<{ sigma: Sigma; graph: Graph } | null>(null);
  const worker = useRef<Worker | null>(null);
  const reduced = useMemo(() => matchMedia(REDUCED_MOTION).matches, []);
  const sources = DEFAULT_SOURCES;

  useEffect(() => {
    let current = true;
    setLoad({ status: "loading" });
    api.graph(journal, sources.ghosts).then(
      (doc) => current && setLoad({ status: "ready", doc }),
      (error: ApiError) => current && setLoad({ status: "error", error: error.message }),
    );
    return () => {
      current = false;
    };
  }, [journal, attempt, sources.ghosts]);

  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setScheme((n) => n + 1);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);

  const shown = useMemo(() => (load.status === "ready" ? drawable(load.doc, sources) : null), [load, sources]);
  const state = load.status === "ready" ? graphState(load.doc, sources) : null;

  // ForceAtlas2 for a fixed number of iterations, from the positions the nodes have now. Under
  // reduced motion only the settled layout is drawn.
  const runLayout = useCallback(() => {
    const view = drawn.current;
    if (!view) return;
    worker.current?.terminate();
    const layout = new Worker(new URL("../layout.worker.ts", import.meta.url), { type: "module" });
    worker.current = layout;
    setSettled(false);
    layout.onmessage = (event: MessageEvent<LayoutReply>) => {
      if (worker.current !== layout) return;
      assignLayoutChanges(view.graph, event.data.nodes, null);
      if (!event.data.done) return;
      layout.terminate();
      worker.current = null;
      setSettled(true);
    };
    const { nodes, edges } = graphToByteArrays(view.graph, () => 1);
    const request: LayoutRequest = { nodes, edges, settings: layoutSettings(view.graph.order), iterations: LAYOUT.iterations, chunk: LAYOUT.chunk, progress: !reduced };
    layout.postMessage(request, [nodes.buffer, edges.buffer]);
  }, [reduced]);

  useEffect(() => {
    if (!shown || state === "empty" || !webgl || !container.current || !probe.current) return;
    const colors = palette(probe.current);
    const graph = buildGraph(shown, colors);
    let sigma: Sigma;
    try {
      sigma = new Sigma(graph, container.current, sigmaSettings(colors, getComputedStyle(container.current).fontFamily, reduced));
    } catch {
      setWebgl(false);
      return;
    }
    drawn.current = { sigma, graph };
    runLayout();
    return () => {
      worker.current?.terminate();
      worker.current = null;
      sigma.kill();
      drawn.current = null;
    };
  }, [shown, state, webgl, reduced, runLayout]);

  // A theme change recolours what is drawn; nothing moves.
  useEffect(() => {
    const view = drawn.current;
    if (!view || !probe.current) return;
    const colors = palette(probe.current);
    paint(view.graph, colors);
    view.sigma.setSettings(sigmaSettings(colors, view.sigma.getSettings().labelFont, reduced));
  }, [theme, scheme, reduced]);

  const fit = () => {
    const camera = drawn.current?.sigma.getCamera();
    if (!camera) return;
    if (reduced) camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
    else void camera.animatedReset({ duration: 300 });
  };

  const drawing = shown && state !== "empty" && webgl;

  return (
    <section className="pane graph-page" aria-labelledby="graph-title">
      <header className="pane-header">
        <h1 className="pane-title" id="graph-title">
          Graph
        </h1>
        <p className="graph-status" role="status">
          {shown ? statusLine(shown.counts) : load.status === "loading" ? "Loading the graph…" : ""}
        </p>
        {drawing ? (
          <div className="graph-actions">
            <button type="button" className="button ghost" onClick={runLayout} disabled={!settled}>
              <Icon name="reload" />
              Re-run layout
            </button>
            <button type="button" className="button ghost" onClick={fit}>
              Fit to screen
            </button>
          </div>
        ) : null}
      </header>
      <span ref={probe} className="graph-probe" aria-hidden="true" />

      {load.status === "error" ? (
        <EmptyState
          action={
            <button type="button" className="button secondary" onClick={() => setAttempt((n) => n + 1)}>
              <Icon name="reload" />
              Retry
            </button>
          }
        >
          {`Couldn't load the graph. ${load.error}`}
        </EmptyState>
      ) : state === "empty" ? (
        <EmptyState
          center
          action={
            <button type="button" className="button secondary" onClick={onAdd}>
              <Icon name="plus" />
              Add a note
            </button>
          }
        >
          {`Nothing to draw yet. Add a repository here, or from the palette (${MOD}+K).`}
        </EmptyState>
      ) : (
        <div className="graph-body">
          {state === "unconnected" ? <p className="graph-notice">Your notes aren't connected yet. Add tags, or [[links]] in My notes.</p> : null}
          {!webgl ? <p className="graph-notice">This browser can't draw the graph: WebGL is off or not available. The counts above still hold.</p> : null}
          {/* Under reduced motion the canvas stays invisible (it keeps its size, which sigma needs) until the layout settles. */}
          {drawing ? <div className="graph-canvas" ref={container} aria-hidden="true" data-settled={settled} data-waiting={reduced && !settled} /> : null}
          {drawing && reduced && !settled ? <p className="graph-arranging">Arranging the graph…</p> : null}
          {shown ? <Legend shown={shown} /> : null}
        </div>
      )}
    </section>
  );
}

// Every colour the graph uses, also in words (docs/ui.md §9).
function Legend({ shown }: { shown: Shown }) {
  const edgeTypes = new Set(shown.edges.map((e) => e.type));
  return (
    <div className="graph-legend" aria-label="Legend" role="group">
      <ul>
        {KIND_GROUPS.map(([group, label]) => (
          <li key={group}>
            <span className="swatch dot" style={{ background: `var(${KIND_COLOR[group]})` }} aria-hidden="true" />
            {label}
          </li>
        ))}
        <li>
          <span className="swatch dot small" style={{ background: "var(--graph-tag)" }} aria-hidden="true" />
          #tag
        </li>
        <li>
          <span className="swatch dot faded" aria-hidden="true" />
          Faded: in the inbox
        </li>
      </ul>
      <ul>
        {(["tagged", "link", "alternative", "similar"] as const)
          .filter((type) => edgeTypes.has(type))
          .map((type) => (
            <li key={type}>
              <span className={`swatch line ${type}`} style={{ background: `var(${edgeStyle(type).color})` }} aria-hidden="true" />
              {{ tagged: "Tagged", link: "Link", alternative: "Alternative", similar: "Similar" }[type]}
            </li>
          ))}
      </ul>
    </div>
  );
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// The tokens as the browser resolves them for the current theme ("rgb(r, g, b)").
function palette(probe: HTMLElement): Colors {
  const colors = {} as Colors;
  for (const token of TOKENS) {
    probe.style.color = `var(${token})`;
    colors[token] = getComputedStyle(probe).color;
  }
  return colors;
}

function buildGraph(shown: Shown, colors: Colors): Graph {
  const graph = new Graph({ type: "undirected", multi: true });
  for (const node of shown.nodes) {
    const { x, y } = seedPosition(node.key);
    if (node.type === "note") {
      graph.addNode(node.key, { x, y, size: nodeSize("note", node.degree), label: node.name ?? node.file.replace(/\.md$/, ""), kindGroup: node.kind_group, inbox: node.status === "inbox", zIndex: 1 });
    } else if (node.type === "tag") {
      graph.addNode(node.key, { x, y, size: nodeSize("tag", node.count), label: `#${node.tag}`, forceLabel: true, tag: true, zIndex: 2 });
    } else {
      graph.addNode(node.key, { x, y, size: nodeSize("ghost", 0), label: node.target, ghost: true, zIndex: 0 });
    }
  }
  for (const edge of shown.edges) {
    graph.addEdgeWithKey(`${edge.type} ${edge.source} ${edge.target}`, edge.source, edge.target, { type: "line", edgeType: edge.type, size: edgeStyle(edge.type).size });
  }
  paint(graph, colors);
  return graph;
}

function paint(graph: Graph, colors: Colors): void {
  graph.updateEachNodeAttributes((_key, attr) => {
    const base = attr.tag ? colors["--graph-tag"] : attr.ghost ? colors["--graph-other"] : colors[KIND_COLOR[attr.kindGroup as string] as keyof Colors];
    return { ...attr, color: attr.inbox || attr.ghost ? mixRgb(base, colors["--canvas"], INBOX_FADE) : base };
  });
  graph.updateEachEdgeAttributes((_key, attr) => ({ ...attr, color: colors[edgeStyle(attr.edgeType).color as keyof Colors] }));
}

function sigmaSettings(colors: Colors, font: string, reduced: boolean): Partial<Settings> {
  return {
    labelFont: font,
    labelSize: 12,
    labelWeight: "500",
    labelColor: { color: colors["--ink"] },
    // Labels for tag nodes always (forceLabel); for notes from 8 px on screen, which a note reaches
    // with two connections at the default zoom, so the largest are named first and all once you zoom in.
    labelRenderedSizeThreshold: 8,
    labelDensity: 0.6,
    minEdgeThickness: 0.8,
    zIndex: true,
    stagePadding: 32,
    renderEdgeLabels: false,
    zoomDuration: reduced ? 0 : 250,
    inertiaDuration: reduced ? 0 : 150,
    doubleClickZoomingDuration: reduced ? 0 : 200,
    defaultDrawNodeHover: drawHover(colors),
  };
}

// The hovered node's label on a surface-2 plate, in the theme's ink (sigma's default plate is white).
function drawHover(colors: Colors): NodeHoverDrawingFunction {
  return (context, data, settings) => {
    const size = settings.labelSize;
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
    const label = data.label ?? "";
    const width = context.measureText(label).width;
    const x = data.x + data.size + 4;
    context.fillStyle = colors["--surface-2"];
    context.beginPath();
    context.roundRect(x - 4, data.y - size / 2 - 4, width + 8, size + 8, 4);
    context.fill();
    context.fillStyle = colors["--ink"];
    context.fillText(label, x, data.y + size / 3);
  };
}
