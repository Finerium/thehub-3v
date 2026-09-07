// A reader for the one YAML dialect this repository holds: bundle/golden/cases.yaml (blueprint 9.11), whose format
// contract is frozen in the harness's golden/README.md ("a top-level YAML list in block style, every case starts
// `- id: GS-NN` at column 0, strings double-quoted, no multi-line strings"). The application has no YAML dependency
// and the golden runner must not add one, so this is the reader: block sequences and mappings at even indents, flow
// mappings and sequences on one line, double-quoted scalars (JSON escapes; the file uses only \\ and \") and the
// bare scalars true, false, null and the plain words of the 9.11 enums.
//
// Two deliberate narrowings from YAML 1.1, both asserted by tests/golden/cases.test.ts against the real file:
// a bare `on`, `yes` or `off` stays the string it reads as (PyYAML would make it a boolean key, which no check
// module wants), and a value is a number only when it is all digits with an optional sign and one decimal point.
// Anything the dialect does not cover throws with the line number rather than guessing.
//
// src/gates/g1/bundle.ts takes a `parseYaml` of exactly this signature (ReadOptions.parseYaml), so G1 can type
// golden/cases.yaml with this reader once the module lives under src/.

export class YamlError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = "YamlError";
    this.line = line;
  }
}

type Line = { indent: number; content: string; n: number };

/** The index of the first `#` that opens a comment (whitespace before it, outside a double-quoted scalar), or -1. */
function commentAt(s: string): number {
  let quoted = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === "\\") i += 1;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "#" && (i === 0 || s[i - 1] === " " || s[i - 1] === "\t")) return i;
  }
  return -1;
}

function scan(text: string): Line[] {
  const lines: Line[] = [];
  const raw = text.split("\n");
  for (let i = 0; i < raw.length; i += 1) {
    const source = raw[i] ?? "";
    const cut = commentAt(source);
    const withoutComment = cut === -1 ? source : source.slice(0, cut);
    const content = withoutComment.replace(/\s+$/, "");
    if (content.trim().length === 0) continue;
    const indent = content.length - content.trimStart().length;
    if (indent % 2 !== 0) throw new YamlError("indent is not a multiple of two", i + 1);
    lines.push({ indent, content: content.slice(indent), n: i + 1 });
  }
  return lines;
}

/** The index of the `:` that ends a block mapping key (outside a quoted scalar), or -1. */
function keyEndsAt(s: string): number {
  let quoted = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === "\\") i += 1;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ":" && (i + 1 === s.length || s[i + 1] === " ")) return i;
  }
  return -1;
}

function unquote(token: string, line: number): string {
  try {
    const value: unknown = JSON.parse(token);
    if (typeof value !== "string") throw new Error("not a string");
    return value;
  } catch {
    throw new YamlError(`malformed double-quoted scalar ${token.slice(0, 24)}...`, line);
  }
}

function bareScalar(token: string): string | number | boolean | null {
  if (token === "true") return true;
  if (token === "false") return false;
  if (token === "null" || token === "~") return null;
  if (/^-?\d+$/.test(token)) return Number.parseInt(token, 10);
  if (/^-?\d+\.\d+$/.test(token)) return Number.parseFloat(token);
  return token;
}

// --- flow collections: {a: 1, b: ["x"]} and ["x", "y"], always on one line ---

type Cursor = { s: string; i: number; line: number };

function skipSpace(c: Cursor): void {
  while (c.i < c.s.length && (c.s[c.i] === " " || c.s[c.i] === "\t")) c.i += 1;
}

function readQuoted(c: Cursor): string {
  const start = c.i;
  c.i += 1;
  while (c.i < c.s.length) {
    const ch = c.s[c.i];
    if (ch === "\\") c.i += 2;
    else if (ch === '"') {
      c.i += 1;
      return unquote(c.s.slice(start, c.i), c.line);
    } else c.i += 1;
  }
  throw new YamlError("unterminated double-quoted scalar", c.line);
}

/** A bare token inside a flow collection: up to the next , : ] } at this level. */
function readBare(c: Cursor): string {
  const start = c.i;
  while (c.i < c.s.length && !",:]}".includes(c.s[c.i] ?? "")) c.i += 1;
  return c.s.slice(start, c.i).trim();
}

function readFlow(c: Cursor): unknown {
  skipSpace(c);
  const ch = c.s[c.i];
  if (ch === "{") return readFlowMap(c);
  if (ch === "[") return readFlowSeq(c);
  if (ch === '"') return readQuoted(c);
  return bareScalar(readBare(c));
}

