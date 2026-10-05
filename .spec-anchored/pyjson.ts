import { createHash } from 'node:crypto';

// The approval fingerprint hashes canonical bytes, so the port must produce the bytes Python produces:
// `1` and `1.0` stay apart, integers have any size, an object keeps insertion order, and messages use `repr`.

/** A refusal by the contract. A test asserts this type, so a crash never passes as a refusal. */
export class ContractViolation extends Error {
  override name = 'ContractViolation';
}

export class InputError extends Error {
  override name = 'InputError';
}

/** A JSON number written with a fraction or an exponent. An integer is a `bigint`. */
export class PyFloat {
  readonly value: number;
  constructor(value: number) {
    this.value = value;
  }
}

export type JsonObject = Map<string, Json>;
export type Json = null | boolean | bigint | PyFloat | string | Json[] | JsonObject;

export const isStr = (x: Json | undefined): x is string => typeof x === 'string';
/** `true` is not an integer here: a schema field must not accept it. */
export const isInt = (x: Json | undefined): x is bigint => typeof x === 'bigint';
export const isList = (x: Json | undefined): x is Json[] => Array.isArray(x);
export const isDict = (x: Json | undefined): x is JsonObject => x instanceof Map;

/** Builds a JSON value from a plain literal. A JS integer becomes an integer, not a float. */
export function json(value: unknown): Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : new PyFloat(value);
  if (value instanceof PyFloat || value instanceof Map) return value as Json;
  if (Array.isArray(value)) return value.map(json);
  return new Map(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, json(v)]));
}

/** `d.get(key, fallback)`: the fallback applies to a missing key only, never to `null`. */
export function getOr(d: JsonObject, key: string, fallback: Json): Json {
  const value = d.get(key);
  return value === undefined ? fallback : value;
}

/** `d.get(key)`: a missing key reads as `null`. */
export const get = (d: JsonObject, key: string): Json => getOr(d, key, null);

/** Python truthiness: `None`, `False`, zero and every empty container are false. */
export function truthy(x: Json): boolean {
  if (x === null || x === false) return false;
  if (typeof x === 'bigint') return x !== 0n;
  if (x instanceof PyFloat) return x.value !== 0;
  if (typeof x === 'string' || Array.isArray(x)) return x.length > 0;
  if (x instanceof Map) return x.size > 0;
  return true;
}

const numeric = (x: Json): bigint | number | null =>
  typeof x === 'boolean' ? (x ? 1n : 0n) : typeof x === 'bigint' ? x : x instanceof PyFloat ? x.value : null;

/** Python `==` as the kernel uses it: `True == 1 == 1.0`. Two containers never meet: they compare by identity. */
export function pyEq(a: Json, b: Json): boolean {
  const na = numeric(a);
  // A number never equals `null`, so the other side needs no check of its own.
  return na === null ? a === b : na == numeric(b);
}

/** Python `x in sequence`. */
export const pyIn = (x: Json, seq: readonly Json[]): boolean => seq.some(item => pyEq(x, item));

export function typeName(x: Json): string {
  if (x === null) return 'NoneType';
  if (typeof x === 'boolean') return 'bool';
  if (typeof x === 'bigint') return 'int';
  if (x instanceof PyFloat) return 'float';
  if (typeof x === 'string') return 'str';
  return Array.isArray(x) ? 'list' : 'dict';
}

/** The code points of a string. A lone surrogate is one element. */
export const codePoints = (s: string): string[] => [...s];

/** Compares two strings by code point, which is how Python sorts them. */
export function compareCodePoints(a: string, b: string): number {
  const [ca, cb] = [codePoints(a), codePoints(b)];
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    const d = (ca[i].codePointAt(0) as number) - (cb[i].codePointAt(0) as number);
    if (d !== 0) return d;
  }
  return ca.length - cb.length;
}

export const sortedStrings = (items: Iterable<string>): string[] => [...new Set(items)].sort(compareCodePoints);

/** What `str.isspace()` accepts. It is not what `\s` accepts in JavaScript. */
export function isPySpace(ch: string): boolean {
  const c = ch.codePointAt(0) as number;
  return (c >= 0x09 && c <= 0x0d) || (c >= 0x1c && c <= 0x20) || c === 0x85 || c === 0xa0 || c === 0x1680
    || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
}

/** `str.rstrip()` with no argument, or with a set of characters. */
export function rstrip(s: string, chars?: string): string {
  const drop = (ch: string) => (chars === undefined ? isPySpace(ch) : chars.includes(ch));
  const cps = codePoints(s);
  let end = cps.length;
  while (end > 0 && drop(cps[end - 1])) end--;
  return cps.slice(0, end).join('');
}

/** `str.strip()` with no argument. */
export function strip(s: string): string {
  const cps = codePoints(rstrip(s));
  let start = 0;
  while (start < cps.length && isPySpace(cps[start])) start++;
  return cps.slice(start).join('');
}

