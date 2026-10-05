import { describe, it, expect } from 'vitest';
import {
  buildApproval, canonicalViolation, hashJson, hashText, match, parseNameStatus, patternViolation, resolvePolicy, truthClasses,
  validateManifest, validateResult, validateScope, verifyApproval, type Change,
} from '../kernel.ts';
import { ContractViolation, InputError, json, type Json } from '../pyjson.ts';

const PERMISSIONS = { dependency_change: false, schema_change: false, data_migration: false, external_side_effect: false };
const manifest = (allowed: string[], more: Record<string, unknown> = {}) => json({
  schema_version: 1, run_id: 'RUN-001', capability: 'CAP-CIR', adapter: 'implement-feature', execution_mode: 'supervised',
  policy_profile: 'supervised-local/v1', semantic_scope: { implements: [], verifies: [], non_goals: [] },
  mechanical_scope: { allowed_paths: allowed, denied_paths: [], permissions: PERMISSIONS },
  truth_change: { policy: 'none', allowed_spec_paths: [] },
  ...more,
});
const touch = (path: string, more: Record<string, unknown> = {}) =>
  validateScope(manifest([path], more), [['M', path]], 'supervised-local/v1');

describe('the governance floor: one path for each surface', () => {
  it.each([
    'scripts/check-all.sh', '.spec-anchored/kernel.ts', 'tests/_harness.py', 'tests/test_kernel_contracts.py', 'tests/test_corpus.py',
    'tests/test-mutants.py', 'policy/profiles/unattended-v1.json', '.claude/settings.json', '.agents/rules/testing.md',
    'agents/mutation-hardener.md', '.codex/hooks.json', '.cursor/rules/a.mdc', 'reviewer-system/skills/a.md', 'protocols/a.md',
    'rules/a.md', 'routines/a.md', 'implement-feature/SKILL.md', 'adaptations/codex.md', '.github/workflows/verify.yml',
    '.gitlab-ci.yml', 'azure-pipelines.yml', 'spec-templates/capability-spec.md', 'GUIDELINE.md', 'GUIDELINE-pt-BR.md',
    'AUTONOMY-PLAYBOOK.md', 'INSTALL.md', 'REVIEW-FINDINGS.md', 'sources-and-learnings.md', 'AGENTS.md', 'src/circuit/AGENTS.md',
    'CLAUDE.md', 'mcp-server/CLAUDE.md', 'CLAUDE-codebase-exploration-block.md', 'docs/CLAUDE-notes.md', '.cursorrules',
    'docs/architecture/constitution.md', 'constitution.md', 'architecture/v2/constitution-v2.md', 'EVALS.md', 'EVALS.template.md',
    'evals/spec-anchored/a.json', 'eval-results/spec-anchored/a.json', '.agent-runs/RUN-001/result.json',
  ])('%s', path => {
    expect(touch(path)).toEqual([
      `${path}: governance floor (the run cannot rewrite the contracts, policies, or gates that judge it - use the harness-hardening flow)`,
    ]);
  });

  it.each([
    'tests/test_app.py', 'tests/harness.py', 'evals/product/a.json', 'eval-results/product/a.json', 'docs/AGENTS.txt', 'src/constitution.ts',
    'architecture/overview.md', 'src/scripts/a.ts', 'docs/GUIDELINE.md', 'README.md',
  ])('%s is not on the floor', path => {
    expect(touch(path)).toEqual([]);
  });
});

