// The graph page (decision 0028, docs/ui.md §7): one journal's notes, the tags they carry and the
// connections between them, drawn with sigma (WebGL) and laid out by ForceAtlas2 in a worker. Loaded
// on demand, in its own chunk, so the other screens never load sigma or graphology. The canvas is a
// visual aid, hidden from assistive technology; the status line, the search box, the filters, the
// neighbours list and the legend say in words what it shows.
import Graph from "graphology";
import { assignLayoutChanges, graphToByteArrays } from "graphology-layout-forceatlas2/helpers.js";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Sigma from "sigma";
import type { NodeHoverDrawingFunction, NodeLabelDrawingFunction } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import { api, takeGraph, type ApiError, type GraphJson, type Scope } from "../api.ts";
import { Icon } from "../icons.tsx";
import {
  around,
  DEFAULT_SOURCES,
  domainColor,
  drawable,
  edgeStyle,
  filtersActive,
  graphState,
  joinPosition,
  KIND_COLOR,
  KIND_GROUP_LABEL,
  LABEL_STYLE,
  largeGraph,
  largest,
  LAYOUT,
  layoutSettings,
  mixRgb,
  neighbourGroups,
  neighbours,
  NO_FILTERS,
  nodeDetail,
  nodeLabel,
  nodeSize,
  notice,
  placeLabels,
  searchNodes,
  seedPosition,
  shownDomains,
  statusLine,
  type Filters,
  type GraphEdge,
  type GraphNode,
  type KindGroup,
  type LabelCandidate,
  type PlacedLabel,
  type Shown,
  type Sources,
} from "../logic/graph.ts";
import type { LayoutReply, LayoutRequest } from "../layout.worker.ts";
import { MOD, type Scheme, type Theme } from "../platform.ts";
import { DOMAIN_IDS } from "../../../src/core/domains.ts";
import { EmptyState } from "./common.tsx";
import "./GraphPage.css";

type Load = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; doc: GraphJson };
type Colors = Record<string, string>; // each of TOKENS, as the browser resolves it
type Depth = 0 | 1 | 2; // local mode: 0 shows everything
type Point = { x: number; y: number };

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
  "--ink-muted",
  ...DOMAIN_IDS.map(domainColor),
];

const KIND_GROUPS = Object.entries(KIND_GROUP_LABEL) as [KindGroup, string][];

const SOURCE_TOGGLES: [keyof Sources, string][] = [
  ["tagged", "Tags"],
  ["oneNoteTags", "Tags on one note"],
  ["link", "Links"],
  ["alternative", "Alternatives"],
  ["similar", "Similar"],
  ["ghosts", "Missing notes"],
];

const INBOX_FADE = 0.55; // toward the canvas
const SUGGESTED_FADE = 0.4; // colour by domain: a suggested domain, toward the canvas
const DIM = 0.7; // what isn't around the hovered or selected node, toward the canvas
const LARGEST = 20; // the neighbours list with nothing selected
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// What the reducers read on every frame: kept in a ref, so a hover doesn't re-render React.
interface Focus {
  hovered: string | null;
  selected: string | null;
  near: Set<string> | null; // the lit node and its neighbours
  visible: Set<string> | null; // local mode
  colors: Colors | null;
  byDomain: boolean; // "Colour by domain"
}

// What is drawn: sigma, its graph, what the graph mirrors, and where nodes that left it were.
interface View {
  sigma: Sigma;
  graph: Graph;
  fitted: boolean;
  shown: Shown;
  left: Map<string, Point>;
  labels: LabelLayer;
}

interface Props {
  journal: Scope;
  theme: Theme;
  scheme: Scheme; // the system's, which the page shows when the theme is "system" (App follows it)
  focus: string | null; // "Show in graph": the node to select, in local mode
  refresh: number; // grows when the journal's notes change on disk (notes-changed)
  onAdd:(target?: string) => void; // a missing note: Add, with its target filled in
  onSearch: (name: string) => void; // an ambiguous one: Search, with its name
  // The note pane beside the graph; `open` selects another note of the graph (a [[link]] in it).
  renderNote: (note: { id: string; file: string }, open: (id: string) => void) => ReactNode;
}