/** `float.__repr__`: the shortest digits that round-trip, in Python's layout. */
export function floatRepr(n: number): string {
  if (!Number.isFinite(n)) return n === Infinity ? 'inf' : '-inf';
  const sign = n < 0 || Object.is(n, -0) ? '-' : '';
  // `toExponential` writes the exponent with its sign: `1.5e+22`, `1e-7`, and `0e+0` for zero.
  const [mantissa, exponent] = Math.abs(n).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  // The decimal point sits after `point` digits: the value is 0.digits × 10^point.
  const point = Number(exponent) + 1;
  if (point <= -4 || point > 16) {
    const tail = digits.length > 1 ? `.${digits.slice(1)}` : '';
    return `${sign}${digits[0]}${tail}e${exponent[0]}${exponent.slice(1).padStart(2, '0')}`;
  }
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}.0`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** What `str.isprintable()` rejects, apart from the ASCII space. */
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

function reprStr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    // The escape has the width its digits need: `\x7f`, `\u2028`, `\U000e0001`.
    const hex = (ch.codePointAt(0) as number).toString(16);
    if (ch === quote || ch === '\\') out += `\\${ch}`;
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === ' ' || !UNPRINTABLE.test(ch)) out += ch;
    else if (hex.length <= 2) out += `\\x${hex.padStart(2, '0')}`;
    else if (hex.length <= 4) out += `\\u${hex.padStart(4, '0')}`;
    else out += `\\U${hex.padStart(8, '0')}`;
  }
  return out + quote;
}

/** Python `repr(x)`: the `%r` of the kernel's messages. */
export function repr(x: Json): string {
  if (x === null) return 'None';
  if (typeof x === 'boolean') return x ? 'True' : 'False';
  if (typeof x === 'bigint') return x.toString();
  if (x instanceof PyFloat) return floatRepr(x.value);
  if (typeof x === 'string') return reprStr(x);
  if (Array.isArray(x)) return `[${x.map(repr).join(', ')}]`;
  return `{${[...x].map(([k, v]) => `${reprStr(k)}: ${repr(v)}`).join(', ')}}`;
}

/** Python `str(x)`: a string is itself, anything else is its `repr`. */
export const str = (x: Json): string => (typeof x === 'string' ? x : repr(x));

const NUMBER = /(-?(?:0|[1-9][0-9]*))(\.[0-9]+)?([eE][-+]?[0-9]+)?/y;
/** No anchor: the reader tests a slice of four characters at most. */
const HEX4 = /[0-9a-fA-F]{4}/;
const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
/** CPython refuses to convert a longer integer literal. */
const MAX_INT_DIGITS = 4300;

class Reader {
  readonly text: string;
  pos = 0;
  constructor(text: string) {
    this.text = text;
  }

  fail(what: string): never {
    throw new InputError(`${what}: char ${this.pos}`);
  }

  skipWhitespace(): void {
    // Past the end the character is `undefined`, which the list does not hold.
    while (' \t\n\r'.includes(this.text[this.pos])) this.pos++;
  }

  value(): Json {
    const ch = this.text[this.pos];
    if (ch === '"') return this.string();
    if (ch === '{') return this.object();
    if (ch === '[') return this.array();
    for (const [word, value] of [['null', null], ['true', true], ['false', false]] as const) {
      if (this.text.startsWith(word, this.pos)) {
        this.pos += word.length;
        return value;
      }
    }
    NUMBER.lastIndex = this.pos;
    const m = NUMBER.exec(this.text);
    if (m !== null) return this.number(m);
    for (const constant of ['NaN', 'Infinity', '-Infinity']) {
      if (this.text.startsWith(constant, this.pos)) throw new ContractViolation(`non-finite JSON constant: ${constant}`);
    }
    return this.fail('Expecting value');
  }

  number(m: RegExpExecArray): Json {
    this.pos += m[0].length;
    if (m[2] !== undefined || m[3] !== undefined) return new PyFloat(Number(m[0]));
    if (m[1].replace('-', '').length > MAX_INT_DIGITS) throw new InputError('Exceeds the limit for integer string conversion');
    return BigInt(m[1]);
  }

  string(): string {
    let out = '';
    this.pos++;
    for (;;) {
      const ch = this.text[this.pos];
      if (ch === undefined) return this.fail('Unterminated string');
      this.pos++;
      if (ch === '"') return out;
      if (ch < ' ') return this.fail('Invalid control character');
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      const esc = this.text[this.pos];
      this.pos++;
      if (esc === 'u') {
        const hex = this.text.slice(this.pos, this.pos + 4);
        if (!HEX4.test(hex)) return this.fail('Invalid \\uXXXX escape');
        this.pos += 4;
        out += String.fromCharCode(Number.parseInt(hex, 16));
      } else if (Object.hasOwn(ESCAPES, esc)) {
        out += ESCAPES[esc];
      } else {
        return this.fail('Invalid \\escape');
      }
    }
  }

  object(): Json {
    const pairs: [string, Json][] = [];
    this.pos++;
    this.skipWhitespace();
    if (this.text[this.pos] === '}') {
      this.pos++;
      return new Map();
    }
    for (;;) {
      if (this.text[this.pos] !== '"') return this.fail('Expecting property name enclosed in double quotes');
      const key = this.string();
      this.skipWhitespace();
      if (this.text[this.pos] !== ':') return this.fail("Expecting ':' delimiter");
      this.pos++;
      this.skipWhitespace();
      pairs.push([key, this.value()]);
      this.skipWhitespace();
      const next = this.text[this.pos];
      this.pos++;
      if (next === '}') break;
      if (next !== ',') return this.fail("Expecting ',' delimiter");
      this.skipWhitespace();
    }
    const seen = new Map<string, Json>();
    for (const [key, value] of pairs) {
      if (seen.has(key)) throw new ContractViolation(`duplicate JSON key: ${repr(key)} (ambiguous document)`);
      seen.set(key, value);
    }
    return seen;
  }

  array(): Json {
    const items: Json[] = [];
    this.pos++;
    this.skipWhitespace();
    if (this.text[this.pos] === ']') {
      this.pos++;
      return items;
    }
    for (;;) {
      items.push(this.value());
      this.skipWhitespace();
      const next = this.text[this.pos];
      this.pos++;
      if (next === ']') return items;
      if (next !== ',') return this.fail("Expecting ',' delimiter");
      this.skipWhitespace();
    }
  }
}

const BOM = 0xfeff;

/** `json.loads`, which refuses a duplicate key and a non-finite constant. */
export function strictJsonLoads(text: string): Json {
  if (text.charCodeAt(0) === BOM) throw new InputError('Unexpected UTF-8 BOM');
  const reader = new Reader(text);
  reader.skipWhitespace();
  const value = reader.value();
  reader.skipWhitespace();
  if (reader.pos !== text.length) reader.fail('Extra data');
  return value;
}

function quote(s: string, ascii: boolean): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const c = s.charCodeAt(i);
    if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (c < 0x20 || (ascii && c > 0x7e)) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

interface Layout {
  readonly sortKeys: boolean;
  readonly ascii: boolean;
  /** `false` refuses a non-finite float, as `allow_nan=False` does. */
  readonly allowNan: boolean;
  readonly itemSeparator: string;
  readonly keySeparator: string;
  readonly indent: number | null;
}

function float(n: number, layout: Layout): string {
  if (Number.isFinite(n)) return floatRepr(n);
  if (!layout.allowNan) throw new InputError(`Out of range float values are not JSON compliant: ${floatRepr(n)}`);
  return n === Infinity ? 'Infinity' : '-Infinity';
}

function write(x: Json, layout: Layout, depth: number): string {
  if (x === null) return 'null';
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (typeof x === 'bigint') return x.toString();
  if (x instanceof PyFloat) return float(x.value, layout);
  if (typeof x === 'string') return quote(x, layout.ascii);
  const pad = (d: number) => (layout.indent === null ? '' : `\n${' '.repeat(layout.indent * d)}`);
  const parts = Array.isArray(x)
    ? x.map(item => write(item, layout, depth + 1))
    : (layout.sortKeys ? [...x].sort(([a], [b]) => compareCodePoints(a, b)) : [...x])
        .map(([k, v]) => quote(k, layout.ascii) + layout.keySeparator + write(v, layout, depth + 1));
  const [open, close] = Array.isArray(x) ? '[]' : '{}';
  if (parts.length === 0) return open + close;
  return open + pad(depth + 1) + parts.join(layout.itemSeparator + pad(depth + 1)) + pad(depth) + close;
}

/** `json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)`. */
export const canonicalJson = (x: Json): string =>
  write(x, { sortKeys: true, ascii: false, allowNan: false, itemSeparator: ',', keySeparator: ':', indent: null }, 0);

/** `json.dumps(x, ensure_ascii=False)`. */
export const plainJson = (x: Json): string =>
  write(x, { sortKeys: false, ascii: false, allowNan: true, itemSeparator: ', ', keySeparator: ': ', indent: null }, 0);

/** `json.dumps(x, indent=2, sort_keys=True)`. */
export const prettyJson = (x: Json): string =>
  write(x, { sortKeys: true, ascii: true, allowNan: true, itemSeparator: ',', keySeparator: ': ', indent: 2 }, 0);

const LONE_SURROGATE = /\p{Cs}/u;

/** `s.encode("utf-8")`: a lone surrogate has no UTF-8 form, and Python refuses it. */
export function utf8(s: string): Buffer {
  if (LONE_SURROGATE.test(s)) throw new InputError("'utf-8' codec can't encode a surrogate: surrogates not allowed");
  return Buffer.from(s);
}

export const sha256Hex = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
