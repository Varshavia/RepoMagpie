// The graph page (decision 0028, docs/ui.md §7): one journal's notes, the tags they carry and the
// connections between them, drawn with sigma (WebGL) and laid out by ForceAtlas2 in a worker. Loaded
// on demand, in its own chunk, so the other screens never load sigma or graphology. The canvas is a
// visual aid, hidden from assistive technology; the status line, the search box, the selection line
// and the legend say in words what it shows.
import Graph from "graphology";
import { assignLayoutChanges, graphToByteArrays } from "graphology-layout-forceatlas2/helpers.js";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Sigma from "sigma";
import type { NodeHoverDrawingFunction, NodeLabelDrawingFunction } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import { api, type ApiError, type GraphJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import {
  allLabels,
  around,
  DEFAULT_SOURCES,
  drawable,
  edgeStyle,
  graphState,
  KIND_COLOR,
  LAYOUT,
  layoutSettings,
  mixRgb,
  neighbours,
  nodeLabel,
  nodeSize,
  searchNodes,
  seedPosition,
  statusLine,
  type GraphNode,
  type Shown,
} from "../logic/graph.ts";
import type { LayoutReply, LayoutRequest } from "../layout.worker.ts";
import { MOD, type Theme } from "../platform.ts";
import { EmptyState } from "./common.tsx";
import "./GraphPage.css";

type Load = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; doc: GraphJson };
type Colors = Record<(typeof TOKENS)[number], string>;
type Depth = 0 | 1 | 2; // local mode: 0 shows everything

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
const DIM = 0.7; // what isn't around the hovered or selected node, toward the canvas
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// What the reducers read on every frame: kept in a ref, so a hover doesn't re-render React.
interface Focus {
  hovered: string | null;
  selected: string | null;
  near: Set<string> | null; // the lit node and its neighbours
  visible: Set<string> | null; // local mode
  colors: Colors | null;
}

interface Props {
  journal: Scope;
  theme: Theme;
  focus: string | null; // "Show in graph": the node to select, in local mode
  onAdd: () => void;
  // The note pane beside the graph; `open` selects another note of the graph (a [[link]] in it).
  renderNote: (note: { id: string; file: string }, open: (id: string) => void) => ReactNode;
}

