import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main, realIo, type Io } from '../cli.ts';
import { buildApproval, hashJson, hashText, resolvePolicy } from '../kernel.ts';
import { InputError, json, strictJsonLoads } from '../pyjson.ts';

/** An `Io` over a map of files, which keeps what the command wrote. */
function fakeIo(files: Record<string, string>) {
  const out: (string | Buffer)[] = [];
  const err: string[] = [];
  const io: Io = {
    read(file) {
      if (!(file in files)) throw new InputError(`cannot read ${file}`);
      return files[file];
    },
    out: data => void out.push(data),
    err: text => void err.push(text),
  };
  return { io, out, err, stdout: () => out.map(String).join('') };
}

const BUNDLE = {
  schema_version: 1, run_id: 'RUN-001', adapter: 'implement-feature', execution_mode: 'supervised',
  policy_profile: 'supervised-local/v1', policy_sha256: hashJson(resolvePolicy('supervised-local/v1')), ticket_ref: 'org/repo#42',
  ticket_body_sha256: 'a'.repeat(64), base_sha: 'b'.repeat(40), spec_entrypoint: 'specs/circuit/circuit.md',
  spec_pinned_commit: 'c'.repeat(40), spec_corpus_sha256: '2'.repeat(64), plan_artifact_id: 'issue-comment:12345',
  plan_sha256: 'd'.repeat(64), scope_manifest_sha256: 'e'.repeat(64), semantic_amendment_sha256: null,
};
const [, FINGERPRINT] = buildApproval(json(BUNDLE), { policy: 'supervised-local/v1' });
const RECORD = {
  schema_version: 1, approval_fingerprint: FINGERPRINT, approval_artifact_id: 'issue-comment:12346', approver: 'fede',
  approved_at: '2026-10-04T10:00:00Z', provider: 'github', repository: 'org/repo', run_id: 'RUN-001',
};
const MANIFEST = {
  schema_version: 1, run_id: 'RUN-001', capability: 'CAP-CIR', adapter: 'implement-feature', execution_mode: 'supervised',
  policy_profile: 'supervised-local/v1', semantic_scope: { implements: ['BR-CIR-001'], verifies: ['AC-CIR-004'], non_goals: [] },
  mechanical_scope: {
    allowed_paths: ['src/circuit/**'], denied_paths: [],
    permissions: { dependency_change: false, schema_change: false, data_migration: false, external_side_effect: false },
  },
  truth_change: { policy: 'none', allowed_spec_paths: [] },
};
const RESULT = {
  schema_version: 1, run_id: 'RUN-001', issue_ref: 'org/repo#42', terminal: 'NAMED_BLOCKER', claim_state: 'released',
  blocker_kind: 'AMBIGUITY', issue_comment_url: 'https://github.com/org/repo/issues/42#issuecomment-1',
};
const FILES = {
  'plan.md': '1. add the validator\n2. test it\n',
  'break.md': 'a hard break  \nnext\n',
  'doc.json': '{"b": 1, "a": [1.0, "é"]}',
  'dupes.json': '{"a":1,"a":2}',
  'bundle.json': JSON.stringify(BUNDLE),
  'record.json': JSON.stringify(RECORD),
  'bad-record.json': JSON.stringify({ ...RECORD, approver: '' }),
  'manifest.json': JSON.stringify(MANIFEST),
  'inside.txt': 'M\tsrc/circuit/sequence.ts\n',
  'outside.txt': 'M\tsrc/playback/engine.ts\nM\tAGENTS.md\n',
  'renamed.bin': 'R100\x00src/circuit/a.ts\x00src/circuit/b.ts\x00',
  'result.json': JSON.stringify(RESULT),
  'bad-result.json': JSON.stringify({ ...RESULT, claim_state: 'parked' }),
  'overlay.json': JSON.stringify({ base_profile: 'supervised-local/v1', overlay: { denied_path_patterns: ['src/circuit/secret/**'] } }),
};
const run = (...argv: string[]) => {
  const fake = fakeIo(FILES);
  return { code: main(argv, fake.io), ...fake };
};

