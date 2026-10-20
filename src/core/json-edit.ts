// Round-trip-safe edits of a plain JSON file (decision 0035, "How it writes"): one value is added,
// replaced or removed, and every other byte stays: key order, indentation, line endings, the final
// newline. JSON with comments is never edited (the caller checks with readJsonc); these throw on
// anything they can't read. Never touch the disk.

type Path = (string | number)[];

interface Span {
  start: number; // the value's first character
  end: number; // just after its last
}
interface Leaf extends Span { kind: "leaf" }
interface Obj extends Span { kind: "object"; members: { key: string; keyStart: number; value: Node }[] }
interface Arr extends Span { kind: "array"; items: Node[] }
type Node = Leaf | Obj | Arr;

// Sets `container.name` in the root object to `value`, or removes it when `value` is undefined. A
// missing container is added; null text (no file) starts a new file.
export function setMember(text: string | null, [container, name]: [string, string], value: unknown): string {
  if (text === null || !text.trim()) {
    if (value === undefined) return text ?? "";
    return `${JSON.stringify({ [container]: { [name]: value } }, null, 2)}\n`;
  }
  const root = asObject(parseRoot(text), "the root");
  const outer = root.members.find((m) => m.key === container);
  if (!outer) return value === undefined ? text : insert(text, root, 0, `${JSON.stringify(container)}: ${format(text, { [name]: value }, 1)}`);
  const inner = asObject(outer.value, container);
  const member = inner.members.find((m) => m.key === name);
  if (value === undefined) return member ? removeChild(text, inner, inner.members.indexOf(member)) : text;
  if (member) return splice(text, member.value, format(text, value, 2));
  return insert(text, inner, 1, `${JSON.stringify(name)}: ${format(text, value, 2)}`);
}

// Sets the root object's member `name` to `value`, adding it last when missing. Null text (no file)
// starts a new file.
export function setTop(text: string | null, name: string, value: unknown): string {
  if (text === null || !text.trim()) return `${JSON.stringify({ [name]: value }, null, 2)}\n`;
  const root = asObject(parseRoot(text), "the root");
  const member = root.members.find((m) => m.key === name);
  if (member) return splice(text, member.value, format(text, value, 1));
  return insert(text, root, 0, `${JSON.stringify(name)}: ${format(text, value, 1)}`);
}

// Appends `value` to the array at `path`.
export function appendItem(text: string, path: Path, value: unknown): string {
  const array = locate(parseRoot(text), path);
  if (array.kind !== "array") throw new Error(`"${path.join(".")}" is not an array.`);
  return insert(text, array, path.length, format(text, value, path.length + 1));
}

// Removes the array item or object member at `path`.
export function removeAt(text: string, path: Path): string {
  const parent = locate(parseRoot(text), path.slice(0, -1));
  const last = path[path.length - 1];
  const index = parent.kind === "array" ? (typeof last === "number" && last < parent.items.length ? last : -1)
    : parent.kind === "object" ? parent.members.findIndex((m) => m.key === last) : -1;
  if (index < 0) throw new Error(`There is no ${typeof last === "number" ? `item ${last}` : `"${last}"`} at "${path.slice(0, -1).join(".")}".`);
  return removeChild(text, parent as Obj | Arr, index);
}

// Replaces the value at `path`.
export function replaceAt(text: string, path: Path, value: unknown): string {
  return splice(text, locate(parseRoot(text), path), format(text, value, path.length));
}

function locate(root: Node, path: Path): Node {
  let node = root;
  for (const [i, step] of path.entries()) {
    const where = path.slice(0, i).join(".") || "the root";
    if (typeof step === "number") {
      if (node.kind !== "array") throw new Error(`"${where}" is not an array.`);
      if (!node.items[step]) throw new Error(`There is no item ${step} at "${where}".`);
      node = node.items[step];
    } else {
      const member = asObject(node, where).members.find((m) => m.key === step);
      if (!member) throw new Error(`There is no "${step}" at "${where}".`);
      node = member.value;
    }
  }
  return node;
}

function asObject(node: Node, what: string): Obj {
  if (node.kind !== "object") throw new Error(`"${what}" is not an object.`);
  return node;
}

