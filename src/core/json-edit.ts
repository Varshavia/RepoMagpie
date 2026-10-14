// A round-trip-safe edit of a plain JSON file (decision 0035, "How it writes"): one member of one
// object is added, replaced or removed, and every other byte stays: key order, indentation, line
// endings, the final newline. JSON with comments is never edited (the caller checks with
// readJsonc); this throws on anything it can't read. Never touches the disk.

interface Member {
  key: string;
  keyStart: number;
  valueStart: number;
  valueEnd: number;
}

interface ObjectSpan {
  open: number; // index of "{"
  close: number; // index of "}"
  members: Member[];
}

// Sets `container.name` in the root object to `value`, or removes it when `value` is undefined.
// null text (no file) starts a new file.
export function setMember(text: string | null, [container, name]: [string, string], value: unknown): string {
  if (text === null || !text.trim()) {
    if (value === undefined) return text ?? "";
    return `${JSON.stringify({ [container]: { [name]: value } }, null, 2)}\n`;
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const unit = text.match(/^([ \t]+)"/m)?.[1] ?? "  ";
  const root = scanRoot(text);
  const outer = root.members.find((m) => m.key === container);
  if (!outer) {
    if (value === undefined) return text;
    return insert(text, root, 0, container, { [name]: value }, eol, unit);
  }
  const inner = objectAt(text, outer.valueStart, container);
  const member = inner.members.find((m) => m.key === name);
  if (value === undefined) return member ? remove(text, inner, member) : text;
  if (member) return text.slice(0, member.valueStart) + format(value, 2, eol, unit) + text.slice(member.valueEnd);
  return insert(text, inner, 1, name, value, eol, unit);
}

function insert(text: string, object: ObjectSpan, depth: number, key: string, value: unknown, eol: string, unit: string): string {
  const indent = unit.repeat(depth + 1);
  const entry = `${JSON.stringify(key)}: ${format(value, depth + 1, eol, unit)}`;
  const last = object.members.at(-1);
  if (!last) return `${text.slice(0, object.open + 1)}${eol}${indent}${entry}${eol}${unit.repeat(depth)}${text.slice(object.close)}`;
  return `${text.slice(0, last.valueEnd)},${eol}${indent}${entry}${text.slice(last.valueEnd)}`;
}

function remove(text: string, object: ObjectSpan, member: Member): string {
  const i = object.members.indexOf(member);
  if (object.members.length === 1) return text.slice(0, object.open + 1) + text.slice(object.close);
  if (i < object.members.length - 1) return text.slice(0, member.keyStart) + text.slice(object.members[i + 1].keyStart);
  return text.slice(0, object.members[i - 1].valueEnd) + text.slice(member.valueEnd);
}

// A value as JSON, its inner lines indented for a member at `depth`.
function format(value: unknown, depth: number, eol: string, unit: string): string {
  return JSON.stringify(value, null, unit).split("\n").join(eol + unit.repeat(depth));
}

// --- A scanner that keeps positions ---

function scanRoot(text: string): ObjectSpan {
  let i = skip(text, text.charCodeAt(0) === 0xfeff ? 1 : 0);
  if (text[i] !== "{") throw new Error("The file's root is not an object.");
  const span = objectAt(text, i, "the root");
  i = skip(text, span.close + 1);
  if (i < text.length) throw new Error("The file is not valid JSON: text after the root object.");
  return span;
}

function objectAt(text: string, start: number, what: string): ObjectSpan {
  if (text[start] !== "{") {
    valueEnd(text, start); // throws for text that isn't JSON before saying it isn't an object
    throw new Error(`"${what}" is not an object.`);
  }
  const members: Member[] = [];
  let i = skip(text, start + 1);
  if (text[i] === "}") return { open: start, close: i, members };
  for (;;) {
    if (text[i] !== '"') throw invalid(i);
    const keyStart = i;
    const keyEnd = stringEnd(text, i);
    const key = JSON.parse(text.slice(keyStart, keyEnd)) as string;
    i = skip(text, keyEnd);
    if (text[i] !== ":") throw invalid(i);
    const valueStart = skip(text, i + 1);
    const end = valueEnd(text, valueStart);
    members.push({ key, keyStart, valueStart, valueEnd: end });
    i = skip(text, end);
    if (text[i] === ",") i = skip(text, i + 1);
    else if (text[i] === "}") return { open: start, close: i, members };
    else throw invalid(i);
  }
}

function valueEnd(text: string, i: number): number {
  const ch = text[i];
  if (ch === '"') return stringEnd(text, i);
  if (ch === "{" || ch === "[") {
    const close = ch === "{" ? "}" : "]";
    let j = skip(text, i + 1);
    if (text[j] === close) return j + 1;
    for (;;) {
      if (ch === "{") {
        if (text[j] !== '"') throw invalid(j);
        j = skip(text, stringEnd(text, j));
        if (text[j] !== ":") throw invalid(j);
        j = skip(text, j + 1);
      }
      j = skip(text, valueEnd(text, j));
      if (text[j] === ",") j = skip(text, j + 1);
      else if (text[j] === close) return j + 1;
      else throw invalid(j);
    }
  }
  const literal = text.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if (!literal) throw invalid(i);
  return i + literal[0].length;
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
