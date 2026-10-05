import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ContractViolation, InputError, PyFloat, canonicalJson, compareCodePoints, floatRepr, isPySpace, json, plainJson, prettyJson,
  pyEq, repr, rstrip, strictJsonLoads, strip, truthy, typeName, utf8, type Json,
} from '../pyjson.ts';

const char = (code: number) => String.fromCodePoint(code);

describe('the two kinds of refusal carry their name', () => {
  it('a test can tell a contract refusal from an input that cannot be read', () => {
    expect(new ContractViolation('x').name).toBe('ContractViolation');
    expect(new InputError('x').name).toBe('InputError');
  });
});

describe('json: a plain literal as a JSON value', () => {
  it('a scalar that is already a JSON value passes through', () => {
    expect(json(null)).toBeNull();
    expect(json(true)).toBe(true);
    expect(json(false)).toBe(false);
    expect(json('text')).toBe('text');
    expect(json(7n)).toBe(7n);
  });

  it('an object becomes a Map, key by key and in order, at every depth', () => {
    const value = json({ b: { c: [1, { d: null }] }, a: 'x' });
    expect(value).toBeInstanceOf(Map);
    expect(plainJson(value)).toBe('{"b": {"c": [1, {"d": null}]}, "a": "x"}');
  });
});

describe('truthy: the truthiness of Python', () => {
  it.each<[string, Json, boolean]>([
    ['None', null, false], ['False', false, false], ['True', true, true], ['0', 0n, false], ['-1', -1n, true],
    ['0.0', new PyFloat(0), false], ['0.5', new PyFloat(0.5), true], ["''", '', false], ["' '", ' ', true], ['[]', [], false],
    ['[None]', [null], true], ['{}', new Map(), false], ["{'k': None}", new Map([['k', null]]), true],
  ])('%s → %s', (_, value, expected) => {
    expect(truthy(value)).toBe(expected);
  });
});

describe('pyEq: the equality of Python, as the kernel uses it', () => {
  it('a boolean, an integer and a float with one value are equal', () => {
    expect(pyEq(true, 1n)).toBe(true);
    expect(pyEq(1n, new PyFloat(1))).toBe(true);
    expect(pyEq(false, new PyFloat(0))).toBe(true);
    expect(pyEq(2n, new PyFloat(2.5))).toBe(false);
  });

  it('a number equals no string, no null and no container', () => {
    expect(pyEq(1n, '1')).toBe(false);
    expect(pyEq('1', 1n)).toBe(false);
    expect(pyEq(0n, null)).toBe(false);
    expect(pyEq(null, false)).toBe(false);
    expect(pyEq(1n, [1n])).toBe(false);
  });

  it('two values that are not numbers are equal when they are the same value', () => {
    expect(pyEq('a', 'a')).toBe(true);
    expect(pyEq('a', 'b')).toBe(false);
    expect(pyEq(null, null)).toBe(true);
    expect(pyEq(null, 'x')).toBe(false);
  });
});

describe('typeName', () => {
  it('names each kind of value as Python does', () => {
    const names = ([null, true, 1n, new PyFloat(1), 's', [], new Map()] as Json[]).map(typeName);
    expect(names).toEqual(['NoneType', 'bool', 'int', 'float', 'str', 'list', 'dict']);
  });
});

describe('isPySpace: what `str.isspace()` accepts', () => {
  const SPACES = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2005, 0x200a, 0x2028, 0x2029,
    0x202f, 0x205f, 0x3000];
  const NOT_SPACES = [0x00, 0x08, 0x0e, 0x1b, 0x21, 0x41, 0x84, 0x86, 0x9f, 0xa1, 0x167f, 0x1681, 0x1fff, 0x200b, 0x2027, 0x202a, 0x202e,
    0x2030, 0x205e, 0x2060, 0x2fff, 0x3001, 0xfeff];

  it.each(SPACES)('U+%s is a space', code => {
    expect(isPySpace(char(code))).toBe(true);
  });

  it.each(NOT_SPACES)('U+%s is not a space', code => {
    expect(isPySpace(char(code))).toBe(false);
  });

  it('strip and rstrip drop exactly those characters', () => {
    const edge = char(0x2000) + char(0x1680) + '\t ';
    expect(strip(`${edge}a b${edge}`)).toBe('a b');
    expect(rstrip(`${edge}a b${edge}`)).toBe(`${edge}a b`);
    expect(strip(`${char(0x200b)}a${char(0x200b)}`)).toBe(`${char(0x200b)}a${char(0x200b)}`);
    expect(rstrip('a/b//', '/')).toBe('a/b');
    expect(rstrip('', '/')).toBe('');
    expect(strip(' \n ')).toBe('');
  });
});