// Adds a child (a member's `"key": value` or an item's value) last in a container whose own line is
// at `depth` units of indentation.
function insert(text: string, container: Obj | Arr, depth: number, child: string): string {
  const { eol, unit } = style(text);
  const children = container.kind === "object" ? container.members.map((m) => m.value) : container.items;
  const last = children.at(-1);
  if (!last) return `${text.slice(0, container.start + 1)}${eol}${unit.repeat(depth + 1)}${child}${eol}${unit.repeat(depth)}${text.slice(container.end - 1)}`;
  return `${text.slice(0, last.end)},${eol}${unit.repeat(depth + 1)}${child}${text.slice(last.end)}`;
}

function removeChild(text: string, container: Obj | Arr, index: number): string {
  const spans = container.kind === "object" ? container.members.map((m) => ({ start: m.keyStart, end: m.value.end })) : container.items;
  if (spans.length === 1) return text.slice(0, container.start + 1) + text.slice(container.end - 1);
  if (index < spans.length - 1) return text.slice(0, spans[index].start) + text.slice(spans[index + 1].start);
  return text.slice(0, spans[index - 1].end) + text.slice(spans[index].end);
}

const splice = (text: string, node: Span, value: string) => text.slice(0, node.start) + value + text.slice(node.end);

// The file's line ending and indentation unit (2 spaces when it has no indented line).
function style(text: string): { eol: string; unit: string } {
  return { eol: text.includes("\r\n") ? "\r\n" : "\n", unit: text.match(/^([ \t]+)["{[]/m)?.[1] ?? "  " };
}

// A value as JSON, its inner lines indented for a line at `depth` units.
function format(text: string, value: unknown, depth: number): string {
  const { eol, unit } = style(text);
  return JSON.stringify(value, null, unit).split("\n").join(eol + unit.repeat(depth));
}

// --- A parser that keeps positions ---

function parseRoot(text: string): Node {
  const start = skip(text, text.charCodeAt(0) === 0xfeff ? 1 : 0);
  if (text[start] !== "{") throw new Error("The file's root is not an object.");
  const root = parseValue(text, start);
  if (skip(text, root.end) < text.length) throw new Error("The file is not valid JSON: text after the root object.");
  return root;
}

function parseValue(text: string, i: number): Node {
  const ch = text[i];
  if (ch === "{") {
    const members: Obj["members"] = [];
    let j = skip(text, i + 1);
    if (text[j] === "}") return { kind: "object", start: i, end: j + 1, members };
    for (;;) {
      if (text[j] !== '"') throw invalid(j);
      const keyStart = j;
      const keyEnd = stringEnd(text, j);
      j = skip(text, keyEnd);
      if (text[j] !== ":") throw invalid(j);
      const value = parseValue(text, skip(text, j + 1));
      members.push({ key: JSON.parse(text.slice(keyStart, keyEnd)) as string, keyStart, value });
      j = skip(text, value.end);
      if (text[j] === ",") j = skip(text, j + 1);
      else if (text[j] === "}") return { kind: "object", start: i, end: j + 1, members };
      else throw invalid(j);
    }
  }
  if (ch === "[") {
    const items: Node[] = [];
    let j = skip(text, i + 1);
    if (text[j] === "]") return { kind: "array", start: i, end: j + 1, items };
    for (;;) {
      const item = parseValue(text, j);
      items.push(item);
      j = skip(text, item.end);
      if (text[j] === ",") j = skip(text, j + 1);
      else if (text[j] === "]") return { kind: "array", start: i, end: j + 1, items };
      else throw invalid(j);
    }
  }
  if (ch === '"') return { kind: "leaf", start: i, end: stringEnd(text, i) };
  const literal = text.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if (!literal) throw invalid(i);
  return { kind: "leaf", start: i, end: i + literal[0].length };
}

function stringEnd(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
  if (j >= text.length) throw invalid(i);
  return j + 1;
}

const skip = (text: string, i: number) => {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
};

const invalid = (i: number) => new Error(`The file is not valid JSON (at character ${i}).`);
