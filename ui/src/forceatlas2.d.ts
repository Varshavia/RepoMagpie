// Types for the two files of graphology-layout-forceatlas2 0.10.1 the app imports directly; the
// package types only its main entry and its blob: worker (decision 0028).

declare module "graphology-layout-forceatlas2/iterate.js" {
  export default function iterate(settings: object, nodes: Float32Array, edges: Float32Array): void;
}

declare module "graphology-layout-forceatlas2/helpers.js" {
  import type Graph from "graphology";
  export function graphToByteArrays(graph: Graph, getEdgeWeight: () => number): { nodes: Float32Array; edges: Float32Array };
  export function assignLayoutChanges(graph: Graph, nodes: Float32Array, outputReducer: null): void;
}