describe('compareCodePoints: the order Python sorts strings in', () => {
  it('orders by code point, not by UTF-16 unit, and a prefix comes first', () => {
    // U+FF5E is one unit, U+1F600 is two that start at 0xD83D: by unit the second sorts first.
    expect(compareCodePoints(char(0xff5e), char(0x1f600))).toBeLessThan(0);
    expect(compareCodePoints('ab', 'abc')).toBeLessThan(0);
    expect(compareCodePoints('abc', 'ab')).toBeGreaterThan(0);
    expect(compareCodePoints('b', 'ab')).toBeGreaterThan(0);
    expect(compareCodePoints('same', 'same')).toBe(0);
  });
});

describe('floatRepr: the `repr` of a Python float', () => {
  it.each<[number, string]>([
    [0, '0.0'], [-0, '-0.0'], [1, '1.0'], [-1.5, '-1.5'], [100, '100.0'], [0.1, '0.1'], [0.0001, '0.0001'], [0.00001, '1e-05'],
    [-0.00001234, '-1.234e-05'], [1e15, '1000000000000000.0'], [1e16, '1e+16'], [1.5e16, '1.5e+16'], [123456789012345680, '1.2345678901234568e+17'],
    [1e100, '1e+100'], [5e-324, '5e-324'], [1e-7, '1e-07'], [Infinity, 'inf'], [-Infinity, '-inf'],
  ])('%s → %s', (n, expected) => {
    expect(floatRepr(n)).toBe(expected);
  });
});

describe('repr: the `%r` of the messages', () => {
  it('chooses the quote as Python does', () => {
    expect(repr('plain')).toBe("'plain'");
    expect(repr("it's")).toBe('"it\'s"');
    expect(repr('say "hi"')).toBe('\'say "hi"\'');
    expect(repr('both \' and "')).toBe('\'both \\\' and "\'');
    expect(repr('back\\slash')).toBe("'back\\\\slash'");
  });

  it('escapes what is not printable, with the width its code point needs', () => {
    expect(repr('\t\n\r')).toBe("'\\t\\n\\r'");
    expect(repr(char(0x00) + char(0x1f) + char(0x7f))).toBe("'\\x00\\x1f\\x7f'");
    expect(repr(char(0xa0) + char(0xad))).toBe("'\\xa0\\xad'");
    expect(repr(char(0x2028) + char(0xffff))).toBe("'\\u2028\\uffff'");
    expect(repr(char(0xe0001))).toBe("'\\U000e0001'");
    expect(repr(`a b${char(0xff)}${char(0x100)}${char(0x1f600)}`)).toBe(`'a b${char(0xff)}${char(0x100)}${char(0x1f600)}'`);
  });

  it('writes each kind of value', () => {
    expect(repr(json({ a: [null, true, false, 1, 1.5, 'x'], b: {} }))).toBe("{'a': [None, True, False, 1, 1.5, 'x'], 'b': {}}");
  });
});

