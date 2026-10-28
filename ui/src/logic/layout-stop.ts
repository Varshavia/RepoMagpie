// When the graph's layout stops (decision 0049): ForceAtlas2 runs in chunks of STOP.chunk
// iterations, and stops once the nodes' mean move per iteration, over the last chunk, is under
// STOP.settle of the layout's larger side. Never before STOP.min iterations (a small graph still gets
// a layout), never after STOP.max (one that keeps moving stops where it did before: 300). No imports:
// the layout worker bundles it.

// At 2,000 notes the move falls under 1e-3 at about 115 iterations, and every quality number is then
// within 3% of its value at 300 (decision 0049); below it, Barnes-Hut's jitter (about 5e-4) is most
// of what moves.
export const STOP = { chunk: 10, min: 50, max: 300, settle: 1e-3 };

const PPN = 10; // graphology-layout-forceatlas2's node matrix: 10 numbers a node, x and y first

// The nodes' x and y, from the layout's node matrix.
export function positionsOf(matrix: Float32Array): Float32Array {
  const xy = new Float32Array((matrix.length / PPN) * 2);
  for (let n = 0, i = 0; n < matrix.length; n += PPN, i += 2) {
    xy[i] = matrix[n];
    xy[i + 1] = matrix[n + 1];
  }
  return xy;
}

// The mean distance a node moved per iteration since `before` (positionsOf, `iterations` ago),
// ÷ the larger side of the nodes' bounding box now.
export function meanStep(before: Float32Array, matrix: Float32Array, iterations: number): number {
  let moved = 0;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const count = matrix.length / PPN;
  for (let n = 0, i = 0; n < matrix.length; n += PPN, i += 2) {
    const [x, y] = [matrix[n], matrix[n + 1]];
    moved += Math.hypot(x - before[i], y - before[i + 1]);
    [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
  }
  const side = Math.max(maxX - minX, maxY - minY);
  return count && side > 0 && iterations > 0 ? moved / count / iterations / side : 0;
}

// Whether the layout stops after `iteration` iterations, the last chunk having moved `step`
// (meanStep). `full`: Re-layout, which runs to STOP.max as before.
export function stopsAt(iteration: number, step: number, full = false): boolean {
  if (iteration >= STOP.max) return true;
  return !full && iteration >= STOP.min && step < STOP.settle;
}

// Runs `iterate` (one step on `matrix`) until stopsAt says so; `each` after every iteration (the
// progress frames). Returns how many iterations ran.
export function iterateUntilSettled(matrix: Float32Array, iterate: () => void, full: boolean, each?: (iteration: number) => void): number {
  let before = positionsOf(matrix);
  for (let i = 1; ; i++) {
    iterate();
    each?.(i);
    if (i % STOP.chunk && i < STOP.max) continue;
    if (stopsAt(i, meanStep(before, matrix, STOP.chunk), full)) return i;
    before = positionsOf(matrix);
  }
}
