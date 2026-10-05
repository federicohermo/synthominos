import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addedLines, numericClaims, prDiff, realDiffSystem, USAGE, type DiffSystem, type GitResult } from '../diff.ts';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -0,0 +1,8 @@',
  '+// the cell measures 73 px',
  '+export function f(): void {',
  "+  if (x) throw new Error('a'); else y();",
  '+}',
  '+export interface I {}',
  '+  } catch {',
  '+ * see AC-BRD-004, BR-<COD>-001 and #12',
  '+ * 1. path.win32 and utf8',
  '-// a removed line with 9 does not count',
  'diff --git a/docs/x.md b/docs/x.md',
  '+++ b/docs/x.md',
  '+The board is 26 by 15.',
  '+1. Step 3 of spec 009',
  '+| --- | :-: |',
  '+## 2. Heading',
  '',
].join('\n');

interface FakeOptions {
  readonly fetch?: number;
  readonly refs?: readonly string[];
  readonly mergeBase?: GitResult;
  readonly diff?: string;
  readonly files?: readonly string[];
}

function fakeSystem(o: FakeOptions = {}) {
  const refs = o.refs ?? ['origin/staging', 'HEAD'];
  const written = new Map<string, string>();
  const out: string[] = [];
  const err: string[] = [];
  const calls: string[][] = [];
  const ok = (stdout: string): GitResult => ({ code: 0, stdout, stderr: '' });
  const sys: DiffSystem = {
    git(args) {
      calls.push([...args]);
      if (args[0] === 'fetch') return { code: o.fetch ?? 0, stdout: '', stderr: '' };
      if (args[0] === 'rev-parse') return { code: refs.includes(String(args[3])) ? 0 : 1, stdout: '', stderr: '' };
      if (args[0] === 'merge-base') return o.mergeBase ?? ok('abc123\n');
      if (args.includes('--name-only')) return ok((o.files ?? ['src/a.ts', 'docs/x.md']).join('\n') + '\n');
      if (args.includes('--stat')) return ok(' 2 files changed\n');
      return ok(o.diff ?? DIFF);
    },
    write: (file, text) => void written.set(file, text),
    out: line => void out.push(line),
    err: line => void err.push(line),
  };
  return { sys, written, out, err, calls };
}

describe('addedLines and numericClaims', () => {
  it('each added line travels with its file, and only claims keep a digit', () => {
    const added = addedLines(DIFF);
    expect(added[0]).toEqual({ file: 'src/a.ts', body: '// the cell measures 73 px' });
    expect(added).toHaveLength(12);
    expect(numericClaims(added)).toEqual(['src/a.ts: // the cell measures 73 px', 'docs/x.md: The board is 26 by 15.']);
  });

  it('a claim is cut at 150 characters', () => {
    const [claim] = numericClaims([{ file: 'a.md', body: `${'x'.repeat(200)} 7` }]);
    expect(claim).toBe(`a.md: ${'x'.repeat(150)}`);
  });
});

