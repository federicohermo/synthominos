import { describe, it, expect } from 'vitest';
import {
  OPERATORS, PROFILES, ResolvedPolicy, buildApproval, hashJson, hashText, match, resolvePolicy, validateScope,
} from '../kernel.ts';
import { ContractViolation, PyFloat, json, repr, strictJsonLoads, type JsonObject } from '../pyjson.ts';

const policySha = hashJson(resolvePolicy('supervised-local/v1'));
const BUNDLE = {
  schema_version: 1, run_id: 'RUN-001', adapter: 'implement-feature', execution_mode: 'supervised',
  policy_profile: 'supervised-local/v1', policy_sha256: policySha, ticket_ref: 'org/repo#42',
  ticket_body_sha256: 'a'.repeat(64), base_sha: 'b'.repeat(40), spec_entrypoint: 'specs/circuit/circuit.md',
  spec_pinned_commit: 'c'.repeat(40), spec_corpus_sha256: '2'.repeat(64), plan_artifact_id: 'issue-comment:12345',
  plan_sha256: 'd'.repeat(64), scope_manifest_sha256: 'e'.repeat(64), semantic_amendment_sha256: null,
};
const MANIFEST = {
  schema_version: 1, run_id: 'RUN-001', capability: 'CAP-CIR', adapter: 'implement-feature', execution_mode: 'supervised',
  policy_profile: 'supervised-local/v1',
  semantic_scope: { implements: ['BR-CIR-001'], verifies: ['AC-CIR-004'], non_goals: [] },
  mechanical_scope: {
    allowed_paths: ['src/circuit/**'], denied_paths: ['src/circuit/secret/**'],
    permissions: { dependency_change: false, schema_change: false, data_migration: false, external_side_effect: false },
  },
  truth_change: { policy: 'none', allowed_spec_paths: [] },
};
const scope = (paths: string[], manifest: unknown = MANIFEST) =>
  validateScope(json(manifest), paths.map(p => ['M', p] as const), 'supervised-local/v1');

describe('json: a plain literal as a JSON value', () => {
  it('an integer stays an integer, a fraction is a float, and a built value passes through', () => {
    const float = new PyFloat(2.5);
    const map: JsonObject = new Map([['k', 1n]]);
    const value = json({ a: 1, b: 1.5, c: float, d: map, e: [null, true, 'x', 2n] }) as JsonObject;
    expect(value.get('a')).toBe(1n);
    expect(value.get('b')).toBeInstanceOf(PyFloat);
    expect(value.get('c')).toBe(float);
    expect(value.get('d')).toBe(map);
    expect(repr(value)).toBe("{'a': 1, 'b': 1.5, 'c': 2.5, 'd': {'k': 1}, 'e': [None, True, 'x', 2]}");
  });

  it('the reader keeps `1` and `1.0` apart, which JSON.parse cannot', () => {
    expect(repr(strictJsonLoads('[1, 1.0, 1e2]'))).toBe('[1, 1.0, 100.0]');
    expect(hashJson(strictJsonLoads('{"n":1}'))).not.toBe(hashJson(strictJsonLoads('{"n":1.0}')));
  });
});

describe('the policy is issued, never self-declared', () => {
  it('a resolved policy resolves to itself, and JSON cannot produce one', () => {
    const resolved = resolvePolicy('supervised-local/v1');
    expect(resolved).toBeInstanceOf(ResolvedPolicy);
    expect(resolvePolicy(resolved)).toBe(resolved);
    expect(strictJsonLoads('{}')).not.toBeInstanceOf(ResolvedPolicy);
  });

  it('the four profiles exist, and only the supervised one may amend a spec', () => {
    expect([...PROFILES.keys()]).toEqual([
      'supervised-local/v1', 'orchestrated-assisted/v1', 'orchestrated-autonomous/v1', 'unattended/v1']);
    expect([...PROFILES.values()].map(p => p.get('spec_semantics'))).toEqual(['gated', 'proposal-only', 'proposal-only', 'proposal-only']);
  });

  it('an overlay narrows and never widens', () => {
    expect(() => resolvePolicy(json({ base_profile: 'unattended/v1', overlay: { spec_semantics: 'gated' } }))).toThrow(ContractViolation);
    expect(() => resolvePolicy(json({ base_profile: 'unattended/v1', overlay: { forbidden_path_patterns: [] } }))).toThrow(ContractViolation);
    const narrowed = resolvePolicy(json({ base_profile: 'supervised-local/v1', overlay: { spec_semantics: 'human-only' } }));
    expect(narrowed.get('spec_semantics')).toBe('human-only');
  });
});