describe('the paths that need a permission: one path for each pattern', () => {
  const needs = (path: string) => touch(path).map(v => v.replace(`${path}: touches `, '').replace(' which the manifest declares false', ''));

  it.each([
    'requirements.txt', 'api/requirements.txt', 'requirements/dev.txt', 'package.json', 'web/package.json', 'package-lock.json',
    'web/yarn.lock', 'pnpm-lock.yaml', 'go.mod', 'svc/go.sum', 'Cargo.toml', 'crate/Cargo.lock', 'pyproject.toml', 'poetry.lock',
    'uv.lock', 'Gemfile', 'Gemfile.lock', 'pom.xml', 'build.gradle', 'app/build.gradle.kts', 'app/App.csproj', 'composer.json',
    'composer.lock', 'mix.exs',
  ])('%s is a dependency change', path => {
    expect(needs(path)).toEqual(['dependency_change']);
  });

  it.each([
    'schema.sql', 'prisma/schema.prisma', 'api/schema.graphql', 'db/schema.rb', 'api/schema.json', 'openapi.yaml', 'api/openapi.yml',
    'openapi.json', 'proto/v1.proto', 'swagger.yaml',
  ])('%s is a schema change', path => {
    expect(needs(path)).toEqual(['schema_change']);
  });

  it.each(['db/seeds/users.sql', 'test/fixtures/data/a.json', 'tools/migrate_users.py', 'sql/migrate-001.sql', 'jobs/backfill_names.py'])(
    '%s is a data migration', path => {
      expect(needs(path)).toEqual(['data_migration']);
    });

  it('a migration is a schema change and a data migration', () => {
    expect(needs('db/migrations/001_init.sql')).toEqual(['schema_change', 'data_migration']);
  });

  it.each(['src/requirements.ts', 'requirements/dev/base.txt', 'docs/package.json.md', 'src/schema.ts', 'db/schema.py', 'tools/migrate.py'])(
    '%s needs no permission', path => {
      expect(needs(path)).toEqual([]);
    });

  it('a permission the manifest grants lets the path through', () => {
    const granted = { mechanical_scope: { allowed_paths: ['package.json'], denied_paths: [], permissions: { ...PERMISSIONS, dependency_change: true } } };
    expect(touch('package.json', granted)).toEqual([]);
  });
});

describe('truthClasses: every class a path belongs to', () => {
  it.each<[string, string[]]>([
    ['specs/circuit/circuit.md', ['spec_semantics']],
    ['tests/golden/cases.json', ['golden_oracle']],
    ['src/a/golden/b.txt', ['golden_oracle']],
    ['out/render.golden', ['golden_oracle']],
    ['render.golden', ['golden_oracle']],
    ['test/goldens/a.png', ['golden_oracle']],
    ['.metrics-baseline.json', ['metrics_baseline']],
    ['packages/app/.metrics-baseline.json', ['metrics_baseline']],
    ['specs/pay/golden/cases.json', ['spec_semantics', 'golden_oracle']],
    ['src/circuit/sequence.ts', []],
    ['docs/specs.md', []],
    ['golden.txt', []],
    ['metrics-baseline.json', []],
  ])('%s → %j', (path, classes) => {
    expect(truthClasses(path)).toEqual(classes);
  });

  it('the oracle and the baseline are for a person only, in every profile', () => {
    expect(touch('tests/golden/cases.json')).toEqual([
      "tests/golden/cases.json: the authorized profile allows golden_oracle only as 'human-only' - the manifest cannot raise its own ceiling"]);
    expect(touch('.metrics-baseline.json')).toEqual([
      ".metrics-baseline.json: the authorized profile allows metrics_baseline only as 'human-only' - the manifest cannot raise its own ceiling"]);
  });

  it('a spec under a golden folder needs both, and the amendment grants only the spec', () => {
    const path = 'specs/pay/golden/cases.json';
    expect(touch(path, { truth_change: { policy: 'semantic-amendment', allowed_spec_paths: [path] } })).toEqual([
      `${path}: the authorized profile allows golden_oracle only as 'human-only' - the manifest cannot raise its own ceiling`]);
  });
});

describe('the canonical form of a path, by kind', () => {
  it('a literal path may hold the characters a pattern refuses', () => {
    expect(canonicalViolation('src/app/[id]/page.tsx', 'path')).toBeNull();
    expect(canonicalViolation('src/app/[id]/page.tsx', 'exact')).toBeNull();
    expect(canonicalViolation('src/a*b/c?.ts', 'path')).toBeNull();
  });

  it('an exact path names each operator it holds', () => {
    expect(canonicalViolation('src/a*/b?.ts', 'exact')).toBe(
      'uses a matcher operator (*, ?) where an exact path is required — a grant is never half a glob');
  });

  it('a pattern names each look-alike it holds, and `**` is a whole segment', () => {
    expect(canonicalViolation('src/[a]/{b}/**', 'pattern')).toBe(
      "uses '[', ']', '{', '}', which looks like an operator but is matched literally "
      + '(implemented operators: **/, **, *, ?) — express it as an exact path instead');
    expect(canonicalViolation('src/a**/b', 'pattern')).toBe('`**` must be a complete segment, not part of one');
    expect(canonicalViolation('src/**/b', 'pattern')).toBeNull();
  });

  it('a manifest takes a literal path with brackets, and refuses the same brackets in a pattern', () => {
    expect(validateManifest(manifest(['src/app/[id]/page.tsx']))).toEqual([]);
    expect(validateManifest(manifest(['src/app/[id]/**']))[0]).toContain('which looks like an operator');
    expect(patternViolation('src/app/[id]/page.tsx', resolvePolicy('unattended/v1').get('pattern_grammar') as Map<string, Json>)).toBeNull();
  });
});

