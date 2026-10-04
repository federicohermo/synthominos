import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PROFILES, buildApproval, canonicalJsonBytes, canonicalTextBytes, canonicalViolation, match, parseNameStatus,
  patternViolation, resolvePolicy, truthClasses, validateManifest, validateResult, validateScope, verifyApproval,
  type Change, type PathKind,
} from '../kernel.ts';
import { ContractViolation, InputError, canonicalJson, plainJson, prettyJson, repr, strictJsonLoads, type JsonObject } from '../pyjson.ts';

/**
 * The port against the kernel it comes from: `scripts/spec-anchored` at commit `4f8a13e` of
 * spec-anchored-agentic-development, run with Python 3.13.7.
 *
 * `fixtures/python-kernel.json` holds each case with the outcome the PYTHON kernel gave. The cases
 * are every call of the two upstream suites (contracts and adversarial), plus the cases of a
 * seeded fuzz that add an outcome the suites do not show. Every document travels as JSON text,
 * so the two parsers are compared too. During the port, 109 000 fuzz cases gave no difference.
 */

type Args = Record<string, unknown>;
interface Outcome { readonly kind: 'value' | 'refusal' | 'error' | 'crash'; readonly value?: unknown; readonly message?: string }
interface Case { readonly id: string; readonly op: string; readonly args: Args; readonly expected: Outcome }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(path.join(HERE, 'fixtures/python-kernel.json'), 'utf8')) as Case[];

const text = (a: Args, key: string) => a[key] as string;
const doc = (a: Args, key: string) => strictJsonLoads(text(a, key));
const policy = (a: Args, key: string) => (typeof a[key] === 'string' ? doc(a, key) : undefined);

const OPS: Record<string, (a: Args) => unknown> = {
  loads: a => repr(doc(a, 'text')),
  canon_json: a => canonicalJsonBytes(doc(a, 'text')).toString('hex'),
  plain_json: a => plainJson(doc(a, 'text')),
  pretty_json: a => prettyJson(doc(a, 'text')),
  canon_text: a => canonicalTextBytes(text(a, 'text'), a.strict !== false).toString('hex'),
  match: a => match(text(a, 'path'), text(a, 'pattern')),
  canonical_violation: a => canonicalViolation(doc(a, 'value'), a.kind as PathKind),
  pattern_violation: a => patternViolation(
    text(a, 'pattern'), (PROFILES.get(text(a, 'profile')) as JsonObject).get('pattern_grammar') as JsonObject),
  truth_classes: a => truthClasses(text(a, 'path')).sort(),
  resolve_policy: a => canonicalJson(new Map(resolvePolicy(doc(a, 'spec')))),
  build_approval: a => {
    const [bundle, fingerprint] = buildApproval(doc(a, 'parts'), { policy: policy(a, 'policy'), shapeOnly: a.shape_only === true });
    return { bundle: canonicalJson(bundle), fingerprint };
  },
  verify_approval: a => verifyApproval(doc(a, 'record'), doc(a, 'bundle'), policy(a, 'policy')),
  validate_manifest: a => validateManifest(doc(a, 'manifest')),
  parse_name_status: a => parseNameStatus(text(a, 'text'), a.nul === true),
  validate_scope: a => validateScope(doc(a, 'manifest'), a.changes as Change[], policy(a, 'profile')),
  validate_result: a => validateResult(doc(a, 'result')),
};
/** The ops that accept with an EMPTY list. Any other op accepts by returning a value. */
const VALIDATORS = ['verify_approval', 'validate_manifest', 'validate_scope', 'validate_result'];

function outcome(c: Case): Outcome {
  try {
    return { kind: 'value', value: OPS[c.op](c.args) };
  } catch (e) {
    if (e instanceof ContractViolation) return { kind: 'refusal', message: e.message };
    if (e instanceof InputError) return { kind: 'error' };
    throw e;
  }
}

const accepts = (c: Case, o: Outcome) =>
  o.kind === 'value' && (!VALIDATORS.includes(c.op) || (Array.isArray(o.value) && o.value.length === 0));

describe('the port answers as the Python kernel does', () => {
  it('the fixtures cover every operation of the kernel', () => {
    expect([...new Set(CASES.map(c => c.op))].sort()).toEqual(Object.keys(OPS).sort());
    expect(CASES.length).toBeGreaterThan(2000);
  });

  it.each(Object.keys(OPS))('%s: every value and every refusal is identical, to the byte', op => {
    const cases = CASES.filter(c => c.op === op && (c.expected.kind === 'value' || c.expected.kind === 'refusal'));
    expect(cases.length).toBeGreaterThan(0);
    const different = cases.filter(c => JSON.stringify(outcome(c)) !== JSON.stringify(c.expected)).map(c => c.id);
    expect(different).toEqual([]);
  });

  it('where Python cannot read the input, or crashes, the port never accepts', () => {
    const cases = CASES.filter(c => c.expected.kind === 'error' || c.expected.kind === 'crash');
    expect(cases.length).toBeGreaterThan(50);
    expect(cases.filter(c => accepts(c, outcome(c))).map(c => c.id)).toEqual([]);
  });
});