export default function GraphPage({ journal, theme, focus: focusOn, onAdd, renderNote }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [webgl, setWebgl] = useState(hasWebGL);
  const [settled, setSettled] = useState(false);
  const [scheme, setScheme] = useState(0); // the system's colour scheme changed
  const [selected, setSelected] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth>(0);
  const [query, setQuery] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const notePaneRef = useRef<HTMLElement>(null);
  const drawn = useRef<{ sigma: Sigma; graph: Graph; fitted: boolean } | null>(null);
  const worker = useRef<Worker | null>(null);
  const focus = useRef<Focus>({ hovered: null, selected: null, near: null, visible: null, colors: null });
  const focusHandled = useRef<string | null>(null);
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
  const byKey = useMemo(() => new Map((shown?.nodes ?? []).map((n) => [n.key, n])), [shown]);
  const current = selected ? (byKey.get(selected) ?? null) : null;
  const local = useMemo(() => (current && depth && shown ? around(shown, current.key, depth) : null), [current, depth, shown]);
  const counted = local ?? shown;

  // The reducers' view of the selection, local mode and hover; then a redraw.
  const refocus = useCallback(() => {
    const f = focus.current;
    const lit = f.hovered ?? f.selected;
    f.near = lit && shown ? neighbours(shown.edges, lit, 1) : null;
    drawn.current?.sigma.refresh();
  }, [shown]);

  useEffect(() => {
    focus.current.selected = current?.key ?? null;
    focus.current.visible = local ? new Set(local.nodes.map((n) => n.key)) : null;
    refocus();
  }, [current, local, refocus]);

  const centre = useCallback(
    (key: string) => {
      const view = drawn.current;
      const data = view?.sigma.getNodeDisplayData(key);
      if (!view || !data) return;
      const camera = view.sigma.getCamera();
      const target = { x: data.x, y: data.y, ratio: camera.ratio, angle: 0 }; // pans; the zoom stays yours
      if (reduced) camera.setState(target);
      else void camera.animate(target, { duration: 300 });
    },
    [reduced],
  );

  const select = useCallback((key: string | null) => {
    setSelected(key);
    if (!key) setDepth(0);
  }, []);

  // ForceAtlas2 for a fixed number of iterations, from the positions the nodes have now. Under
  // reduced motion only the settled layout is drawn. While it runs, the view follows the graph's
  // bounds; once it settles, the bounds are kept, and the first time the camera fits them.
  const runLayout = useCallback(() => {
    const view = drawn.current;
    if (!view) return;
    worker.current?.terminate();
    const layout = new Worker(new URL("../layout.worker.ts", import.meta.url), { type: "module" });
    worker.current = layout;
    setSettled(false);
    view.sigma.setCustomBBox(null);
    layout.onmessage = (event: MessageEvent<LayoutReply>) => {
      if (worker.current !== layout) return;
      assignLayoutChanges(view.graph, event.data.nodes, null);
      if (!event.data.done) return;
      layout.terminate();
      worker.current = null;
      keepBounds(view.sigma);
      if (!view.fitted) {
        view.sigma.getCamera().setState(FITTED);
        view.fitted = true;
      }
      setSettled(true);
    };
    const { nodes, edges } = graphToByteArrays(view.graph, () => 1);
    const request: LayoutRequest = { nodes, edges, settings: layoutSettings(view.graph.order), iterations: LAYOUT.iterations, chunk: LAYOUT.chunk, progress: !reduced };
    layout.postMessage(request, [nodes.buffer, edges.buffer]);
  }, [reduced]);

  useEffect(() => {
    if (!shown || state === "empty" || !webgl || !container.current || !probe.current) return;
    const colors = palette(probe.current);
    focus.current.colors = colors;
    const graph = buildGraph(shown);
    paint(graph, colors);
    let sigma: Sigma;
    try {
      sigma = new Sigma(graph, container.current, {
        ...sigmaSettings(colors, getComputedStyle(container.current).fontFamily, reduced, allLabels(graph.order)),
        nodeReducer: (key, data) => {
          const f = focus.current;
          if (f.visible && !f.visible.has(key)) return { ...data, hidden: true };
          if (key === f.hovered || key === f.selected) return { ...data, forceLabel: true, highlighted: key === f.selected, zIndex: 3 };
          if (f.near && !f.near.has(key)) return { ...data, color: mixRgb(data.color, f.colors?.["--canvas"] ?? "", DIM), label: null, forceLabel: false, zIndex: 0 };
          // Local mode shows a small part of the graph: every label in it, as in a small graph.
          if (f.visible && allLabels(f.visible.size)) return { ...data, forceLabel: true };
          return data;
        },
        edgeReducer: (key, data) => {
          const f = focus.current;
          const [source, target] = graph.extremities(key);
          if (f.visible && !(f.visible.has(source) && f.visible.has(target))) return { ...data, hidden: true };
          const lit = f.hovered ?? f.selected;
          if (lit && source !== lit && target !== lit) return { ...data, color: mixRgb(data.color, f.colors?.["--canvas"] ?? "", DIM) };
          return data;
        },
      });
    } catch {
      setWebgl(false);
      return;
    }
    drawn.current = { sigma, graph, fitted: false };
    // For the end-to-end tests: where a node is on screen, so a test can hover and click it as a person would.
    Object.assign(container.current, { nodePosition: (key: string) => sigma.graphToViewport(graph.getNodeAttributes(key) as { x: number; y: number }) });
    // Hover: written to the container directly (no React render on every move); tests read data-hovered.
    sigma.on("enterNode", ({ node }) => {
      focus.current.hovered = node;
      Object.assign(sigma.getContainer().dataset, { hovered: node });
      sigma.getContainer().style.cursor = "pointer";
      refocus();
    });
    sigma.on("leaveNode", () => {
      focus.current.hovered = null;
      Object.assign(sigma.getContainer().dataset, { hovered: "" });
      sigma.getContainer().style.cursor = "";
      refocus();
    });
    sigma.on("clickNode", ({ node }) => select(node));
    sigma.on("clickStage", () => select(null));
    const resized = new ResizeObserver(() => {
      sigma.resize();
      sigma.refresh();
    });
    resized.observe(container.current);
    runLayout();
    return () => {
      resized.disconnect();
      worker.current?.terminate();
      worker.current = null;
      sigma.kill();
      drawn.current = null;
    };
  }, [shown, state, webgl, reduced, runLayout, refocus, select]);

  // "Show in graph": once the layout has settled, select the note, show its neighbours, centre it.
  useEffect(() => {
    if (!settled || !focusOn || focusHandled.current === focusOn || !byKey.has(focusOn)) return;
    focusHandled.current = focusOn;
    select(focusOn);
    setDepth(1);
    requestAnimationFrame(() => centre(focusOn));
  }, [settled, focusOn, byKey, select, centre]);

  // A theme change recolours what is drawn; nothing moves.
  useEffect(() => {
    const view = drawn.current;
    if (!view || !probe.current) return;
    const colors = palette(probe.current);
    focus.current.colors = colors;
    paint(view.graph, colors);
    view.sigma.setSettings(sigmaSettings(colors, view.sigma.getSettings().labelFont, reduced, allLabels(view.graph.order)));
  }, [theme, scheme, reduced]);

  // Esc clears the selection, then the search; not while a dialog or the note pane has the key.
  const latest = useRef({ selected, query });
  latest.current = { selected, query };
  const escape = useCallback(() => {
    if (latest.current.selected) select(null);
    else if (latest.current.query) setQuery("");
    else return false;
    return true;
  }, [select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "Escape" || target?.closest('[role="dialog"]') || (target && notePaneRef.current?.contains(target))) return;
      escape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escape]);

  // Fit to screen: the graph's bounds as they are now, with the stage padding around them.
  const fit = () => {
    const view = drawn.current;
    if (!view) return;
    keepBounds(view.sigma);
    if (reduced) view.sigma.getCamera().setState(FITTED);
    else void view.sigma.getCamera().animate(FITTED, { duration: 300 });
  };

  const pick = (node: GraphNode) => {
    select(node.key);
    setQuery(nodeLabel(node));
    centre(node.key);
  };

  const openNote = (id: string) => {
    const node = shown?.nodes.find((n) => n.type === "note" && n.id === id);
    if (node) pick(node);
  };

  const drawing = shown && state !== "empty" && webgl;
  const noteOpen = current?.type === "note" ? current : null;

  return (
    <section className="pane graph-page" aria-labelledby="graph-title">
      <header className="pane-header">
        <h1 className="pane-title" id="graph-title">
          Graph
        </h1>
        <p className="graph-status" role="status">
          {counted ? statusLine(counted.counts) : load.status === "loading" ? "Loading the graph…" : ""}
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
      ) : shown ? (
        <>
          <div className="graph-toolbar">
            <GraphSearch nodes={shown.nodes} query={query} onQuery={setQuery} onPick={pick} onEscape={escape} />
            {current ? (
              <div className="graph-selection">
                <span className="graph-selected">
                  Selected: <strong translate="no">{nodeLabel(current)}</strong>
                </span>
                <div className="segmented" role="radiogroup" aria-label={`Show around ${nodeLabel(current)}`}>
                  {([0, 1, 2] as const).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={depth === d} onClick={() => setDepth(d)}>
                      {d === 0 ? "Everything" : d === 1 ? "1 step" : "2 steps"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="graph-body" data-note={noteOpen !== null}>
            <div className="graph-stage">
              {state === "unconnected" ? <p className="graph-notice">Your notes aren't connected yet. Add tags, or [[links]] in My notes.</p> : null}
              {!webgl ? <p className="graph-notice">This browser can't draw the graph: WebGL is off or not available. The counts above still hold.</p> : null}
              {/* Under reduced motion the canvas stays invisible (it keeps its size, which sigma needs) until the layout settles. */}
              {drawing ? <div className="graph-canvas" ref={container} aria-hidden="true" data-settled={settled} data-waiting={reduced && !settled} data-selected={current?.key ?? ""} /> : null}
              {drawing && reduced && !settled ? <p className="graph-arranging">Arranging the graph…</p> : null}
              <Legend shown={shown} />
            </div>
            {noteOpen ? (
              <aside className="graph-note" ref={notePaneRef} aria-label="Note">
                <button type="button" className="button ghost icon-button graph-note-close" onClick={() => select(null)} aria-label="Close the note" title="Close the note (Esc)">
                  <Icon name="x" />
                </button>
                {renderNote({ id: noteOpen.id, file: noteOpen.file }, openNote)}
              </aside>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

// The search box: type a name, pick from up to 8 matches (the [[ autocomplete's pattern); the graph
// selects the node and centres on it.
function GraphSearch({ nodes, query, onQuery, onPick, onEscape }: { nodes: GraphNode[]; query: string; onQuery: (q: string) => void; onPick: (node: GraphNode) => void; onEscape: () => boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = open ? searchNodes(nodes, query) : [];
  const at = Math.min(active, options.length - 1);
  const pick = (node: GraphNode) => {
    setOpen(false);
    onPick(node);
  };
  return (
    <div className="link-input graph-search">
      <input
        className="input"
        name="graph-search"
        type="search"
        role="combobox"
        aria-label="Find a note or tag in the graph"
        aria-expanded={options.length > 0}
        aria-controls={options.length ? `${id}-options` : undefined}
        aria-activedescendant={options.length ? `${id}-option-${at}` : undefined}
        aria-autocomplete="list"
        placeholder="Find a note or #tag…"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (options.length) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
          } else if (e.key === "Enter" && options.length) {
            e.preventDefault();
            pick(options[at]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (options.length) setOpen(false);
            else if (!onEscape()) e.currentTarget.blur();
          }
          // Every key stays here: no single-key shortcuts while you type a name.
          e.stopPropagation();
        }}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        spellCheck={false}
      />
      {options.length ? (
        <ul className="link-options" id={`${id}-options`} role="listbox" aria-label="Matching notes and tags">
          {options.map((node, i) => (
            <li
              key={node.key}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === at}
              className="link-option"
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== at && setActive(i)}
              onClick={() => pick(node)}
            >
              <span className="label" translate="no">
                {nodeLabel(node)}
              </span>
              <span className="detail">{node.type === "note" ? (node.status === "inbox" ? "note, in the inbox" : "note") : node.type === "tag" ? `tag, ${node.count} ${node.count === 1 ? "note" : "notes"}` : "no note yet"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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

// Bounds that stay put once the layout has settled, so a later change doesn't rescale the view.
function keepBounds(sigma: Sigma): void {
  sigma.setCustomBBox(null);
  sigma.refresh();
  sigma.setCustomBBox(sigma.getBBox());
}

const FITTED = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };

// Labels: a small graph forces every one; a larger one leaves them to sigma's label grid, which
// keeps at most one per cell, the largest node first. The hovered and selected nodes are forced by
// the reducer.
function buildGraph(shown: Shown): Graph {
  const graph = new Graph({ type: "undirected", multi: true });
  const every = allLabels(shown.nodes.length);
  for (const node of shown.nodes) {
    const { x, y } = seedPosition(node.key);
    const common = { x, y, label: nodeLabel(node), forceLabel: every };
    if (node.type === "note") graph.addNode(node.key, { ...common, size: nodeSize("note", node.degree), kindGroup: node.kind_group, inbox: node.status === "inbox", zIndex: 1 });
    else if (node.type === "tag") graph.addNode(node.key, { ...common, size: nodeSize("tag", node.count), tag: true, zIndex: 2 });
    else graph.addNode(node.key, { ...common, size: nodeSize("ghost", 0), ghost: true, zIndex: 0 });
  }
  for (const edge of shown.edges) {
    graph.addEdgeWithKey(`${edge.type} ${edge.source} ${edge.target}`, edge.source, edge.target, { type: "line", edgeType: edge.type, size: edgeStyle(edge.type).size });
  }
  return graph;
}

function paint(graph: Graph, colors: Colors): void {
  graph.updateEachNodeAttributes((_key, attr) => {
    const base = attr.tag ? colors["--graph-tag"] : attr.ghost ? colors["--graph-other"] : colors[KIND_COLOR[attr.kindGroup as string] as keyof Colors];
    return { ...attr, color: attr.inbox || attr.ghost ? mixRgb(base, colors["--canvas"], INBOX_FADE) : base };
  });
  graph.updateEachEdgeAttributes((_key, attr) => ({ ...attr, color: colors[edgeStyle(attr.edgeType).color as keyof Colors] }));
}

function sigmaSettings(colors: Colors, font: string, reduced: boolean, everyLabel: boolean): Partial<Settings> {
  return {
    labelFont: font,
    labelSize: 12,
    labelWeight: "500",
    labelColor: { color: colors["--ink"] },
    // A larger graph: one label per grid cell of 160 px, the largest node there, if it is at least
    // 12 on screen; more cells hold a label as you zoom in.
    labelRenderedSizeThreshold: everyLabel ? 0 : 12,
    labelGridCellSize: 160,
    labelDensity: 1,
    minEdgeThickness: 1,
    zIndex: true,
    stagePadding: 64, // room for the labels of the outermost nodes
    renderEdgeLabels: false,
    zoomDuration: reduced ? 0 : 250,
    inertiaDuration: reduced ? 0 : 150,
    doubleClickZoomingDuration: reduced ? 0 : 200,
    defaultDrawNodeLabel: drawLabel(colors),
    defaultDrawNodeHover: drawHover(colors),
  };
}

// A label in the theme's ink with a halo in the canvas colour, so it stays readable where it
// crosses nodes and edges.
function drawLabel(colors: Colors): NodeLabelDrawingFunction {
  return (context, data, settings) => {
    if (!data.label) return;
    const size = settings.labelSize;
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
    const x = data.x + data.size + 3;
    const y = data.y + size / 3;
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = colors["--canvas"];
    context.strokeText(data.label, x, y);
    context.fillStyle = colors["--ink"];
    context.fillText(data.label, x, y);
  };
}

// The hovered or selected node's label on a surface-2 plate, in the theme's ink, with a ring around
// the node (sigma's default plate is white).
function drawHover(colors: Colors): NodeHoverDrawingFunction {
  return (context, data, settings) => {
    const size = settings.labelSize;
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
    const label = data.label ?? "";
    const width = context.measureText(label).width;
    const x = data.x + data.size + 4;
    context.strokeStyle = colors["--ink"];
    context.lineWidth = 2;
    context.beginPath();
    context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
    context.stroke();
    if (!label) return;
    context.fillStyle = colors["--surface-2"];
    context.beginPath();
    context.roundRect(x, data.y - size / 2 - 4, width + 8, size + 8, 4);
    context.fill();
    context.fillStyle = colors["--ink"];
    context.fillText(label, x + 4, data.y + size / 3);
  };
}
