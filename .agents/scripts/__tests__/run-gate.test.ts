import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { buildApproval, hashJson, hashText, resolvePolicy } from '../../../.spec-anchored/kernel.ts';
import { json } from '../../../.spec-anchored/pyjson.ts';
import type { Git } from '../policy.ts';
import { pullRequestRule, runFindings, type RunStore } from '../run-gate.ts';

const TREE = '/repo';
const RUN = '/repo/.agent-runs/RUN-138-20261004T2130Z';
const BASE = 'b'.repeat(40);
const BRANCH = 'feature/138-x';
const PLAN = '1. add the validator\n2. test it\n';
const INSTANCE = { base_profile: 'orchestrated-autonomous/v1', overlay: { authorized_scope_roots: ['src/circuit'] } };

const git: Git = { paths: path.posix, ownCheckout: () => TREE, treeOf: () => TREE, mainCheckoutOf: () => TREE, branchOf: () => 'feature/138-x' };

interface Shape { readonly profile?: string; readonly mode?: string; readonly adapter?: string; readonly policy?: object | string }

/** The files of a run whose approval holds, built with the kernel. */
function runFiles({ profile = 'supervised-local/v1', mode = 'supervised', adapter = 'implement-feature', policy = profile }: Shape = {}) {
  const manifest = {
    schema_version: 1, run_id: 'RUN-138', capability: 'CAP-CIR', adapter, execution_mode: mode, policy_profile: profile,
    semantic_scope: { implements: ['BR-CIR-001'], verifies: ['AC-CIR-004'], non_goals: [] },
    mechanical_scope: {
      allowed_paths: ['src/circuit/**'], denied_paths: [],
      permissions: { dependency_change: false, schema_change: false, data_migration: false, external_side_effect: false },
    },
    truth_change: { policy: 'none', allowed_spec_paths: [] },
  };
  const bundle = {
    schema_version: 1, run_id: 'RUN-138', adapter, execution_mode: mode, policy_profile: profile,
    policy_sha256: hashJson(resolvePolicy(json(policy))), ticket_ref: 'federicohermo/synthominos#138',
    ticket_body_sha256: 'a'.repeat(64), base_sha: BASE, spec_entrypoint: 'specs/circuit/circuit.md',
    spec_pinned_commit: 'c'.repeat(40), spec_corpus_sha256: '2'.repeat(64), plan_artifact_id: 'run:RUN-138/plan.md',
    plan_sha256: hashText(PLAN), scope_manifest_sha256: hashJson(json(manifest)), semantic_amendment_sha256: null,
  };
  const [, fingerprint] = buildApproval(json(bundle), { policy: json(policy) });
  const record = {
    schema_version: 1, approval_fingerprint: fingerprint, approval_artifact_id: 'session:RUN-138', approver: 'fede',
    approved_at: '2026-10-04T21:30:00Z', provider: 'local', repository: 'federicohermo/synthominos', run_id: 'RUN-138',
  };
  return new Map<string, string>([
    ['run-state.json', JSON.stringify({ branch: 'feature/138-x' })],
    ['approval.json', JSON.stringify({ canonicalization: 'sa-canon/1', approval_bundle: bundle, 'APPROVAL-FINGERPRINT': fingerprint })],
    ['approval-record.json', JSON.stringify(record)],
    ['scope-manifest.json', JSON.stringify(manifest, null, 2)],
    ['plan.md', PLAN],
  ]);
}

const INSIDE = 'M\0src/circuit/sequence.ts\0';

/** `runs` maps a run folder to its files. */
function storeOf(runs: Record<string, ReadonlyMap<string, string>>, diff: string | null = INSIDE) {
  const asked: string[][] = [];
  const store: RunStore = {
    list: dir => (dir === `${TREE}/.agent-runs` ? Object.keys(runs).map(run => path.posix.basename(run)) : [...(runs[dir]?.keys() ?? [])]),
    read: file => runs[path.posix.dirname(file)]?.get(path.posix.basename(file)) ?? null,
    diff: (tree, base, branch) => { asked.push([tree, base, branch]); return diff; },
  };
  return { store, asked };
}

