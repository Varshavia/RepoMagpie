// The graph's layout, off the main thread (decision 0028): ForceAtlas2's own iteration step from
// graphology-layout-forceatlas2, run on the node and edge matrices the page builds until the nodes
// settle, or for the full count on Re-layout (the stop rule, decision 0049). Vite builds this file
// into dist/ui/, so it loads from 'self' under the app's CSP; the package's own worker starts from a
// blob: URL, which the CSP blocks.
import iterate from "graphology-layout-forceatlas2/iterate.js";
import { iterateUntilSettled } from "./logic/layout-stop.ts";

export interface LayoutRequest {
  nodes: Float32Array; // the package's node matrix (helpers.graphToByteArrays)
  edges: Float32Array;
  settings: object;
  full: boolean; // Re-layout: every iteration, not only until the nodes settle
  // At most one progress message per `every` ms: each one makes the page copy the positions and
  // draw a frame, which at 2,000 nodes took CPU from this worker (1.4–2.0 s instead of 1.1 s for
  // the whole layout, with progress every 25 iterations).
  every: number;
  progress: boolean; // false under reduced motion: only the settled layout is sent
}

export interface LayoutReply {
  nodes: Float32Array;
  done: boolean;
  iterations?: number; // with `done`: how many ran
}

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { nodes, edges, settings, full, every, progress } = event.data;
  let sent = performance.now();
  const iterations = iterateUntilSettled(nodes, () => iterate(settings, nodes, edges), full, () => {
    if (!progress || performance.now() - sent < every) return;
    self.postMessage({ nodes: nodes.slice(), done: false } satisfies LayoutReply);
    sent = performance.now();
  });
  self.postMessage({ nodes, done: true, iterations } satisfies LayoutReply, { transfer: [nodes.buffer] });
};