function readFlowMap(c: Cursor): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  c.i += 1; // {
  skipSpace(c);
  if (c.s[c.i] === "}") {
    c.i += 1;
    return out;
  }
  for (;;) {
    skipSpace(c);
    const key = c.s[c.i] === '"' ? readQuoted(c) : readBare(c);
    skipSpace(c);
    if (c.s[c.i] !== ":") throw new YamlError(`flow mapping key ${key} without a value`, c.line);
    c.i += 1;
    out[key] = readFlow(c);
    skipSpace(c);
    const next = c.s[c.i];
    c.i += 1;
    if (next === "}") return out;
    if (next !== ",") throw new YamlError("flow mapping is not closed", c.line);
  }
}

function readFlowSeq(c: Cursor): unknown[] {
  const out: unknown[] = [];
  c.i += 1; // [
  skipSpace(c);
  if (c.s[c.i] === "]") {
    c.i += 1;
    return out;
  }
  for (;;) {
    out.push(readFlow(c));
    skipSpace(c);
    const next = c.s[c.i];
    c.i += 1;
    if (next === "]") return out;
    if (next !== ",") throw new YamlError("flow sequence is not closed", c.line);
  }
}

function parseInline(token: string, line: number): unknown {
  const trimmed = token.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const cursor: Cursor = { s: trimmed, i: 0, line };
    const value = readFlow(cursor);
    skipSpace(cursor);
    if (cursor.i !== trimmed.length) throw new YamlError("trailing characters after a flow collection", line);
    return value;
  }
  if (trimmed.startsWith('"')) {
    const cursor: Cursor = { s: trimmed, i: 0, line };
    const value = readQuoted(cursor);
    skipSpace(cursor);
    if (cursor.i !== trimmed.length) throw new YamlError("trailing characters after a quoted scalar", line);
    return value;
  }
  return bareScalar(trimmed);
}

// --- block structure ---

type Block = { value: unknown; next: number };

function parseBlock(lines: Line[], start: number, indent: number): Block {
  const first = lines[start];
  if (!first) throw new YamlError("unexpected end of file", lines[lines.length - 1]?.n ?? 0);
  return first.content.startsWith("- ") || first.content === "-"
    ? parseSequence(lines, start, indent)
    : parseMapping(lines, start, indent);
}

function parseSequence(lines: Line[], start: number, indent: number): Block {
  const out: unknown[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.indent < indent) break;
    if (line.indent > indent) throw new YamlError("unexpected indent inside a sequence", line.n);
    if (!line.content.startsWith("- ") && line.content !== "-") break;
    const rest = line.content === "-" ? "" : line.content.slice(2);
    if (rest.length === 0) {
      const child = parseBlock(lines, i + 1, indent + 2);
      out.push(child.value);
      i = child.next;
      continue;
    }
    // An item whose first mapping entry sits on the dash line: read it as a mapping opening at indent + 2.
    if (!rest.startsWith("{") && !rest.startsWith("[") && keyEndsAt(rest) !== -1) {
      const synthetic: Line[] = [{ indent: indent + 2, content: rest, n: line.n }];
      let j = i + 1;
      while (j < lines.length && (lines[j]?.indent ?? -1) >= indent + 2) {
        const follow = lines[j];
        if (follow) synthetic.push(follow);
        j += 1;
      }
      const item = parseMapping(synthetic, 0, indent + 2);
      if (item.next !== synthetic.length) throw new YamlError("unread lines inside a sequence item", line.n);
      out.push(item.value);
      i = j;
      continue;
    }
    out.push(parseInline(rest, line.n));
    i += 1;
  }
  return { value: out, next: i };
}

function parseMapping(lines: Line[], start: number, indent: number): Block {
  const out: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.indent < indent) break;
    if (line.indent > indent) throw new YamlError("unexpected indent inside a mapping", line.n);
    if (line.content.startsWith("- ")) break;
    const cut = keyEndsAt(line.content);
    if (cut === -1) throw new YamlError("mapping entry without a key", line.n);
    const rawKey = line.content.slice(0, cut);
    const key = rawKey.startsWith('"') ? unquote(rawKey, line.n) : rawKey.trim();
    const rest = line.content.slice(cut + 1).trim();
    if (rest.length > 0) {
      out[key] = parseInline(rest, line.n);
      i += 1;
      continue;
    }
    const nextLine = lines[i + 1];
    if (!nextLine || nextLine.indent <= indent) {
      // A key with nothing under it: an empty block, which this dialect never writes.
      throw new YamlError(`key ${key} has no value`, line.n);
    }
    const child = parseBlock(lines, i + 1, nextLine.indent);
    out[key] = child.value;
    i = child.next;
  }
  return { value: out, next: i };
}

/** The document. Throws YamlError with the line number on anything outside the dialect. */
export function parseYaml(text: string): unknown {
  const lines = scan(text);
  if (lines.length === 0) return null;
  const first = lines[0];
  if (!first || first.indent !== 0) throw new YamlError("the document does not start at column 0", first?.n ?? 1);
  const block = parseBlock(lines, 0, 0);
  if (block.next !== lines.length) throw new YamlError("unread lines after the document", lines[block.next]?.n ?? 0);
  return block.value;
}