const findings = (files: ReadonlyMap<string, string>, diff: string | null = INSIDE) => runFindings(RUN, TREE, BRANCH, git, storeOf({ [RUN]: files }, diff).store);
const withFile = (name: string, text: string | null, base = runFiles()) => {
  const files = new Map(base);
  if (text === null) files.delete(name);
  else files.set(name, text);
  return files;
};

describe('runFindings: what the kernel refuses in a run folder', () => {
  it('a run whose approval and scope hold has no finding, and the diff starts at the approved base', () => {
    const { store, asked } = storeOf({ [RUN]: runFiles() });
    expect(runFindings(RUN, TREE, BRANCH, git, store)).toEqual([]);
    expect(asked).toEqual([[TREE, BASE, BRANCH]]);
  });

  it('a plan saved with CRLF is the same plan', () => {
    expect(findings(withFile('plan.md', PLAN.replaceAll('\n', '\r\n')))).toEqual([]);
  });

  it('an instance in the run folder is the policy when its hash is the approved one', () => {
    const autonomous = runFiles({ profile: 'orchestrated-autonomous/v1', mode: 'autonomous', adapter: 'implement-orchestrated', policy: INSTANCE });
    expect(findings(withFile('policy-138.json', JSON.stringify(INSTANCE), autonomous))).toEqual([]);
    expect(findings(autonomous)).toEqual(['no policy of the run hashes to the `policy_sha256` of the approval']);
  });

  it.each([
    ['approval.json', 'the run has no `approval.json`'],
    ['approval-record.json', 'the run has no `approval-record.json`'],
    ['scope-manifest.json', 'the run has no `scope-manifest.json`'],
    ['plan.md', 'the run has no `plan.md`'],
  ])('a run with no %s is refused', (name, finding) => {
    expect(findings(withFile(name, null))).toEqual([finding]);
  });

  it.each(['[]', '{}', '{"approval_bundle": "x"}'])('an approval.json of %s holds no bundle', text => {
    expect(findings(withFile('approval.json', text))).toEqual(['`approval.json` holds no `approval_bundle`']);
  });

  it.each([['an unknown profile', '"nope/v1"'], ['a profile that is not a string', '5']])('%s resolves to no policy', (_, profile) => {
    const approval = String(runFiles().get('approval.json')).replace('"supervised-local/v1"', profile);
    expect(findings(withFile('approval.json', approval))).toEqual(['no policy of the run hashes to the `policy_sha256` of the approval']);
  });

  it('a manifest or a plan that changed after the approval is refused by name', () => {
    const manifest = String(runFiles().get('scope-manifest.json')).replace('src/circuit/**', 'src/**');
    expect(findings(withFile('scope-manifest.json', manifest))).toEqual(['`scope-manifest.json` is not the manifest that was approved']);
    expect(findings(withFile('plan.md', `${PLAN}3. and one more thing\n`))).toEqual(['`plan.md` is not the plan that was approved']);
  });

  it('a record of another approval is refused with the words of the kernel', () => {
    const record = String(runFiles().get('approval-record.json')).replace(/"approval_fingerprint":"[0-9a-f]{64}"/, `"approval_fingerprint":"${'f'.repeat(64)}"`);
    expect(findings(withFile('approval-record.json', record))).toEqual([
      'approval record does not match this bundle (stale approval, or approval of a different object)',
    ]);
  });

  it('a path outside the manifest, and a harness file, are refused by the scope check', () => {
    const out = findings(runFiles(), 'M\0src/playback/engine.ts\0M\0AGENTS.md\0');
    expect(out).toHaveLength(2);
    expect(out.join('\n')).toMatch(/src\/playback\/engine\.ts/);
    expect(out.join('\n')).toMatch(/AGENTS\.md/);
  });

  it('a base that git cannot diff from is a finding', () => {
    expect(findings(runFiles(), null)).toEqual(['git cannot diff from the `base_sha` of the approval to `feature/138-x`']);
  });

  it('a file that is not JSON, and a bundle the kernel rejects, are findings with the reason', () => {
    expect(findings(withFile('scope-manifest.json', '{'))).toHaveLength(1);
    const approval = String(runFiles().get('approval.json')).replace('"run:RUN-138/plan.md"', '" "');
    expect(findings(withFile('approval.json', approval))).toEqual([expect.stringMatching(/^plan_artifact_id: the approved plan needs an address/)]);
  });

  it('a base that is not a string asks git nothing, and the kernel names the field', () => {
    const { store, asked } = storeOf({ [RUN]: withFile('approval.json', String(runFiles().get('approval.json')).replace(`"${BASE}"`, '5')) });
    expect(runFindings(RUN, TREE, BRANCH, git, store)).toEqual(['base_sha: expected a string, got int']);
    expect(asked).toEqual([]);
  });

  it('an error that is not a refusal leaves the gate', () => {
    const store: RunStore = { list: () => [], read: () => { throw new Error('disk'); }, diff: () => null };
    expect(() => runFindings(RUN, TREE, BRANCH, git, store)).toThrow('disk');
  });
});