describe('canonicalize', () => {
  it('prints the hash of a text body, and of a JSON document', () => {
    expect(run('canonicalize', 'plan.md').stdout()).toBe(`${hashText(FILES['plan.md'])}\n`);
    expect(run('canonicalize', 'doc.json', '--kind', 'json').stdout()).toBe(`${hashJson(strictJsonLoads(FILES['doc.json']))}\n`);
  });

  it('takes each value of `--kind` and `--emit` by name', () => {
    const hash = `${hashText(FILES['plan.md'])}\n`;
    expect(run('canonicalize', 'plan.md', '--kind', 'text', '--emit', 'hash')).toMatchObject({ code: 0, out: [hash] });
    expect(run('canonicalize', 'plan.md', '--emit', 'bytes').out).toEqual([Buffer.from(FILES['plan.md'])]);
  });

  it('emits the canonical bytes: sorted keys, no spaces, `1.0` kept', () => {
    const { code, out } = run('canonicalize', 'doc.json', '--kind', 'json', '--emit', 'bytes');
    expect(code).toBe(0);
    expect(out).toEqual([Buffer.from('{"a":[1.0,"é"],"b":1}', 'utf8')]);
  });

  it('refuses a Markdown hard break, unless the call allows it', () => {
    const refused = run('canonicalize', 'break.md');
    expect(refused.code).toBe(1);
    expect(refused.err.join('')).toMatch(/^FAIL - line 1 ends in a Markdown hard break/);
    expect(run('canonicalize', 'break.md', '--allow-hard-breaks').code).toBe(0);
  });

  it('refuses a duplicate key', () => {
    const { code, err } = run('canonicalize', 'dupes.json', '--kind', 'json');
    expect([code, err.join('')]).toEqual([1, "FAIL - duplicate JSON key: 'a' (ambiguous document)\n"]);
  });
});

describe('build-approval and verify-approval', () => {
  it('prints the canonical bundle and its fingerprint, with sorted keys', () => {
    const { code, stdout } = run('build-approval', 'bundle.json', '--policy', 'supervised-local/v1');
    const printed = JSON.parse(stdout()) as Record<string, unknown>;
    expect(code).toBe(0);
    expect(Object.keys(printed)).toEqual(['APPROVAL-FINGERPRINT', 'approval_bundle', 'canonicalization']);
    expect(printed['APPROVAL-FINGERPRINT']).toBe(FINGERPRINT);
    expect(printed.canonicalization).toBe('sa-canon/1');
    expect(stdout().startsWith('{\n  "APPROVAL-FINGERPRINT": "')).toBe(true);
  });

  it('refuses a bundle whose policy hash is of another policy', () => {
    const { code, err } = run('build-approval', 'bundle.json', '--policy', 'overlay.json');
    expect(code).toBe(1);
    expect(err.join('')).toContain('policy_sha256 does not match the resolved policy artifact');
  });

  it('a record that binds passes, and a record without an approver is listed', () => {
    const ok = run('verify-approval', 'record.json', '--bundle', 'bundle.json', '--policy', 'supervised-local/v1');
    expect([ok.code, ok.stdout()]).toEqual([0, `OK - approval record binds to ${FINGERPRINT.slice(0, 12)}...\n`]);
    const bad = run('verify-approval', 'bad-record.json', '--bundle', 'bundle.json', '--policy', 'supervised-local/v1');
    expect([bad.code, bad.stdout()]).toEqual([1, 'FAIL - 1 violation(s):\n  - approver: empty\n']);
  });
});