describe('strictJsonLoads: the errors of the reader', () => {
  it.each<[string, string]>([
    ['', 'Expecting value: char 0'],
    ['  x', 'Expecting value: char 2'],
    ['"open', 'Unterminated string: char 5'],
    ['"a\nb"', 'Invalid control character: char 3'],
    ['"\\u12G4"', 'Invalid \\uXXXX escape: char 3'],
    ['"\\u12"', 'Invalid \\uXXXX escape: char 3'],
    ['"\\x"', 'Invalid \\escape: char 3'],
    ['"\\', 'Invalid \\escape: char 3'],
    ['{a:1}', 'Expecting property name enclosed in double quotes: char 1'],
    ['{"a":1,}', 'Expecting property name enclosed in double quotes: char 7'],
    ['{"a" 1}', "Expecting ':' delimiter: char 5"],
    ['{"a";1}', "Expecting ':' delimiter: char 4"],
    ['{"a":1;"b":2}', "Expecting ',' delimiter: char 7"],
    ['{"a":1', "Expecting ',' delimiter: char 7"],
    ['[1;2]', "Expecting ',' delimiter: char 3"],
    ['[1', "Expecting ',' delimiter: char 3"],
    ['1 2', 'Extra data: char 2'],
    ['{} x', 'Extra data: char 3'],
    [`${char(0xfeff)}{}`, 'Unexpected UTF-8 BOM'],
  ])('%j → %s', (text, message) => {
    const read = () => strictJsonLoads(text);
    expect(read).toThrow(InputError);
    expect(read).toThrow(new InputError(message));
  });

  it('refuses a non-finite constant and a duplicate key as contract violations', () => {
    for (const constant of ['NaN', 'Infinity', '-Infinity']) {
      expect(() => strictJsonLoads(`[${constant}]`)).toThrow(new ContractViolation(`non-finite JSON constant: ${constant}`));
    }
    expect(() => strictJsonLoads('{"a":1,"b":{"k":1,"k":2}}')).toThrow(new ContractViolation("duplicate JSON key: 'k' (ambiguous document)"));
  });

  it('skips the four whitespace characters of JSON, and no other', () => {
    expect(plainJson(strictJsonLoads(' \t\n\r{ "a" \t:\n[ 1 ,\r2 ] , "b" : { } }\n '))).toBe('{"a": [1, 2], "b": {}}');
    expect(() => strictJsonLoads(`${char(0xa0)}1`)).toThrow(new InputError('Expecting value: char 0'));
    expect(() => strictJsonLoads(`1${char(0x0c)}`)).toThrow(new InputError('Extra data: char 1'));
  });

  it('reads every escape of a string', () => {
    expect(strictJsonLoads('"\\"\\\\\\/\\b\\f\\n\\r\\t\\u0041\\u00e9"')).toBe(`"\\/\b\f\n\r\tA${char(0xe9)}`);
  });

  it('an integer keeps every digit, up to the limit of CPython', () => {
    const digits = '9'.repeat(4300);
    expect(strictJsonLoads(digits)).toBe(BigInt(digits));
    expect(strictJsonLoads(`-${digits}`)).toBe(-BigInt(digits));
    expect(() => strictJsonLoads(`${digits}9`)).toThrow(new InputError('Exceeds the limit for integer string conversion'));
    expect(() => strictJsonLoads(`-${digits}9`)).toThrow(new InputError('Exceeds the limit for integer string conversion'));
  });

  it('a number with a fraction or an exponent is a float', () => {
    expect(repr(strictJsonLoads('[0, -0, 0.0, -0.0, 1e2, 1E-2, 2.50, 1e999, -1e999]'))).toBe('[0, 0, 0.0, -0.0, 100.0, 0.01, 2.5, inf, -inf]');
  });
});

