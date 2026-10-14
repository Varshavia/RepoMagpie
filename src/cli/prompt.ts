// The prompts repomagpie setup asks (decision 0035): a multi-select and a yes/no, on node:readline's
// keypress events, so no library is needed. In raw mode Node's terminal layer (libuv) turns arrow
// keys into the same escape sequences on Windows consoles (cmd, PowerShell, Windows Terminal) as on
// macOS and Linux, so one code path serves all. Drawn on stderr: stdout is for data. Ctrl+C or Esc
// cancels (null).
import { emitKeypressEvents } from "node:readline";

export interface Terminal {
  input: NodeJS.ReadableStream & { setRawMode?: (on: boolean) => unknown; isRaw?: boolean };
  output: NodeJS.WritableStream;
}

interface Key {
  name?: string;
  ctrl?: boolean;
}

// Reads keys until `onKey` returns a value other than undefined, which it resolves with.
function keys<T>(t: Terminal, onKey: (text: string | undefined, key: Key) => T | undefined, draw: () => void): Promise<T> {
  return new Promise((resolve) => {
    emitKeypressEvents(t.input);
    const raw = t.input.isRaw;
    t.input.setRawMode?.(true);
    t.input.resume();
    const listener = (text: string | undefined, key: Key = {}) => {
      const value = onKey(text, key);
      if (value === undefined) return draw();
      t.input.off("keypress", listener);
      t.input.setRawMode?.(Boolean(raw));
      t.input.pause();
      resolve(value);
    };
    t.input.on("keypress", listener);
    draw();
  });
}

const cancelled = (key: Key) => (key.ctrl && key.name === "c") || key.name === "escape";

// A list to choose from, every item chosen at first unless `checked` says otherwise. Resolves with
// the chosen indexes, or null when cancelled.
export async function multiSelect(t: Terminal, question: string, items: { label: string; checked?: boolean }[]): Promise<number[] | null> {
  const chosen = items.map((item) => item.checked !== false);
  let cursor = 0;
  let drawn = 0;
  const draw = () => {
    const lines = [`${question} (Up and Down to move, Space to choose, A for all, Enter to go on)`, ...items.map((item, i) => `${i === cursor ? ">" : " "} [${chosen[i] ? "x" : " "}] ${item.label}`)];
    t.output.write(`${drawn ? `\u001b[${drawn}A\u001b[0J` : ""}${lines.join("\n")}\n`);
    drawn = lines.length;
  };
  return keys(t, (text, key) => {
    if (cancelled(key)) return null;
    if (key.name === "up" || key.name === "k") cursor = (cursor + items.length - 1) % items.length;
    else if (key.name === "down" || key.name === "j") cursor = (cursor + 1) % items.length;
    else if (key.name === "space") chosen[cursor] = !chosen[cursor];
    else if (text === "a" || text === "A") chosen.fill(!chosen.every(Boolean));
    else if (key.name === "return" || key.name === "enter") return chosen.flatMap((on, i) => (on ? [i] : []));
    return undefined;
  }, draw);
}

// A yes/no question; Enter takes the default. Resolves with the answer, or null when cancelled.
export async function confirm(t: Terminal, question: string, byDefault: boolean): Promise<boolean | null> {
  let drawn = false;
  const draw = () => {
    if (!drawn) t.output.write(`${question} ${byDefault ? "(Y/n)" : "(y/N)"} `);
    drawn = true;
  };
  const answer = await keys<boolean | null>(t, (text, key) => {
    if (cancelled(key)) return null;
    if (text === "y" || text === "Y") return true;
    if (text === "n" || text === "N") return false;
    if (key.name === "return" || key.name === "enter") return byDefault;
    return undefined;
  }, draw);
  t.output.write(`${answer === null ? "" : answer ? "yes" : "no"}\n`);
  return answer;
}