describe('validate-scope and validate-result', () => {
  const scope = (changes: string, ...rest: string[]) =>
    run('validate-scope', '--manifest', 'manifest.json', '--changes', changes, '--profile', 'supervised-local/v1', ...rest);

  it('a diff inside the scope passes, in text form and in NUL form', () => {
    expect(scope('inside.txt').stdout()).toBe('OK - 1 changed path(s) within the approved scope\n');
    expect(scope('renamed.bin', '--nul').stdout()).toBe('OK - 2 changed path(s) within the approved scope\n');
  });

  it('each path outside the scope is one violation', () => {
    const { code, stdout } = scope('outside.txt');
    expect(code).toBe(1);
    expect(stdout().split('\n')).toEqual([
      'FAIL - 2 violation(s):',
      '  - src/playback/engine.ts: outside allowed_paths',
      '  - AGENTS.md: governance floor (the run cannot rewrite the contracts, policies, or gates that judge it - use the harness-hardening flow)',
      '',
    ]);
  });

  it('a policy file narrows the profile', () => {
    const { code } = run('validate-scope', '--manifest', 'manifest.json', '--changes', 'inside.txt', '--profile', 'overlay.json');
    expect(code).toBe(0);
  });

  it('a result that meets its terminal passes, and one that keeps its claim does not', () => {
    expect(run('validate-result', 'result.json').stdout()).toBe('OK - result satisfies the terminal contract\n');
    const bad = run('validate-result', 'bad-result.json');
    expect([bad.code, bad.stdout()]).toEqual([1,
      "FAIL - 1 violation(s):\n  - terminal NAMED_BLOCKER requires claim_state 'released' (got 'parked') - a claim outlives no terminal\n"]);
  });
});

describe('resolve-policy', () => {
  it('prints the effective policy and the hash that a bundle must carry', () => {
    const profile = run('resolve-policy', 'supervised-local/v1');
    expect(profile.code).toBe(0);
    expect(JSON.parse(profile.stdout())).toMatchObject({
      policy: { profile_id: 'supervised-local/v1', denied_path_patterns: [] }, policy_sha256: BUNDLE.policy_sha256 });

    const overlay = JSON.parse(run('resolve-policy', 'overlay.json').stdout()) as { policy: { denied_path_patterns: string[] }; policy_sha256: string };
    expect(overlay.policy.denied_path_patterns).toEqual(['src/circuit/secret/**']);
    expect(overlay.policy_sha256).toBe(hashJson(resolvePolicy(strictJsonLoads(FILES['overlay.json']))));
    expect(overlay.policy_sha256).not.toBe(BUNDLE.policy_sha256);
  });

  it('refuses an object that is not an issued policy', () => {
    const { code, err } = run('resolve-policy', 'doc.json');
    expect(code).toBe(1);
    expect(err.join('')).toContain('a policy object must name a known profile_id');
  });
});