describe('the matcher reads code points', () => {
  it('`?` is one character, also outside the basic plane', () => {
    const face = String.fromCodePoint(0x1f600);
    expect(match(`a${face}`, 'a?')).toBe(true);
    expect(match(`a${face}b`, 'a?b')).toBe(true);
    expect(match(`a${face}`, 'a??')).toBe(false);
  });
});

describe('a Markdown hard break', () => {
  it('a line of spaces only is not one', () => {
    expect(hashText('   \nplan\n')).toBe(hashText('plan\n'));
    expect(hashText('plan\n  \n')).toBe(hashText('plan\n'));
    expect(hashText('  ')).toBe(hashText(''));
  });

  it('two spaces after a character that is not whitespace is one, and the message names the line', () => {
    expect(() => hashText('one\ntwo  \nthree\n')).toThrow(new ContractViolation(
      'line 2 ends in a Markdown hard break; canonicalization would erase a rendering difference - rewrite the line'));
    expect(() => hashText('one \n')).not.toThrow();
    expect(() => hashText('one\t  \n')).not.toThrow();
  });

  it('blank edges and every newline form are normalized', () => {
    expect(hashText('\n\n\ra\r\nb\rc\n\n\n')).toBe(hashText('a\nb\nc\n'));
    expect(hashText('')).toBe(hashText('\n\n'));
  });
});

describe('an overlay of forbidden patterns', () => {
  const overlay = (patterns: unknown) => resolvePolicy(json({ base_profile: 'unattended/v1', overlay: { forbidden_path_patterns: patterns } }));

  it('keeps the patterns of the base and adds its own, sorted', () => {
    expect(overlay(['**', '*', 'src/**', '**/*', 'lib/**']).get('forbidden_path_patterns')).toEqual(['*', '**', '**/*', 'lib/**', 'src/**']);
  });

  it('refuses a pattern that is not canonical', () => {
    expect(() => overlay(['**', '*', 'src/**', '**/*', 'lib/** '])).toThrow(new ContractViolation("forbidden_path_patterns: 'lib/** ' — empty or padded"));
  });
});