export default function GraphPage({ journal, theme, scheme, focus: focusOn, refresh, onAdd, onSearch, renderNote }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [webgl, setWebgl] = useState(hasWebGL);
  const [settled, setSettled] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth>(0);
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Sources>(DEFAULT_SOURCES);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [kept, setKept] = useState<string[]>([]); // tags on one note found with the search box: drawn
  const [centreOn, setCentreOn] = useState<string | null>(null); // such a tag, centred once drawn
  const container = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const notePaneRef = useRef<HTMLElement>(null);
  const drawn = useRef<View | null>(null);
  const worker = useRef<Worker | null>(null);
  const [byDomain, setByDomain] = useState(false);
  const focus = useRef<Focus>({ hovered: null, selected: null, near: null, visible: null, colors: null, byDomain: false });
  const focusHandled = useRef<string | null>(null);
  const reduced = useMemo(() => matchMedia(REDUCED_MOTION).matches, []);

  // Missing notes are always fetched; their toggle only decides whether they are drawn. A change on
  // disk (`refresh`) fetches again while the graph stays on screen; the new data is synced into it,
  // so what is drawn keeps its place. A failed refetch keeps what is shown; the next change tries again.
  // The first fetch is usually App's, started while this chunk loaded (takeGraph).
  useEffect(() => {
    let current = true;
    setLoad((l) => (l.status === "ready" ? l : { status: "loading" }));
    const early = takeGraph(journal);
    if (!early) performance.mark("graph:fetch");
    (early ?? api.graph(journal, true)).then(
      (doc) => {
        if (!current) return;
        performance.mark("graph:data");
        setLoad({ status: "ready", doc });
      },
      (error: ApiError) => current && setLoad((l) => (l.status === "ready" ? l : { status: "error", error: error.message })),
    );
    return () => {
      current = false;
    };
  }, [journal, attempt, refresh]);

  const doc = load.status === "ready" ? load.doc : null;
  const shown = useMemo(() => (doc ? drawable(doc, sources, filters, kept) : null), [doc, sources, filters, kept]);
  // The search box also finds the tags on one note that aren't drawn; picking one draws it.
  const findable = useMemo(() => (doc ? drawable(doc, { ...sources, oneNoteTags: true }, filters).nodes : []), [doc, sources, filters]);
  const latest = useRef(shown);
  latest.current = shown;
  const state = doc ? graphState(doc, sources) : null;
  const byKey = useMemo(() => new Map((shown?.nodes ?? []).map((n) => [n.key, n])), [shown]);
  const current = selected ? (byKey.get(selected) ?? null) : null;
  const local = useMemo(() => (current && depth && shown ? around(shown, current.key, depth) : null), [current, depth, shown]);
  const counted = local ?? shown;
  const drawing = Boolean(shown) && state !== "empty" && webgl;

  // The reducers' view of the selection, local mode and hover; then a redraw.
  const refocus = useCallback(() => {
    const f = focus.current;
    const lit = f.hovered ?? f.selected;
    f.near = lit && latest.current ? neighbours(latest.current.edges, lit, 1) : null;
    drawn.current?.sigma.refresh();
  }, []);

  useEffect(() => {
    focus.current.selected = current?.key ?? null;
    focus.current.visible = local ? new Set(local.nodes.map((n) => n.key)) : null;
    refocus();
  }, [current, local, shown, refocus]);

  const centre = useCallback(
    (key: string) => {
      const view = drawn.current;
      if (!view || !view.graph.hasNode(key)) return;
      // From the node's graph position, not sigma.getNodeDisplayData: after a change to the graph
      // (a toggle, a filter, a live update) sigma's display data holds raw positions until its next
      // frame, and a camera aimed at them points far off the graph, leaving the canvas blank.
      const { sigma } = view;
      const { x, y } = sigma.viewportToFramedGraph(sigma.graphToViewport(view.graph.getNodeAttributes(key) as Point));
      const camera = sigma.getCamera();
      const target = { x, y, ratio: camera.ratio, angle: 0 }; // pans; the zoom stays yours
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
      // Performance marks for the page's budget (data, layout settled, first frame after it; docs/ui.md §10).
      performance.mark("graph:settled");
      view.sigma.once("afterRender", () => performance.mark("graph:drawn"));
      keepBounds(view.sigma);
      if (!view.fitted) {
        view.sigma.getCamera().setState(FITTED);
        view.fitted = true;
      }
      setSettled(true);
    };
    const { nodes, edges } = graphToByteArrays(view.graph, () => 1);
    const request: LayoutRequest = { nodes, edges, settings: layoutSettings(view.graph.order), iterations: LAYOUT.iterations, every: LAYOUT.progressEvery, progress: !reduced };
    layout.postMessage(request, [nodes.buffer, edges.buffer]);
  }, [reduced]);

  // Sigma, once per journal: from the nodes' seed positions, then the layout. Later changes (a
  // filter, a toggle) are synced into the same graph below; nothing already drawn moves.
  useEffect(() => {
    const first = latest.current;
    if (!drawing || !first || !container.current || !probe.current) return;
    const colors = palette(probe.current);
    focus.current.colors = colors;
    const graph = new Graph({ type: "undirected", multi: true });
    syncGraph(graph, first, seedPosition, colors, focus.current.byDomain);
    const labels = labelLayer(colors, getComputedStyle(container.current).fontFamily);
    let sigma: Sigma;
    try {
      sigma = new Sigma(graph, container.current, {
        ...sigmaSettings(colors, labels, reduced),
        // labelRank orders the labels (placeLabels): hovered, selected, the lit node's neighbours.
        nodeReducer: (key, data) => {
          const f = focus.current;
          if (f.visible && !f.visible.has(key)) return { ...data, hidden: true };
          if (key === f.hovered || key === f.selected) return { ...data, highlighted: key === f.selected, zIndex: 3, labelRank: key === f.hovered ? 0 : 1 };
          if (f.near && !f.near.has(key)) return { ...data, color: mixRgb(data.color, f.colors?.["--canvas"] ?? "", DIM), label: null, zIndex: 0 };
          if (f.near) return { ...data, labelRank: 2 };
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
    drawn.current = { sigma, graph, fitted: false, shown: first, left: new Map(), labels };
    sigma.on("beforeRender", labels.reset);
    sigma.on("afterRender", labels.draw);
    // For the end-to-end tests: where a node is on screen, so a test can hover and click it as a
    // person would; and the boxes of the labels drawn in the last frame, plates included.
    Object.assign(container.current, {
      nodePosition: (key: string) => sigma.graphToViewport(graph.getNodeAttributes(key) as Point),
      labelBoxes: () => labels.placed.map(({ candidate, box, plate }) => ({ key: candidate.key, plate, ...box })),
    });
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
  }, [drawing, reduced, runLayout, refocus, select]);

  // A filter, a toggle or a change on disk: the graph drops what is no longer drawn and adds what
  // now is, where it was before, or next to a neighbour. The view keeps its bounds, so the camera
  // doesn't jump. A layout still running starts again from the new graph. No bulk edge update here:
  // after a dropped or added node or edge, sigma rebuilds its edge indices only on its next frame,
  // and until then one throws ("can't be repaint"); new edges get their colour as they are added.
  useEffect(() => {
    const view = drawn.current;
    const colors = focus.current.colors;
    if (!view || !shown || !colors || view.shown === shown) return;
    view.shown = shown;
    const at = (key: string) => (view.graph.hasNode(key) ? (view.graph.getNodeAttributes(key) as Point) : view.left.get(key));
    const spread = 0.03 * extent(view.graph);
    syncGraph(view.graph, shown, (key) => joinPosition(key, shown.edges, at, spread), colors, focus.current.byDomain, view.left);
    if (focus.current.hovered && !view.graph.hasNode(focus.current.hovered)) {
      focus.current.hovered = null;
      Object.assign(view.sigma.getContainer().dataset, { hovered: "" });
    }
    if (worker.current) runLayout();
  }, [shown, runLayout]);

  // A tag on one note picked in the search box: once it is drawn, centre it.
  useEffect(() => {
    if (!centreOn || !drawn.current?.graph.hasNode(centreOn)) return;
    setCentreOn(null);
    const key = centreOn;
    requestAnimationFrame(() => centre(key));
  }, [centreOn, shown, centre]);

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
    paint(view.graph, colors, focus.current.byDomain);
    view.labels.colors = colors;
    view.sigma.setSettings(sigmaSettings(colors, view.labels, reduced));
  }, [theme, scheme, reduced]);

  // "Colour by domain" recolours the notes too; nothing moves.
  useEffect(() => {
    focus.current.byDomain = byDomain;
    const view = drawn.current;
    if (view && focus.current.colors) paint(view.graph, focus.current.colors, byDomain);
  }, [byDomain]);

  // Esc clears the selection, then the search; not while a dialog or the note pane has the key.
  const keys = useRef({ selected, query });
  keys.current = { selected, query };
  const escape = useCallback(() => {
    if (keys.current.selected) select(null);
    else if (keys.current.query) setQuery("");
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

  // A node from the neighbours list: selected and centred.
  const go = (node: GraphNode) => {
    select(node.key);
    centre(node.key);
  };

  const pick = (node: GraphNode) => {
    setQuery(nodeLabel(node));
    if (byKey.has(node.key)) return go(node);
    // A tag on one note, not drawn: draw it, select it, and centre it once it's there.
    setKept((k) => [...k, node.key]);
    select(node.key);
    setCentreOn(node.key);
  };

  const openNote = (id: string) => {
    const node = shown?.nodes.find((n) => n.type === "note" && n.id === id);
    if (node) pick(node);
  };

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
            <button type="button" className="button secondary" onClick={() => onAdd()}>
              <Icon name="plus" />
              Add a note
            </button>
          }
        >
          {`Nothing to draw yet. Add a repository here, or from the palette (${MOD}+K).`}
        </EmptyState>
      ) : doc && shown ? (
        <>
          <div className="graph-toolbar">
            <GraphSearch nodes={findable} query={query} onQuery={setQuery} onPick={pick} onEscape={escape} byDomain={byDomain} />
            {current ? (
              <div className="graph-selection">
                <span className="graph-selected">
                  Selected: <strong translate="no">{nodeLabel(current)}</strong>
                </span>
                {current.type === "ghost" && current.reason === "ambiguous" ? (
                  <button type="button" className="button secondary" onClick={() => onSearch(current.target)}>
                    <Icon name="search" />
                    Search notes
                  </button>
                ) : current.type === "ghost" ? (
                  <button type="button" className="button secondary" onClick={() => onAdd(current.target)}>
                    <Icon name="plus" />
                    Add a note
                  </button>
                ) : null}
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
          <GraphFilters doc={doc} filters={filters} onFilters={setFilters} sources={sources} onSources={setSources} byDomain={byDomain} onByDomain={setByDomain} />
          <div className="graph-body" data-note={noteOpen !== null}>
            <Neighbours shown={shown} current={current} onOpen={go} byDomain={byDomain} />
            <div className="graph-stage">
              {/* Under reduced motion the canvas stays invisible (it keeps its size, which sigma needs) until the layout settles. */}
              {drawing ? <div className="graph-canvas" ref={container} aria-hidden="true" data-settled={settled} data-waiting={reduced && !settled} data-selected={current?.key ?? ""} /> : <div className="graph-blank" />}
              {/* Over the top of the canvas, so a notice never resizes it or moves the view. */}
              <div className="graph-notices">
                {!webgl ? <p className="graph-notice">This browser can't draw the graph: WebGL is off or not available. The counts above and the neighbours list still hold.</p> : null}
                {!shown.counts.notes && filtersActive(filters) ? (
                  <p className="graph-notice">
                    No notes match these filters.{" "}
                    <button type="button" className="button ghost" onClick={() => setFilters(NO_FILTERS)}>
                      Clear the filters
                    </button>
                  </p>
                ) : state && notice(state) ? (
                  <p className="graph-notice">{notice(state)}</p>
                ) : null}
              </div>
              {drawing && reduced && !settled ? <p className="graph-arranging">Arranging the graph…</p> : null}
              <Legend shown={shown} byDomain={byDomain} />
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

// The filters (which notes) and the toggles (which connections, missing notes, the colours).
function GraphFilters({ doc, filters, onFilters, sources, onSources, byDomain, onByDomain }: {
  doc: GraphJson;
  filters: Filters;
  onFilters: (f: Filters) => void;
  sources: Sources;
  onSources: (s: Sources) => void;
  byDomain: boolean;
  onByDomain: (on: boolean) => void;
}) {
  const id = useId();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onFilters({ ...filters, [key]: value });
  const tags = doc.nodes.flatMap((n) => (n.type === "tag" ? [n] : [])).sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return (
    <div className="filters graph-filters">
      <div className="graph-filter-group" role="group" aria-label="Filters">
        <select className="select" value={filters.kindGroup} onChange={(e) => set("kindGroup", e.target.value as KindGroup | "")} aria-label="Kind group">
          <option value="">Any kind</option>
          {KIND_GROUPS.map(([group, label]) => (
            <option key={group} value={group}>
              {label}
            </option>
          ))}
        </select>
        <div className="segmented" role="radiogroup" aria-label="Status">
          {(["", "reviewed", "inbox"] as const).map((s) => (
            <button key={s || "any"} type="button" role="radio" aria-checked={filters.status === s} onClick={() => set("status", s)}>
              {s === "" ? "Any" : s === "reviewed" ? "Reviewed" : "Inbox"}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={filters.tried} onChange={(e) => set("tried", e.target.checked)} />
          Tried only
        </label>
        <select
          className="select"
          value=""
          onChange={(e) => e.target.value && set("tags", [...filters.tags, e.target.value])}
          aria-label="Add a tag filter (notes with any of the chosen tags)"
          disabled={tags.length === filters.tags.length}
        >
          <option value="">{filters.tags.length ? "Or with tag…" : "With tag…"}</option>
          {tags
            .filter((t) => !filters.tags.includes(t.tag))
            .map((t) => (
              <option key={t.tag} value={t.tag}>
                {`${t.tag} (${t.count})`}
              </option>
            ))}
        </select>
        {filters.tags.length ? (
          <ul className="chips" aria-label="Chosen tags">
            {filters.tags.map((tag) => (
              <li key={tag}>
                <button type="button" className="chip chosen" aria-label={`Remove the #${tag} filter`} onClick={() => set("tags", filters.tags.filter((t) => t !== tag))}>
                  #{tag}
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {filtersActive(filters) ? (
          <button type="button" className="button ghost" onClick={() => onFilters(NO_FILTERS)}>
            Clear the filters
          </button>
        ) : null}
      </div>
      <div className="graph-filter-group" role="group" aria-labelledby={`${id}-draw`}>
        <span className="section-label" id={`${id}-draw`}>
          Draw
        </span>
        {SOURCE_TOGGLES.map(([source, label]) => (
          <label key={source} className="check">
            <input type="checkbox" checked={sources[source]} onChange={(e) => onSources({ ...sources, [source]: e.target.checked })} />
            {label}
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={byDomain} onChange={(e) => onByDomain(e.target.checked)} />
          Colour by domain
        </label>
      </div>
    </div>
  );
}

// The accessible path (docs/ui.md §7): the selected node's neighbours by edge type, or the nodes
// with the most connections. A listbox: the arrows move, Enter opens.
function Neighbours({ shown, current, onOpen, byDomain }: { shown: Shown; current: GraphNode | null; onOpen: (node: GraphNode) => void; byDomain: boolean }) {
  const id = useId();
  const groups: { label: string; nodes: GraphNode[] }[] = current ? neighbourGroups(shown, current.key) : [{ label: "Most connected", nodes: largest(shown, LARGEST) }];
  const options = groups.flatMap((g) => g.nodes);
  const [active, setActive] = useState(0);
  const at = Math.min(active, options.length - 1);
  const title = current ? `Around ${nodeLabel(current)}` : "Most connected";
  useEffect(() => setActive(0), [current]);
  useEffect(() => {
    if (at >= 0) document.getElementById(`${id}-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [id, at]);
  let index = 0;
  return (
    <section className="graph-neighbours" aria-labelledby={`${id}-title`}>
      <h2 className="graph-neighbours-title" id={`${id}-title`} translate="no">
        {title}
      </h2>
      {options.length ? (
        <div
          className="graph-neighbour-list"
          role="listbox"
          tabIndex={0}
          aria-label={current ? `Neighbours of ${nodeLabel(current)}` : "The nodes with the most connections"}
          aria-activedescendant={`${id}-${at}`}
          onKeyDown={(e) => {
            const move = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: options.length - 1 }[e.key];
            if (move !== undefined) setActive(Math.max(0, Math.min(options.length - 1, move)));
            else if (e.key === "Enter") onOpen(options[at]);
            else return;
            e.preventDefault();
            e.stopPropagation(); // not the app's j/k and Enter
          }}
        >
          {groups.map((group, g) => (
            <ul key={group.label} role="group" aria-labelledby={current ? `${id}-group-${g}` : undefined} aria-label={current ? undefined : group.label}>
              {current ? (
                <li role="presentation" className="graph-neighbour-group" id={`${id}-group-${g}`}>
                  {group.label}
                </li>
              ) : null}
              {group.nodes.map((node) => {
                const i = index++;
                return (
                  <li
                    key={`${group.label} ${node.key}`}
                    id={`${id}-${i}`}
                    role="option"
                    aria-selected={i === at}
                    className="link-option"
                    onClick={() => {
                      setActive(i);
                      onOpen(node);
                    }}
                  >
                    <span className="label" translate="no" title={nodeLabel(node)}>
                      {nodeLabel(node)}
                    </span>
                    <span className="detail">{nodeDetail(node, byDomain)}</span>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      ) : (
        <p className="graph-neighbour-none">{current ? "No connections drawn." : "Nothing drawn."}</p>
      )}
    </section>
  );
}

// The search box: type a name, pick from up to 8 matches (the [[ autocomplete's pattern); the graph
// selects the node and centres on it.
function GraphSearch({ nodes, query, onQuery, onPick, onEscape, byDomain }: { nodes: GraphNode[]; query: string; onQuery: (q: string) => void; onPick: (node: GraphNode) => void; onEscape: () => boolean; byDomain: boolean }) {
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
              <span className="detail">{nodeDetail(node, byDomain)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Every colour the graph uses, also in words (docs/ui.md §9). Coloured by domain: the domains
// present, a dimmer dot for a suggested one, grey for none; there is no inbox fade then.
function Legend({ shown, byDomain }: { shown: Shown; byDomain: boolean }) {
  const edgeTypes = new Set(shown.edges.map((e) => e.type));
  return (
    <div className="graph-legend" aria-label="Legend" role="group">
      <ul>
        {byDomain ? (
          <>
            {shownDomains(shown).map((domain) => (
              <li key={domain}>
                <span className="swatch dot" style={{ background: `var(${domainColor(domain)})` }} aria-hidden="true" />
                {domain}
              </li>
            ))}
            <li>
              <span className="swatch dot suggested" aria-hidden="true" />
              Dimmer: a suggested domain
            </li>
            <li>
              <span className="swatch dot" style={{ background: "var(--graph-other)" }} aria-hidden="true" />
              Grey: no domain
            </li>
          </>
        ) : (
          KIND_GROUPS.map(([group, label]) => (
            <li key={group}>
              <span className="swatch dot" style={{ background: `var(${KIND_COLOR[group]})` }} aria-hidden="true" />
              {label}
            </li>
          ))
        )}
        <li>
          <span className="swatch dot small" style={{ background: "var(--graph-tag)" }} aria-hidden="true" />
          #tag
        </li>
        {byDomain ? null : (
          <li>
            <span className="swatch dot faded" aria-hidden="true" />
            Faded: in the inbox
          </li>
        )}
        {shown.nodes.some((n) => n.type === "ghost") ? (
          <li>
            <span className="swatch dot faded ghost" aria-hidden="true" />
            Faded grey: no note yet
          </li>
        ) : null}
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

// The larger side of the graph's bounds, in graph coordinates.
function extent(graph: Graph): number {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  graph.forEachNode((_key, { x, y }) => {
    [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
  });
  return graph.order > 1 ? Math.max(maxX - minX, maxY - minY) : 100;
}

const edgeKey = (edge: GraphEdge) => `${edge.type} ${edge.source} ${edge.target}`;

// Makes `graph` hold what is shown: drops the rest (remembering where nodes were, in `left`), adds
// what is missing at `place`, and sets every node's size, labels and colour for the graph's new
// size. Every node and edge has its colour from the moment sigma sees it: sigma runs the reducers
// at once, and a node dimmed around a selection is mixed from its colour.
// Labels: every node is a candidate on every frame (forceLabel), and the label layer decides which
// fit (labelLayer, placeLabels).
function syncGraph(graph: Graph, shown: Shown, place: (key: string) => Point, colors: Colors, byDomain: boolean, left?: Map<string, Point>): void {
  const nodes = new Map(shown.nodes.map((n) => [n.key, n]));
  const edges = new Map(shown.edges.map((e) => [edgeKey(e), e]));
  const large = largeGraph(shown.nodes.length);
  for (const key of graph.filterEdges((key) => !edges.has(key))) graph.dropEdge(key);
  for (const key of graph.filterNodes((key) => !nodes.has(key))) {
    left?.set(key, { x: graph.getNodeAttribute(key, "x"), y: graph.getNodeAttribute(key, "y") });
    graph.dropNode(key);
  }
  // Into a drawn graph, tags and missing notes join first: a note joining with a tag that joins too
  // (a tag on one note until then) starts next to it.
  const fresh = shown.nodes.filter((n) => !graph.hasNode(n.key));
  const order = graph.order ? [...fresh.filter((n) => n.type !== "note"), ...fresh.filter((n) => n.type === "note")] : fresh;
  for (const node of order) graph.addNode(node.key, { ...place(node.key), ...nodeAttributes(node, large, colors, byDomain) });
  for (const [key, edge] of edges) {
    if (!graph.hasEdge(key)) graph.addEdgeWithKey(key, edge.source, edge.target, { type: "line", edgeType: edge.type, size: edgeStyle(edge.type).size, color: edgeColor(edge.type, colors) });
  }
  graph.updateEachNodeAttributes((key, { x, y }) => ({ x, y, ...nodeAttributes(nodes.get(key) as GraphNode, large, colors, byDomain) }));
}

function nodeAttributes(node: GraphNode, large: boolean, colors: Colors, byDomain: boolean) {
  const common = { label: nodeLabel(node), forceLabel: true };
  if (node.type === "note") {
    const attr = { kindGroup: node.kind_group, inbox: node.status === "inbox", domain: node.domain, domainSuggested: node.domain_suggested };
    return { ...common, ...attr, size: nodeSize("note", node.degree), zIndex: 1, color: nodeColor(attr, colors, byDomain) };
  }
  if (node.type === "tag") return { ...common, size: nodeSize("tag", node.count, large), tag: true, count: node.count, zIndex: 2, color: nodeColor({ tag: true }, colors, byDomain) };
  return { ...common, size: nodeSize("ghost", 0), ghost: true, zIndex: 0, color: nodeColor({ ghost: true }, colors, byDomain) };
}

// A note's kind colour (faded toward the canvas in the inbox), a tag's, or a missing note's (faded
// grey). Coloured by domain, a note takes its domain's colour (dimmer when suggested), or grey.
function nodeColor(attr: { tag?: unknown; ghost?: unknown; inbox?: unknown; kindGroup?: unknown; domain?: unknown; domainSuggested?: unknown }, colors: Colors, byDomain: boolean): string {
  if (byDomain && !attr.tag && !attr.ghost) {
    if (typeof attr.domain !== "string") return colors["--graph-other"];
    const base = colors[domainColor(attr.domain)];
    return attr.domainSuggested ? mixRgb(base, colors["--canvas"], SUGGESTED_FADE) : base;
  }
  const base = attr.tag ? colors["--graph-tag"] : attr.ghost ? colors["--graph-other"] : colors[KIND_COLOR[attr.kindGroup as string]];
  return attr.inbox || attr.ghost ? mixRgb(base, colors["--canvas"], INBOX_FADE) : base;
}

const edgeColor = (type: GraphEdge["type"], colors: Colors) => colors[edgeStyle(type).color];

// A theme change, or the colour mode: every colour again, nothing moved.
function paint(graph: Graph, colors: Colors, byDomain: boolean): void {
  graph.updateEachNodeAttributes((_key, attr) => ({ ...attr, color: nodeColor(attr, colors, byDomain) }));
  graph.updateEachEdgeAttributes((_key, attr) => ({ ...attr, color: edgeColor(attr.edgeType, colors) }));
}

function sigmaSettings(colors: Colors, labels: LabelLayer, reduced: boolean): Partial<Settings> {
  return {
    labelFont: labels.font,
    labelSize: LABEL_STYLE.note.size, // the hover plate's (drawHover)
    labelWeight: LABEL_STYLE.note.weight,
    labelColor: { color: colors["--ink"] },
    labelRenderedSizeThreshold: 0, // every node is a candidate; the label layer decides
    minEdgeThickness: 1,
    zIndex: true,
    stagePadding: 64, // room for the labels of the outermost nodes
    // A very short window can leave the canvas 0 px tall for a moment; sigma would then throw on
    // every render until it grows again. The ResizeObserver tells it the new size.
    allowInvalidContainer: true,
    renderEdgeLabels: false,
    zoomDuration: reduced ? 0 : 250,
    inertiaDuration: reduced ? 0 : 150,
    doubleClickZoomingDuration: reduced ? 0 : 200,
    defaultDrawNodeLabel: labels.collect,
    defaultDrawNodeHover: drawHover(colors),
  };
}

// Labels that never overlap (decision 0044). Sigma calls `collect` for each node it would label in
// a frame; after the frame, `draw` places them (placeLabels) and draws those that fit on sigma's
// label canvas: note names in the theme's ink, tags smaller in `ink-muted`, each with a halo in the
// canvas colour, so it stays readable where it crosses nodes and edges. The hovered and selected
// labels are only reserved here: sigma draws them on their plates (drawHover).
interface LabelLayer {
  colors: Colors;
  font: string;
  placed: PlacedLabel[]; // the last frame's
  collect: NodeLabelDrawingFunction;
  reset: () => void;
  draw: () => void;
}

function labelLayer(colors: Colors, font: string): LabelLayer {
  let candidates: LabelCandidate[] = [];
  let context: CanvasRenderingContext2D | null = null;
  const widths = new Map<string, number>(); // text widths, by style and label
  const style = (tag: boolean) => (tag ? LABEL_STYLE.tag : LABEL_STYLE.note);
  const fontOf = (tag: boolean) => `${style(tag).weight} ${style(tag).size}px ${layer.font}`;
  const measure = (label: string, tag: boolean) => {
    const key = `${tag ? "#" : "n"} ${label}`;
    let width = widths.get(key);
    if (width === undefined && context) {
      context.font = fontOf(tag);
      width = context.measureText(label).width;
      widths.set(key, width);
    }
    return width ?? 0;
  };
  const layer: LabelLayer = {
    colors,
    font,
    placed: [],
    collect: (ctx, data) => {
      const label = data.label;
      if (!label) return;
      context = ctx;
      const d = data as typeof data & { key?: string; tag?: boolean; count?: number; labelRank?: LabelCandidate["rank"] };
      candidates.push({ key: String(d.key), label, x: d.x, y: d.y, size: d.size, tag: Boolean(d.tag), count: d.count ?? 0, rank: d.labelRank ?? 3 });
    },
    reset: () => {
      candidates = [];
    },
    draw: () => {
      layer.placed = context ? placeLabels(candidates, measure) : [];
      if (!context) return;
      context.lineJoin = "round";
      context.lineWidth = 3;
      context.strokeStyle = layer.colors["--canvas"];
      for (const { candidate: c, plate } of layer.placed) {
        if (plate) continue;
        context.font = fontOf(c.tag);
        const x = c.x + c.size + 3;
        const y = c.y + style(c.tag).size / 3;
        context.strokeText(c.label, x, y);
        context.fillStyle = layer.colors[c.tag ? "--ink-muted" : "--ink"];
        context.fillText(c.label, x, y);
      }
    },
  };
  return layer;
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