describe('a wrong call exits 2, and a file that cannot be read exits 1', () => {
  it.each([
    [[], 'expected one of: canonicalize, build-approval, verify-approval, validate-scope, validate-result, resolve-policy'],
    [['explode'], 'expected one of:'],
    [['canonicalize'], 'canonicalize: expected 1 file argument(s)'],
    [['canonicalize', 'plan.md', '--loud'], 'canonicalize: unknown option --loud'],
    [['canonicalize', 'plan.md', '--kind'], 'canonicalize: --kind needs a value'],
    [['canonicalize', 'plan.md', '--kind', 'yaml'], 'canonicalize: --kind must be one of json, text'],
    [['build-approval', 'bundle.json'], 'build-approval: --policy is required'],
    [['validate-scope', 'extra', '--manifest', 'm', '--changes', 'c', '--profile', 'p'], 'validate-scope: expected 0 file argument(s)'],
    [['verify-approval', 'record.json', '--policy', 'supervised-local/v1'], 'verify-approval: --bundle is required'],
    [['verify-approval', 'record.json', '--bundle', 'bundle.json'], 'verify-approval: --policy is required'],
    [['validate-scope', '--changes', 'c', '--profile', 'p'], 'validate-scope: --manifest is required'],
    [['validate-scope', '--manifest', 'm', '--profile', 'p'], 'validate-scope: --changes is required'],
    [['validate-scope', '--manifest', 'm', '--changes', 'c'], 'validate-scope: --profile is required'],
    // A key that every object inherits is not a command, not an option and not a choice.
    [['toString', 'plan.md'], 'expected one of:'],
    [['constructor'], 'expected one of:'],
    [['canonicalize', 'plan.md', '--toString'], 'canonicalize: unknown option --toString'],
    [['build-approval', 'bundle.json', '--policy'], 'build-approval: --policy needs a value'],
  ])('%j', (argv, message) => {
    const { code, err } = run(...argv);
    expect(code).toBe(2);
    expect(err.join('')).toContain(message);
  });

  it('a file named as a key that every object inherits is a file', () => {
    const fake = fakeIo({ toString: FILES['plan.md'], constructor: FILES['plan.md'] });
    expect(main(['canonicalize', 'toString'], fake.io)).toBe(0);
    expect(main(['canonicalize', 'constructor', '--kind', 'text'], fake.io)).toBe(0);
    expect(fake.stdout()).toBe(`${hashText(FILES['plan.md'])}\n`.repeat(2));
  });

  it('a missing file is a failure of the input, not a crash', () => {
    const { code, err } = run('validate-result', 'missing.json');
    expect([code, err.join('')]).toEqual([1, 'FAIL - cannot read missing.json\n']);
  });

  it('an error that is not of the contract is not swallowed', () => {
    const io: Io = { read: () => { throw new TypeError('a bug'); }, out: () => undefined, err: () => undefined };
    expect(() => main(['validate-result', 'x.json'], io)).toThrow(TypeError);
  });
});

describe('realIo and the entrypoint', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spec-anchored-'));
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('reads UTF-8 with universal newlines, and keeps a BOM for the parser to refuse', () => {
    writeFileSync(path.join(dir, 'crlf.md'), 'one\r\ntwo\rthree\n');
    writeFileSync(path.join(dir, 'bom.json'), '﻿{}');
    expect(realIo().read(path.join(dir, 'crlf.md'))).toBe('one\ntwo\nthree\n');
    expect(realIo().read(path.join(dir, 'bom.json')).charCodeAt(0)).toBe(0xfeff);
  });

  it('refuses bytes that are not UTF-8, and a file that does not exist', () => {
    writeFileSync(path.join(dir, 'latin1.txt'), Buffer.from([0x61, 0xe9, 0x62]));
    expect(() => realIo().read(path.join(dir, 'latin1.txt'))).toThrow(/is not valid UTF-8$/);
    expect(() => realIo().read(path.join(dir, 'nope.txt'))).toThrow(/^cannot read /);
  });

  it('writes to the two standard streams', () => {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    realIo().out('to stdout');
    realIo().err('to stderr');
    expect(out).toHaveBeenCalledWith('to stdout');
    expect(err).toHaveBeenCalledWith('to stderr');
  });

  it('`-` is the standard input', async () => {
    vi.resetModules();
    const readFileSync = vi.fn(() => Buffer.from('from stdin\n'));
    vi.doMock('node:fs', () => ({ readFileSync }));
    const cli = await import('../cli.ts');
    expect(cli.realIo().read('-')).toBe('from stdin\n');
    expect(readFileSync).toHaveBeenCalledWith(0);
    vi.doUnmock('node:fs');
  });

  it('spec-anchored.ts runs the command and sets the exit code', async () => {
    writeFileSync(path.join(dir, 'result.json'), FILES['result.json']);
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const argv = process.argv;
    process.argv = ['node', 'spec-anchored.ts', 'validate-result', path.join(dir, 'result.json')];
    vi.resetModules();
    await import('../spec-anchored.ts');
    process.argv = argv;
    expect(out).toHaveBeenCalledWith('OK - result satisfies the terminal contract\n');
    expect(process.exitCode).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