describe('the approval bundle', () => {
  const BUNDLE: Record<string, unknown> = {
    schema_version: 1, run_id: 'RUN-001', adapter: 'implement-feature', execution_mode: 'supervised',
    policy_profile: 'supervised-local/v1', policy_sha256: hashJson(resolvePolicy('supervised-local/v1')), ticket_ref: 'org/repo#42',
    ticket_body_sha256: 'a'.repeat(64), base_sha: 'b'.repeat(40), spec_entrypoint: 'specs/circuit/circuit.md',
    spec_pinned_commit: 'c'.repeat(40), spec_corpus_sha256: '2'.repeat(64), plan_artifact_id: 'issue-comment:12345',
    plan_sha256: 'd'.repeat(64), scope_manifest_sha256: 'e'.repeat(64), semantic_amendment_sha256: null,
  };
  const build = (change: Record<string, unknown>) => () => buildApproval(json({ ...BUNDLE, ...change }), { policy: 'supervised-local/v1' });
  const RECORD: Record<string, unknown> = {
    schema_version: 1, approval_fingerprint: buildApproval(json(BUNDLE), { policy: 'supervised-local/v1' })[1],
    approval_artifact_id: 'issue-comment:12346', approver: 'fede', approved_at: '2026-10-04T10:00:00Z', provider: 'github',
    repository: 'org/repo', run_id: 'RUN-001',
  };
  const verify = (change: Record<string, unknown>) => verifyApproval(json({ ...RECORD, ...change }), json(BUNDLE), 'supervised-local/v1');

  it.each(Object.keys(BUNDLE).filter(field => field !== 'schema_version' && field !== 'semantic_amendment_sha256'))(
    '%s must be a string', field => {
      expect(build({ [field]: 7 })).toThrow(new ContractViolation(`${field}: expected a string, got int`));
    });

  it('the version is an integer, and the amendment is a string or null', () => {
    expect(build({ schema_version: '1' })).toThrow(new ContractViolation('schema_version: expected a plain int, got str'));
    expect(build({ semantic_amendment_sha256: 7 })).toThrow(new ContractViolation('semantic_amendment_sha256: expected a string or null, got int'));
    expect(build({ semantic_amendment_sha256: 'f'.repeat(64) })).not.toThrow();
  });

  it('a `null` policy is a missing policy, to build and to verify', () => {
    expect(() => buildApproval(json(BUNDLE), { policy: null })).toThrow(/^build_approval requires the resolved policy/);
    expect(() => verifyApproval(json(RECORD), json(BUNDLE), null)).toThrow(/^verify_approval requires the resolved policy/);
  });

  it('the entrypoint is a canonical path under specs/', () => {
    expect(build({ spec_entrypoint: 'specs/../x.md' })).toThrow(new ContractViolation('spec_entrypoint: parent traversal'));
    expect(build({ spec_entrypoint: 'specs/circuit/[draft].md' })).not.toThrow();
    expect(build({ spec_entrypoint: 'docs/circuit.md' })).toThrow(new ContractViolation('spec_entrypoint must live under specs/'));
  });

  it('a record that binds has no violation', () => {
    expect(verify({})).toEqual([]);
  });

  it.each(['approval_artifact_id', 'approver', 'approved_at', 'provider', 'repository', 'run_id'])('an empty %s is named', field => {
    expect(verify({ [field]: '  ' })).toContain(`${field}: empty`);
  });

  it.each(['approval_fingerprint', 'approval_artifact_id', 'approver', 'approved_at', 'provider', 'repository', 'run_id'])(
    '%s must be a string', field => {
      expect(verify({ [field]: 7 })).toContain(`${field}: expected a string`);
    });

  it('the version of a record is an integer', () => {
    expect(verify({ schema_version: '1' })).toEqual(['schema_version must be 1', 'schema_version: expected a plain int']);
  });

  it.each([
    '2024-04-31T00:00:00Z', '2023-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-00-10T00:00:00Z', '2026-01-00T00:00:00Z',
    '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:60Z', '0000-01-01T00:00:00Z', '2026-01-01T00:00:00+24:00',
  ])('%s has the shape of an instant and is not one', stamp => {
    expect(verify({ approved_at: stamp })).toEqual([`approved_at: '${stamp}' is not a real instant (shape is not a calendar)`]);
  });

  it.each(['2024-02-29T23:59:59Z', '2000-02-29T00:00:00.123456789+23:59', '2026-12-31T00:00:00-00:00', '0001-01-31T00:00:00Z'])(
    '%s is a real instant', stamp => {
      expect(verify({ approved_at: stamp })).toEqual([]);
    });
});

describe('the manifest', () => {
  it('a capability of spaces is empty', () => {
    expect(validateManifest(manifest(['src/circuit/**'], { capability: '   ' }))).toEqual(['capability: empty or not a string']);
    expect(validateManifest(manifest(['src/circuit/**'], { capability: 7 }))).toEqual(['capability: empty or not a string']);
  });

  it('each entry of the semantic scope that is not a string is named with its type', () => {
    const semantic = { semantic_scope: { implements: ['BR-CIR-001', 7], verifies: 'AC-CIR-001', non_goals: [null] } };
    expect(validateManifest(manifest(['src/circuit/**'], semantic))).toEqual([
      'semantic_scope.verifies must be a list',
      'semantic_scope.implements contains a non-string entry (int)',
      'semantic_scope.non_goals contains a non-string entry (NoneType)',
    ]);
  });
});