describe('the approval fingerprint', () => {
  it('is the same for the same content, and changes when any part changes', () => {
    const [, fingerprint] = buildApproval(json(BUNDLE), { policy: 'supervised-local/v1' });
    const reordered = Object.fromEntries(Object.entries(BUNDLE).reverse());
    expect(buildApproval(json(reordered), { policy: 'supervised-local/v1' })[1]).toBe(fingerprint);
    expect(buildApproval(json({ ...BUNDLE, plan_sha256: 'f'.repeat(64) }), { policy: 'supervised-local/v1' })[1]).not.toBe(fingerprint);
  });

  it('needs the policy, unless the call asks for the shape only', () => {
    expect(() => buildApproval(json(BUNDLE))).toThrow(ContractViolation);
    expect(buildApproval(json(BUNDLE), { shapeOnly: true })[1]).toHaveLength(64);
  });

  it('hashText refuses a Markdown hard break by default', () => {
    expect(() => hashText('a plan  \nnext\n')).toThrow(ContractViolation);
    expect(hashText('a plan  \nnext\n', false)).toBe(hashText('a plan\nnext\n'));
    expect(hashText('one \r\ntwo\r\n\r\n')).toBe(hashText('\n\none\ntwo\n'));
  });
});

describe('the scope of a run in this repo', () => {
  it('a change inside the capability folder passes', () => {
    expect(scope(['src/circuit/sequence.ts', 'src/circuit/__tests__/sequence.test.ts'])).toEqual([]);
  });

  it('a change outside the allowed paths, or under a denied path, is refused', () => {
    expect(scope(['src/playback/engine.ts'])).toEqual(['src/playback/engine.ts: outside allowed_paths']);
    expect(scope(['src/circuit/secret/key.ts'])[0]).toContain('denied_paths is absolute');
  });

  const allowing = (paths: string[]) => ({ ...MANIFEST, mechanical_scope: { ...MANIFEST.mechanical_scope, allowed_paths: paths, denied_paths: [] } });

  it('no run edits the harness that judges it, whatever the manifest allows', () => {
    const governed = ['.spec-anchored/kernel.ts', '.agents/rules/specs.md', '.claude/settings.json', 'agents/general-code-reviewer.md',
      'policy/profiles/supervised-local-v1.json', '.github/workflows/verify.yml', 'AGENTS.md', 'src/circuit/AGENTS.md', 'CLAUDE.md',
      'docs/architecture/constitution.md'];
    for (const path of governed) expect(scope([path], allowing([path])), path).toEqual([expect.stringContaining('governance floor')]);
  });

  it('a spec changes only with a semantic amendment that names it', () => {
    expect(scope(['specs/circuit/circuit.md'])[0]).toContain("spec_semantics write requires truth_change.policy == 'semantic-amendment'");
    const amended = { ...MANIFEST, truth_change: { policy: 'semantic-amendment', allowed_spec_paths: ['specs/circuit/circuit.md'] } };
    expect(scope(['specs/circuit/circuit.md'], amended)).toEqual([]);
    expect(scope(['specs/playback/playback.md'], amended)).toEqual([
      'specs/playback/playback.md: spec_semantics write outside allowed_spec_paths (exact paths only)']);
  });

  it('a dependency file needs its permission, even inside the allowed paths', () => {
    expect(scope(['package.json', 'pnpm-lock.yaml'], allowing(['package.json', 'pnpm-lock.yaml']))).toEqual([
      'package.json: touches dependency_change which the manifest declares false',
      'pnpm-lock.yaml: touches dependency_change which the manifest declares false',
    ]);
  });
});

describe('the matcher', () => {
  it('reads the longest operator first, and `*` does not cross a slash', () => {
    expect(OPERATORS.map(([token]) => token)).toEqual(['**/', '**', '*', '?']);
    expect(match('src/a/b.ts', 'src/**')).toBe(true);
    expect(match('src/a/b.ts', 'src/*')).toBe(false);
    expect(match('x.md', '**/x.md')).toBe(true);
    expect(match('src/app/[id]/page.tsx', 'src/app/[id]/page.tsx')).toBe(true);
  });
});
