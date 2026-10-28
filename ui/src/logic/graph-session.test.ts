import { test } from "node:test";
import assert from "node:assert/strict";
import { forgetPositions, keepPositions, reopening } from "./graph-session.ts";

// The graph's positions for the session (decision 0049): nothing kept, the full layout; every node
// placed, no layout; some new, a short layout with the others pinned.

test("reopening: nothing kept, the layout from the seeds; every node kept, the kept positions and no layout; new nodes, the others pinned", () => {
  forgetPositions();
  assert.deepEqual(reopening("personal", ["note:a.md", "note:b.md"]), { plan: "layout" });
  const positions = new Map([["note:a.md", { x: 1, y: 2 }], ["note:b.md", { x: 3, y: 4 }], ["tag:gone", { x: 5, y: 6 }]]);
  keepPositions("personal", positions);
  assert.deepEqual(reopening("personal", ["note:a.md", "note:b.md"]), { plan: "same", positions });
  assert.deepEqual(reopening("personal", ["note:b.md"]), { plan: "same", positions }); // a node removed: nothing to place
  assert.deepEqual(reopening("personal", ["note:a.md", "note:b.md", "note:c.md"]), { plan: "join", positions, pinned: new Set(["note:a.md", "note:b.md"]) });
  assert.deepEqual(reopening("project", ["note:a.md"]), { plan: "layout" }); // by journal
  forgetPositions("personal");
  assert.deepEqual(reopening("personal", ["note:a.md"]), { plan: "layout" });
});