describe('the diff of a run', () => {
  it('the text form reads one change for each line, and two for a rename', () => {
    const text = 'M\tsrc/a.ts\n\nA\tsrc/b c.ts\nR100\tsrc/old.ts\tsrc/new.ts\n';
    expect(parseNameStatus(text, false)).toEqual<Change[]>([
      ['M', 'src/a.ts'], ['A', 'src/b c.ts'], ['R100', 'src/old.ts'], ['R100', 'src/new.ts']]);
  });

  it('the text form refuses a path that git quoted, or padded', () => {
    const refused = (line: string) => () => parseNameStatus(line, false);
    const why = 'line 1: this path cannot be read unambiguously in the textual form (padding or git quoting). '
      + 'Use `git diff --name-status -z` so path bytes are preserved';
    expect(refused('M\t"src/caf\\303\\251.ts"')).toThrow(new ContractViolation(why));
    expect(refused('M\t"src/half')).toThrow(new ContractViolation(why));
    expect(refused('M\t src/a.ts')).toThrow(new ContractViolation(why));
    expect(parseNameStatus('M\tsrc/say"hi".ts', false)).toEqual([['M', 'src/say"hi".ts']]);
  });

  it('the text form refuses a status it cannot read, and a line with the wrong columns', () => {
    expect(() => parseNameStatus('M\ta.ts\n??\tb.ts\n', false)).toThrow(new ContractViolation(
      "line 2: unreadable status '??' (refusing to treat an unparsed diff as no changes)"));
    expect(() => parseNameStatus('M\ta.ts\tb.ts\n', false)).toThrow(new ContractViolation(
      "line 1: expected 2 tab-separated columns for status 'M', got 3"));
    expect(() => parseNameStatus('R90\ta.ts\n', false)).toThrow(new ContractViolation(
      "line 1: expected 3 tab-separated columns for status 'R90', got 2"));
  });

  it('the NUL form keeps a path with a tab and a quote, and refuses a cut record', () => {
    expect(parseNameStatus('M\x00a\tb".ts\x00C75\x00a.ts\x00b.ts\x00', true)).toEqual<Change[]>([
      ['M', 'a\tb".ts'], ['C75', 'a.ts'], ['C75', 'b.ts']]);
    expect(parseNameStatus('', true)).toEqual([]);
    expect(() => parseNameStatus('M\x00a.ts', true)).toThrow(/^NUL stream does not end with its terminator/);
    expect(() => parseNameStatus('M\x00', true)).toThrow(new ContractViolation('truncated name-status record'));
    expect(() => parseNameStatus('R100\x00a.ts\x00', true)).toThrow(new ContractViolation('truncated name-status record'));
    expect(() => parseNameStatus('Z\x00a.ts\x00', true)).toThrow(new ContractViolation("unreadable status field: 'Z'"));
  });
});

