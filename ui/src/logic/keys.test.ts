import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_MAP, keyAction, type KeyInput } from "./keys.ts";

// The keyboard map of docs/ui.md §7.

const key = (k: string, over: Partial<KeyInput> = {}): KeyInput => ({ key: k, ctrl: false, meta: false, alt: false, editable: false, mac: false, ...over });
const act = (input: KeyInput, pending: "g" | null = null) => keyAction(input, pending);

test("Ctrl+K opens the palette, Cmd+K on a Mac; also while typing", () => {
  assert.equal(act(key("k", { ctrl: true })).action, "palette");
  assert.equal(act(key("k", { ctrl: true, editable: true })).action, "palette");
  assert.equal(act(key("k", { meta: true, mac: true })).action, "palette");
  assert.equal(act(key("K", { ctrl: true, editable: true })).action, "palette");
  assert.equal(act(key("k", { meta: true })).action, null); // the Windows key is not Ctrl
});

test("Ctrl+Enter saves (Cmd+Enter on a Mac), and Esc steps back, also while typing", () => {
  assert.equal(act(key("Enter", { ctrl: true, editable: true })).action, "save");
  assert.equal(act(key("Enter", { meta: true, mac: true, editable: true })).action, "save");
  assert.equal(act(key("Escape", { editable: true })).action, "escape");
  assert.equal(act(key("Escape")).action, "escape");
});

test("single keys act only outside text fields", () => {
  const plain: [string, string][] = [["/", "search"], ["j", "next"], ["k", "previous"], ["ArrowDown", "next"], ["ArrowUp", "previous"], ["Enter", "open"], ["e", "edit"], ["?", "help"]];
  for (const [k, action] of plain) {
    assert.equal(act(key(k)).action, action, k);
    assert.equal(act(key(k, { editable: true })).action, null, `${k} while typing`);
  }
});

test("g then i goes to the Inbox, g then s to Search; any other key drops the g", () => {
  assert.deepEqual(act(key("g")), { action: null, pending: "g" });
  assert.deepEqual(act(key("i"), "g"), { action: "go-inbox", pending: null });
  assert.deepEqual(act(key("s"), "g"), { action: "go-search", pending: null });
  assert.deepEqual(act(key("x"), "g"), { action: null, pending: null });
  assert.deepEqual(act(key("j"), "g"), { action: "next", pending: null });
  assert.deepEqual(act(key("i", { editable: true }), "g"), { action: null, pending: null });
});

test("g then g opens the graph; a third g starts a new sequence", () => {
  assert.deepEqual(act(key("g"), "g"), { action: "go-graph", pending: null });
  assert.deepEqual(act(key("g"), null), { action: null, pending: "g" });
  assert.deepEqual(act(key("g", { editable: true }), "g"), { action: null, pending: null });
});

test("browser shortcuts pass through: Ctrl or Alt with any other key does nothing", () => {
  for (const input of [key("j", { ctrl: true }), key("e", { alt: true }), key("r", { meta: true, mac: true }), key("/", { ctrl: true })]) {
    assert.equal(act(input).action, null, input.key);
  }
});

test("the map shown with ? lists every key of docs/ui.md §7", () => {
  assert.deepEqual(KEY_MAP.map((row) => row.keys), ["Ctrl/Cmd+K", "/", "j / k", "Enter", "e", "Ctrl+Enter", "[[", "Esc", "g i / g s / g g", "?"]);
});