describe('pullRequestRule', () => {
  const pr = (head: string | null = null) => ({ writes: [], worktrees: [], pullRequests: [{ cwd: TREE, head }] });
  const NO_RUNS = storeOf({}).store;

  it('says nothing when no pull request opens', () => {
    expect(pullRequestRule({ writes: [], worktrees: [], pullRequests: [] }, git, NO_RUNS)).toEqual({ kind: 'no-opinion' });
  });

  it.each<[string, Partial<Git>, string | null]>([
    ['outside any repo', { treeOf: () => null }, null],
    ['in another repo', { mainCheckoutOf: () => '/other' }, null],
    ['with no branch', { branchOf: () => null }, null],
    ['from a harness branch', { branchOf: () => 'harness/x' }, null],
    ['that names a docs branch as its head', {}, 'docs/x'],
  ])('says nothing about a pull request %s', (_, patch, head) => {
    expect(pullRequestRule(pr(head), { ...git, ...patch }, NO_RUNS)).toEqual({ kind: 'no-opinion' });
  });

  it('warns when the product branch has no run, also among the runs of other branches and broken run states', () => {
    const other = new Map([['run-state.json', JSON.stringify({ branch: 'feature/other' })]]);
    const runs = {
      '/repo/.agent-runs/RUN-1': other,
      '/repo/.agent-runs/RUN-2': new Map([['run-state.json', '{']]),
      '/repo/.agent-runs/RUN-3': new Map([['run-state.json', '{"branch": 7}']]),
      '/repo/.agent-runs/RUN-4': new Map([['run-state.json', '"feature/138-x"']]),
      '/repo/.agent-runs/verify': new Map<string, string>(),
    };
    expect(pullRequestRule(pr(), git, storeOf(runs).store)).toEqual({
      kind: 'warn',
      reason: 'run gate: the branch `feature/138-x` has no run in `.agent-runs/`. No approval and no scope check stand behind this PR.',
    });
  });

  it('lets the pull request through when the kernel accepts the last run of the branch, judged on the named head', () => {
    const stale = withFile('plan.md', 'an older plan\n');
    const { store, asked } = storeOf({ '/repo/.agent-runs/RUN-138-20261004T2000Z': stale, [RUN]: runFiles() });
    expect(pullRequestRule(pr(BRANCH), { ...git, branchOf: () => 'staging' }, store)).toEqual({ kind: 'no-opinion' });
    expect(asked).toEqual([[TREE, BASE, BRANCH]]);
  });

  it('denies the pull request with each finding of the kernel', () => {
    const verdict = pullRequestRule(pr(), git, storeOf({ [RUN]: withFile('plan.md', 'another plan\n') }).store);
    expect(verdict).toEqual({
      kind: 'deny',
      reason: 'The kernel refuses the run `RUN-138-20261004T2130Z`:\n- `plan.md` is not the plan that was approved\n' +
        'Finish Phase 3 of `.agents/protocols/implementation-protocol.md`, or go back to it: a changed plan, manifest or policy needs a new approval.',
    });
  });
});
