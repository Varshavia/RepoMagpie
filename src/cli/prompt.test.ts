import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { confirm, multiSelect, type Terminal } from "./prompt.ts";

// setup's prompts with fake keystrokes: the escape sequences a terminal sends in raw mode, which
// Node's terminal layer also produces from Windows console key events.

const UP = "\u001b[A";
const DOWN = "\u001b[B";
const ENTER = "\r";
const CTRL_C = "\u0003";

function terminal() {
  const input = Object.assign(new PassThrough(), { isRaw: false, setRawMode(on: boolean) { input.isRaw = on; return input; } });
  const output = new PassThrough();
  let drawn = "";
  output.on("data", (chunk) => { drawn += String(chunk); });
  return { t: { input, output } as Terminal, input, type: (keys: string) => setImmediate(() => input.write(keys)), drawn: () => drawn };
}

test("multi-select: everything chosen at first; Space toggles, arrows move, Enter returns the chosen indexes", async () => {
  const { t, type, input } = terminal();
  const answer = multiSelect(t, "Set up these agents?", [{ label: "Claude Code" }, { label: "Cursor" }, { label: "VS Code" }]);
  type(`${DOWN}${DOWN}${DOWN}${UP} ${ENTER}`); // 1, 2, wraps to 0, wraps back to 2; Space unchecks VS Code
  assert.deepEqual(await answer, [0, 1]);
  assert.equal(input.isRaw, false, "raw mode is restored");
});

test("multi-select: A toggles all; the list is redrawn in place", async () => {
  const { t, type, drawn } = terminal();
  const answer = multiSelect(t, "Agents?", [{ label: "a" }, { label: "b", checked: false }]);
  type(`a${ENTER}`);
  assert.deepEqual(await answer, [0, 1]);
  assert.match(drawn(), /\u001b\[3A\u001b\[0J/);
  assert.match(drawn(), /> \[x\] a\n {2}\[x\] b\n$/);
});

test("Ctrl+C cancels either prompt", async () => {
  const one = terminal();
  const select = multiSelect(one.t, "Agents?", [{ label: "a" }]);
  one.type(CTRL_C);
  assert.equal(await select, null);
  const two = terminal();
  const yes = confirm(two.t, "Go on?", true);
  two.type(CTRL_C);
  assert.equal(await yes, null);
});

test("confirm: y, n, and Enter for the default", async () => {
  for (const [keys, byDefault, expected] of [["y", false, true], ["N", true, false], [ENTER, true, true], [ENTER, false, false]] as const) {
    const { t, type, drawn } = terminal();
    const answer = confirm(t, "Turn on the note tool?", byDefault);
    type(keys);
    assert.equal(await answer, expected);
    assert.match(drawn(), new RegExp(`^Turn on the note tool\\? \\(${byDefault ? "Y/n" : "y/N"}\\) ${expected ? "yes" : "no"}\\n$`));
  }
});
