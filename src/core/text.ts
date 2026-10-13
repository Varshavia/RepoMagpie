// Note text is data (decision 0032, rules 1 to 3): cleaning, length caps and quoting for text that
// came from a note or from GitHub. No imports, so the hook's chunk can load it; the MCP server will
// use it too. Reading never changes a file: these work on copies of the text.

// The caps of agent-facing fields, in characters (decision 0032, rule 2, with the reason for each).
export const CAPS = {
  name: 214, // npm's longest package name; a GitHub owner/repo is at most 140
  id: 256, // the longest PURL our four types form is about 226
  verdict: 1000, // one line by schema; the example vault's longest is 113
  item: 500, // one bullet of "Avoid when" or "Use when"
  items: 20, // bullets per section
  alternatives: 20, // entries in `alternatives`
  tag: 64,
  tags: 32,
  skill: 500, // a skill line's text
  url: 2048,
  other: 1000, // any other note-derived string
} as const;

// Every character class here is built from code points, so this source holds no invisible or
// control character, and a reader sees exactly which ones go.
const char = (code: number) => String.fromCharCode(code);
const set = (...ranges: [number, number?][]) => ranges.map(([from, to]) => (to ? `${char(from)}-${char(to)}` : char(from))).join("");
const ESC = char(0x1b);
const BEL = char(0x07);

// Escape sequences, whole: string sequences (OSC, DCS, SOS, PM, APC, in their ESC and C1 forms) with
// their payload, ended by BEL, ST (ESC \ or U+009C) or the end of the text; then CSI (ESC [ or
// U+009B, parameters, intermediates, a final byte); then any other ESC sequence.
const STRINGS = new RegExp(`(?:${ESC}[\\]PX^_]|[${set([0x90], [0x98], [0x9d, 0x9f])}])[\\s\\S]*?(?:${BEL}|${ESC}\\\\|${char(0x9c)}|$)`, "g");
const CSI = new RegExp(`(?:${ESC}\\[|${char(0x9b)})[0-?]*[ -/]*[@-~]?`, "g");
const ESCAPES = new RegExp(`${ESC}[ -/]*[0-~]?`, "g");
// Single characters: C0 but the line break (U+000A), DEL and C1; the Arabic letter mark; zero-width
// space, non-joiner and joiner, and the LTR and RTL marks (U+200B to U+200F); the bidi embeddings and
// overrides (U+202A to U+202E); the word joiner; the bidi isolates (U+2066 to U+2069); the BOM.
const CHARACTERS = new RegExp(`[${set([0x00, 0x09], [0x0b, 0x1f], [0x7f, 0x9f], [0x61c], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060], [0x2066, 0x2069], [0xfeff])}]`, "g");
// Line breaks: CRLF, CR, and the line and paragraph separators (U+2028, U+2029).
const LINE_BREAKS = new RegExp(`\\r\\n|[\\r${set([0x2028, 0x2029])}]`, "g");

// The text without control characters (decision 0032, rule 1). A tab becomes a space. A field that
// is multi-line by schema keeps its line breaks, as \n; any other turns them into spaces.
export function clean(text: string, multiline = false): string {
  const lines = text.replace(STRINGS, "").replace(CSI, "").replace(ESCAPES, "").replace(/\t/g, " ").replace(LINE_BREAKS, "\n");
  return lines.replace(CHARACTERS, "").replace(/\n/g, multiline ? "\n" : " ");
}

// Every string in a value cleaned, nothing capped: note text on its way to a terminal.
export function cleanAll<T>(value: T): T {
  if (typeof value === "string") return clean(value) as T;
  if (Array.isArray(value)) return value.map(cleanAll) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, cleanAll(field)])) as T;
  return value;
}

// The text cut to `limit` characters, ending with "…" when it was longer; never in half a
// surrogate pair.
export function cut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let end = limit - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return `${text.slice(0, end)}…`;
}

// Note text quoted in a sentence (decision 0032, rule 3): one line, in double quotes. A double
// quote inside, straight or typographic, becomes a single one, so a note can't close its quote and
// go on in our voice.
const DOUBLE_QUOTES = new RegExp(`["${set([0x201c, 0x201f], [0x2033])}]`, "g");
export function quote(text: string): string {
  return `"${clean(text).replace(DOUBLE_QUOTES, "'")}"`;
}

// Why a name, as written in a note, can't be the package it seems (decision 0032): letters outside
// ASCII, which npm, PyPI and crates.io never allow and which can look like ASCII ones (a Cyrillic
// "р" in "рuppeteer"); or, for a name without a note (`bare`), characters no registry name has.
// Null when neither.
const PACKAGE_NAME = /^(@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+$/;
export function nameConcern(name: string, bare: boolean): "non-ascii" | "invalid" | null {
  if ([...name].some((ch) => ch.charCodeAt(0) > 0x7e)) return "non-ascii";
  return bare && !PACKAGE_NAME.test(name) ? "invalid" : null;
}

// How one field of an agent-facing document is capped: a string's cap, or a list's caps per item
// and on its length. Lists of objects are only cut to `count`: the caller caps their fields.
export type Rule = number | { each: number; count: number };

// One object of an agent-facing document (decision 0032, rule 2): every string cleaned and capped by
// its rule (CAPS.other without one), and `truncated` naming the fields that were cut, only when one
// was. Fields that aren't strings or lists stay as they are.
export function forAgent<T extends object>(value: T, rules: Record<string, Rule>): T & { truncated?: string[] } {
  const out: Record<string, unknown> = {};
  const truncated: string[] = [];
  const capped = (text: string, limit: number) => {
    const cleaned = clean(text);
    const result = cut(cleaned, limit);
    return { result, cut: result !== cleaned };
  };
  for (const [key, field] of Object.entries(value)) {
    const rule = rules[key];
    if (typeof field === "string") {
      const { result, cut: wasCut } = capped(field, typeof rule === "number" ? rule : CAPS.other);
      out[key] = result;
      if (wasCut) truncated.push(key);
    } else if (Array.isArray(field)) {
      const { each, count } = typeof rule === "object" ? rule : { each: CAPS.other, count: Infinity };
      let wasCut = field.length > count;
      out[key] = field.slice(0, count).map((item: unknown) => {
        if (typeof item !== "string") return item;
        const { result, cut: itemCut } = capped(item, each);
        wasCut ||= itemCut;
        return result;
      });
      if (wasCut) truncated.push(key);
    } else out[key] = field;
  }
  if (truncated.length) out.truncated = truncated;
  return out as T & { truncated?: string[] };
}