describe('the three writers', () => {
  const value = strictJsonLoads(`{"b": [1, 1.0, "~${char(0x7f)}${char(0xe9)}${char(0x1f600)}"], "a": {"z": null, "y": true}, "c": [], "d": {}}`);

  it('canonicalJson sorts the keys, uses no space, and keeps what is not ASCII', () => {
    expect(canonicalJson(value)).toBe(`{"a":{"y":true,"z":null},"b":[1,1.0,"~${char(0x7f)}${char(0xe9)}${char(0x1f600)}"],"c":[],"d":{}}`);
  });

  it('plainJson keeps the order of the document', () => {
    expect(plainJson(value)).toBe(`{"b": [1, 1.0, "~${char(0x7f)}${char(0xe9)}${char(0x1f600)}"], "a": {"z": null, "y": true}, "c": [], "d": {}}`);
  });

  it('prettyJson indents by two and escapes everything past `~`', () => {
    expect(prettyJson(value)).toBe([
      '{',
      '  "a": {',
      '    "y": true,',
      '    "z": null',
      '  },',
      '  "b": [',
      '    1,',
      '    1.0,',
      '    "~\\u007f\\u00e9\\ud83d\\ude00"',
      '  ],',
      '  "c": [],',
      '  "d": {}',
      '}',
    ].join('\n'));
  });

  it('every writer escapes the control characters, and the two that JSON reserves', () => {
    const text = `"\\\b\f\n\r\t${char(0x00)}${char(0x1f)} `;
    expect(canonicalJson(text)).toBe('"\\"\\\\\\b\\f\\n\\r\\t\\u0000\\u001f "');
  });

  it('a float that is not finite is refused in the canonical form, and written by the two others', () => {
    const infinite = [new PyFloat(Infinity), new PyFloat(-Infinity)];
    expect(() => canonicalJson(infinite)).toThrow(new InputError('Out of range float values are not JSON compliant: inf'));
    expect(() => canonicalJson([infinite[1]])).toThrow(new InputError('Out of range float values are not JSON compliant: -inf'));
    expect(plainJson(infinite)).toBe('[Infinity, -Infinity]');
    expect(prettyJson(infinite[0])).toBe('Infinity');
  });
});

describe('utf8', () => {
  it('encodes a string, and refuses a surrogate with no pair', () => {
    expect(utf8(`a${char(0xe9)}${char(0x1f600)}`).toString('hex')).toBe('61c3a9f09f9880');
    expect(() => utf8(`a${String.fromCharCode(0xd83d)}`)).toThrow(new InputError("'utf-8' codec can't encode a surrogate: surrogates not allowed"));
  });
});

describe('properties of the model', () => {
  const scalar = fc.oneof(
    fc.constant(null), fc.boolean(), fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }),
    fc.double({ noNaN: true, noDefaultInfinity: true }).map(n => new PyFloat(n)), fc.string({ unit: 'binary' }).filter(isWellFormed),
  );
  const value: fc.Arbitrary<Json> = fc.letrec<{ value: Json }>(tie => ({
    value: fc.oneof(
      { depthSize: 'small' },
      scalar,
      fc.array(tie('value'), { maxLength: 4 }),
      fc.array(fc.tuple(fc.string({ unit: 'binary' }).filter(isWellFormed), tie('value')), { maxLength: 4 }).map(pairs => new Map(pairs)),
    ),
  })).value;

  it('the canonical form reads back to a value with the same canonical form', () => {
    fc.assert(fc.property(value, v => {
      const text = canonicalJson(v);
      expect(canonicalJson(strictJsonLoads(text))).toBe(text);
    }));
  });

  it('the three writers give documents that read back to one value', () => {
    fc.assert(fc.property(value, v => {
      expect(canonicalJson(strictJsonLoads(prettyJson(v)))).toBe(canonicalJson(v));
      expect(canonicalJson(strictJsonLoads(plainJson(v)))).toBe(canonicalJson(v));
    }));
  });

  it('the canonical form does not depend on the order of the keys', () => {
    fc.assert(fc.property(fc.uniqueArray(fc.tuple(fc.string(), scalar), { selector: ([k]) => k, maxLength: 6 }), pairs => {
      expect(canonicalJson(new Map([...pairs].reverse()))).toBe(canonicalJson(new Map(pairs)));
    }));
  });

  it('a float writes as the shortest text that reads back to the same float', () => {
    fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), n => {
      expect(Object.is(Number(floatRepr(n)), n)).toBe(true);
    }));
  });
});

/** No surrogate without its pair: such a string has no UTF-8 form, and no JSON document holds one. */
function isWellFormed(s: string): boolean {
  return !/\p{Cs}/u.test(s);
}