describe('prDiff', () => {
  it('without a base and an out dir, explains the usage and exits 2', () => {
    const { sys, err } = fakeSystem();
    expect(prDiff(['staging'], sys)).toBe(2);
    expect(err).toEqual([USAGE]);
  });

  it('writes the six files and measures the axes against origin/<base>', () => {
    const { sys, written, out, err, calls } = fakeSystem();
    expect(prDiff(['staging', 'out'], sys)).toBe(0);
    expect(err).toEqual([]);
    expect([...written.keys()]).toEqual(['pr.diff', 'pr.stat', 'pr.files', 'pr.code', 'pr.docs', 'pr.specs'].map(n => path.join('out', n)));
    expect(written.get(path.join('out', 'pr.code'))).toBe('src/a.ts\n');
    expect(written.get(path.join('out', 'pr.specs'))).toBe('');
    expect(calls).toContainEqual(['diff', 'abc123..HEAD', '--', '.', ':(exclude)*pnpm-lock.yaml', ':(exclude)dist/*', ':(exclude)coverage/*']);
    expect(out).toEqual(expect.arrayContaining([
      'base_ref=origin/staging',
      'head_ref=HEAD',
      'merge_base=abc123',
      `pr_specs_path=${path.join('out', 'pr.specs')}`,
      'diff_lines=19',
      'files_changed=2',
      'code_files=1',
      'doc_files=1',
      'spec_files=0',
      'diff_size=ok',
      'error handling          : YES  (3, threshold 3)',
      'signatures and types    : YES  (2, threshold 2)',
      'prose (docs+comments)   : YES  (3 comments, 1 .md/.txt)',
      'contracts               : no  (0 specs/<cap>/<cap>.md)',
      'docs/x.md: The board is 26 by 15.',
      ' 2 files changed',
    ]));
  });

  it('lists the capability contracts, and not the template', () => {
    const files = ['specs/board/board.md', 'specs/_template/_template.md', 'specs/board/notes.md'];
    const head = fakeSystem({ files, diff: '', refs: ['origin/staging', 'feature/x'] });
    expect(prDiff(['staging', 'out', 'feature/x'], head.sys)).toBe(0);
    expect(head.written.get(path.join('out', 'pr.specs'))).toBe('specs/board/board.md\n');
    expect(head.out).toEqual(expect.arrayContaining([
      'head_ref=feature/x',
      'diff_lines=0',
      'contracts               : YES  (1 specs/<cap>/<cap>.md)',
      '  specs/board/board.md',
      'error handling          : no  (0, threshold 3)',
      'prose (docs+comments)   : YES  (0 comments, 3 .md/.txt)',
    ]));
    expect(head.out.filter(line => line === '  (none)')).toHaveLength(1);
  });

  it('without docs nor comments the prose axis is off', () => {
    const { sys, out } = fakeSystem({ files: ['src/a.ts'], diff: '+++ b/src/a.ts\n+const a = 1;\n' });
    expect(prDiff(['staging', 'out'], sys)).toBe(0);
    expect(out).toContain('prose (docs+comments)   : no  (0 comments, 0 .md/.txt)');
  });

  it('a failed fetch warns and falls back to the local base', () => {
    const { sys, out, err } = fakeSystem({ fetch: 1, refs: ['staging', 'HEAD'] });
    expect(prDiff(['staging', 'out'], sys)).toBe(0);
    expect(err).toEqual(['WARN: `git fetch` failed; using the local state']);
    expect(out).toContain('base_ref=staging');
  });

  it('aborts with 1 when the base, the head or the merge base is missing', () => {
    const noBase = fakeSystem({ refs: ['HEAD'] });
    expect(prDiff(['nope', 'out'], noBase.sys)).toBe(1);
    expect(noBase.err).toEqual(['ABORT: neither `nope` nor `origin/nope` exists']);
    const noHead = fakeSystem({ refs: ['origin/staging'] });
    expect(prDiff(['staging', 'out'], noHead.sys)).toBe(1);
    expect(noHead.err).toEqual(['ABORT: head `HEAD` does not exist']);
    const noMergeBase = fakeSystem({ mergeBase: { code: 1, stdout: '', stderr: 'fatal: no merge base\n' } });
    expect(prDiff(['staging', 'out'], noMergeBase.sys)).toBe(1);
    expect(noMergeBase.err).toEqual(['ABORT: git merge-base origin/staging HEAD -> fatal: no merge base']);
  });

  it('a large diff warns, and the claims stop at sixty', () => {
    const body = Array.from({ length: 1600 }, (_, i) => `+line ${i}`).join('\n');
    const { sys, out, err } = fakeSystem({ diff: `+++ b/docs/big.md\n${body}\n` });
    expect(prDiff(['staging', 'out'], sys)).toBe(0);
    expect(out).toContain('diff_size=large');
    expect(err).toEqual(['WARN: > 1500 lines. Do NOT read it whole: triage from the stat.']);
    expect(out.filter(line => line.startsWith('docs/big.md: '))).toHaveLength(60);
    expect(out).toContain('  ... and 1540 more (grep the rest yourself)');
  });
});

describe('realDiffSystem', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  const configure = (cwd: string) => {
    git(cwd, 'config', 'user.email', 't@t');
    git(cwd, 'config', 'user.name', 't');
    git(cwd, 'config', 'commit.gpgsign', 'false');
  };

  it('measures a real PR against origin/<base>, without the lockfile', () => {
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'pr-diff-')));
    const origin = path.join(root, 'origin');
    const work = path.join(root, 'work');
    mkdirSync(origin);
    git(origin, 'init', '-q', '-b', 'staging');
    configure(origin);
    writeFileSync(path.join(origin, 'README.md'), 'one\n');
    git(origin, 'add', '.');
    git(origin, 'commit', '-q', '-m', 'one');
    git(root, 'clone', '-q', origin, work);
    configure(work);
    git(work, 'switch', '-q', '-c', 'feature/x');
    mkdirSync(path.join(work, 'specs', 'board'), { recursive: true });
    writeFileSync(path.join(work, 'specs', 'board', 'board.md'), '# Board\n\nThe board has 26 columns.\n');
    writeFileSync(path.join(work, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'two');

    const out = path.join(root, 'out', 'nested');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(prDiff(['staging', out], realDiffSystem(work))).toBe(0);
    expect(readFileSync(path.join(out, 'pr.files'), 'utf8')).toBe('specs/board/board.md\n');
    expect(log).toHaveBeenCalledWith('base_ref=origin/staging');
    expect(log).toHaveBeenCalledWith('specs/board/board.md: The board has 26 columns.');
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it('git reports a failure as code 1, the default cwd is the process cwd, and err writes to stderr', () => {
    const sys = realDiffSystem();
    expect(sys.git(['--version']).stdout).toMatch(/^git version/);
    expect(sys.git(['no-such-command']).code).toBe(1);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sys.err('x');
    expect(error).toHaveBeenCalledWith('x');
    error.mockRestore();
  });
});

describe('pr-diff.ts', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../diff.ts');
    process.exitCode = undefined;
  });

  it('returns the exit code of the measurement', async () => {
    vi.doMock('../diff.ts', () => ({ prDiff: () => 2, realDiffSystem: () => ({}) }));
    await import('../pr-diff.ts');
    expect(process.exitCode).toBe(2);
  });
});
