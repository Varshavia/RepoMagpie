// The graph's layout, off the main thread (decision 0028): ForceAtlas2's own iteration step from
// graphology-layout-forceatlas2, run for a fixed number of iterations on the node and edge matrices
// the page builds. Vite builds this file into dist/ui/, so it loads from 'self' under the app's CSP;
// the package's own worker starts from a blob: URL, which the CSP blocks.
import iterate from "graphology-layout-forceatlas2/iterate.js";

export interface LayoutRequest {
  nodes: Float32Array; // the package's node matrix (helpers.graphToByteArrays)
  edges: Float32Array;
  settings: object;
  iterations: number;
  chunk: number; // iterations between progress messages
  progress: boolean; // false under reduced motion: only the settled layout is sent
}

export interface LayoutReply {
  nodes: Float32Array;
  done: boolean;
}

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { nodes, edges, settings, iterations, chunk, progress } = event.data;
  for (let i = 0; i < iterations; ) {
    const end = Math.min(iterations, i + chunk);
    for (; i < end; i++) iterate(settings, nodes, edges);
    if (progress && i < iterations) self.postMessage({ nodes: nodes.slice(), done: false } satisfies LayoutReply);
  }
  self.postMessage({ nodes, done: true } satisfies LayoutReply, { transfer: [nodes.buffer] });
};