describe('the surface of an autonomous run', () => {
  const instance = (overlay: Record<string, unknown>) => resolvePolicy(json({ base_profile: 'orchestrated-autonomous/v1', overlay }));
  const autonomous = (allowed: string[]) => manifest(allowed, {
    adapter: 'implement-orchestrated', execution_mode: 'autonomous', policy_profile: 'orchestrated-autonomous/v1' });

  it('the number of exact paths may reach the limit, and not pass it', () => {
    const policy = instance({ authorized_scope_roots: ['src/circuit'], max_exact_paths: 2 });
    expect(validateScope(autonomous(['src/circuit/a.ts', 'src/circuit/b.ts']), [], policy)).toEqual([]);
    expect(validateScope(autonomous(['src/circuit/a.ts', 'src/circuit/b.ts', 'src/circuit/c.ts']), [], policy)).toEqual([
      '3 exact paths exceed the authorized maximum of 2 (enumeration rebuilds breadth)']);
  });

  it('the number of recursive patterns may reach the limit, and not pass it', () => {
    const policy = instance({ authorized_scope_roots: ['src/circuit', 'src/pieces'], max_recursive_scope_patterns: 1 });
    expect(validateScope(autonomous(['src/circuit/**']), [], policy)).toEqual([]);
    expect(validateScope(autonomous(['src/circuit/**', 'src/pieces/**']), [], policy)).toEqual([
      '2 recursive scope patterns exceed the authorized maximum of 1 (aggregate breadth is breadth)']);
  });

  it('a path is inside a root when it is the root or under it, not when it only starts with its name', () => {
    const policy = instance({ authorized_scope_roots: ['src/circuit'] });
    const outside = (entry: string) => [`allowed_paths entry '${entry}' is outside every authorized scope root ['src/circuit']`];
    expect(validateScope(autonomous(['src/circuit/**']), [], policy)).toEqual([]);
    expect(validateScope(autonomous(['src/circuit/a.ts']), [], policy)).toEqual([]);
    const oneFile = instance({ authorized_scope_roots: ['mcp-server/src/symbols.ts'] });
    expect(validateScope(autonomous(['mcp-server/src/symbols.ts']), [], oneFile)).toEqual([]);
    expect(validateScope(autonomous(['src/circuits/a.ts']), [], policy)).toEqual(outside('src/circuits/a.ts'));
    expect(validateScope(autonomous(['src/circuitry/**']), [], policy)).toEqual(outside('src/circuitry/**'));
    expect(validateScope(autonomous(['src/pieces/**']), [], policy)).toEqual(outside('src/pieces/**'));
  });

  it('a path class the policy protects needs its permission: a class the kernel knows, and a new one', () => {
    const policy = resolvePolicy(json({ base_profile: 'supervised-local/v1', overlay: { protected_path_classes: {
      dependency_change: ['pnpm-workspace.yaml'], deploy: ['vercel.json'] } } }));
    const changed = (path: string) => validateScope(manifest([path]), [['M', path]], policy);
    expect(changed('pnpm-workspace.yaml')).toEqual(['pnpm-workspace.yaml: touches dependency_change which the manifest declares false']);
    expect(changed('package.json')).toEqual(['package.json: touches dependency_change which the manifest declares false']);
    expect(changed('vercel.json')).toEqual(['vercel.json: touches deploy which the manifest declares false']);
    expect(changed('src/a.ts')).toEqual([]);
  });
});

describe('a failure that is not of the contract is not turned into a violation', () => {
  it('validateScope lets it through', () => {
    class Broken extends Map<string, Json> {
      override has(): never {
        throw new Error('the policy cannot be read');
      }
    }
    expect(() => validateScope(manifest(['src/a.ts']), [], new Broken())).toThrow(new Error('the policy cannot be read'));
  });

  it('validateResult throws on an issue reference with two numbers', () => {
    const result = json({
      schema_version: 1, run_id: 'RUN-001', issue_ref: 'org/repo#4#2', terminal: 'NAMED_BLOCKER', claim_state: 'released',
      blocker_kind: 'AMBIGUITY', issue_comment_url: 'https://github.com/org/repo/issues/4#issuecomment-1',
    });
    expect(() => validateResult(result)).toThrow(new InputError('issue_ref does not split into a repository and a number'));
  });

  it.each(['AMBIGUITY', 'MISSING_ORACLE', 'TRUTH_CONFLICT', 'SCOPE_VIOLATION', 'SPEC_CHANGE_REQUIRED', 'SPEC_STALE',
    'GRAPH_DECISION_REQUIRED', 'ENVIRONMENT', 'REPEATED_FAILURE'])('%s is a kind of blocker', kind => {
    expect(validateResult(json({
      schema_version: 1, run_id: 'RUN-001', issue_ref: 'org/repo#4', terminal: 'NAMED_BLOCKER', claim_state: 'released',
      blocker_kind: kind, issue_comment_url: 'https://github.com/org/repo/issues/4#issuecomment-1',
    }))).toEqual([]);
  });

  it.each(['merged', 'landed', 'auto-merged', 'merge_complete'])('a result never says `%s`', claim => {
    expect(validateResult(json({
      schema_version: 1, run_id: 'RUN-001', issue_ref: 'org/repo#4', terminal: 'NAMED_BLOCKER', claim_state: 'released',
      blocker_kind: claim, issue_comment_url: 'https://github.com/org/repo/issues/4#issuecomment-1',
    }))).toContain(`a run never claims '${claim}' - merging is the human's act`);
  });
});
