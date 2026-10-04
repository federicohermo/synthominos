import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rawBase, realScreenshotSystem, run, USAGE, type ScreenshotSystem } from '../screenshots.ts';

/**
 * The upload against a fake git for the usage and the failures, and against a fabricated repo
 * with a bare `origin` for the plumbing: only real git proves that a second run keeps the
 * files of the first.
 */

function fakeSystem(git: (args: readonly string[]) => string = () => '') {
  const out: string[] = [];
  const err: string[] = [];
  const sys: ScreenshotSystem = {
    git,
    isDir: target => target === path.resolve('shots'),
    files: () => [],
    withIndex: use => use('index'),
    out: line => void out.push(line),
    err: line => void err.push(line),
  };
  return { sys, out, err };
}

describe('rawBase', () => {
  it.each([
    ['git@github.com:owner/repo.git', 'https://raw.githubusercontent.com/owner/repo'],
    ['https://github.com/owner/repo', 'https://raw.githubusercontent.com/owner/repo'],
    ['https://github.com/owner/repo.git/', 'https://raw.githubusercontent.com/owner/repo'],
    ['D:\\repos\\origin.git', null],
  ])('%s → %s', (url, expected) => {
    expect(rawBase(url)).toBe(expected);
  });
});

describe('run', () => {
  it('rejects a bad usage with 2', () => {
    for (const args of [[], ['7'], ['seven', 'shots'], ['7', 'shots', 'extra']]) {
      const { sys, err } = fakeSystem();
      expect(run(args, sys)).toBe(2);
      expect(err).toEqual([USAGE]);
    }
  });

  it('rejects a folder that does not exist with 2', () => {
    const { sys, err } = fakeSystem();
    expect(run(['7', 'missing'], sys)).toBe(2);
    expect(err).toEqual([`not a folder: ${path.resolve('missing')}`]);
  });

  it('a failing git ends in 1 with its message', () => {
    const { sys, err } = fakeSystem(() => { throw new Error('Command failed: git ls-remote'); });
    expect(run(['7', 'shots'], sys)).toBe(1);
    expect(err).toEqual(['Command failed: git ls-remote']);
  });

  it('on a GitHub remote, prints the raw URL of the branch', () => {
    const answers: Record<string, string> = {
      'write-tree': 'tree1',
      'commit-tree': 'commit1',
      'ls-tree': 'a.png',
      'remote': 'git@github.com:owner/repo.git',
    };
    const { sys, out } = fakeSystem(args => answers[String(args[0])] ?? '');
    expect(run(['7', 'shots'], sys)).toBe(0);
    expect(out).toEqual(['a.png', 'pushed to screenshots/7: https://raw.githubusercontent.com/owner/repo/screenshots/7/<file>']);
  });
});

describe('realScreenshotSystem', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

  it('every run adds to the branch, and a file with the same path is replaced', () => {
    const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'shots-')));
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'config', 'user.email', 't@t');
    git(work, 'config', 'user.name', 't');
    git(work, 'config', 'commit.gpgsign', 'false');
    const first = path.join(root, 'first');
    mkdirSync(path.join(first, 'sub'), { recursive: true });
    writeFileSync(path.join(first, 'b.png'), 'old');
    writeFileSync(path.join(first, 'sub', 'a.png'), 'a');
    const second = path.join(root, 'second');
    mkdirSync(second);
    writeFileSync(path.join(second, 'b.png'), 'new');
    writeFileSync(path.join(second, 'c.png'), 'c');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const sys = realScreenshotSystem(work);
    expect(sys.files(first)).toEqual(['b.png', 'sub/a.png']);
    expect(run(['7', first, '--no-push'], sys)).toBe(0);
    expect(log).toHaveBeenLastCalledWith(expect.stringMatching(/^commit [0-9a-f]{40}, not pushed$/));
    expect(git(origin, 'branch', '--list')).toBe('');

    expect(run(['7', first], sys)).toBe(0);
    expect(log).toHaveBeenLastCalledWith('pushed to screenshots/7');
    expect(run(['7', second], sys)).toBe(0);
    expect(git(origin, 'ls-tree', '-r', '--name-only', 'screenshots/7').split('\n')).toEqual(['b.png', 'c.png', 'sub/a.png']);
    expect(git(origin, 'show', 'screenshots/7:b.png')).toBe('new');
    expect(git(origin, 'log', '--format=%s', 'screenshots/7').split('\n')).toEqual(['screenshots of #7', 'screenshots of #7']);
    log.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it('a failing git throws, isDir tells folders apart, and err writes to stderr', () => {
    const sys = realScreenshotSystem();
    expect(() => sys.git(['no-such-command'])).toThrow(/Command failed/);
    expect(sys.isDir(process.cwd())).toBe(true);
    expect(sys.isDir(path.join(process.cwd(), 'package.json'))).toBe(false);
    expect(sys.isDir(path.join(process.cwd(), 'no-such-folder'))).toBe(false);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sys.err('x');
    expect(error).toHaveBeenCalledWith('x');
    error.mockRestore();
  });
});

describe('screenshots-to-branch.ts', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../screenshots.ts');
    process.exitCode = undefined;
  });

  it('returns the exit code of the upload', async () => {
    vi.doMock('../screenshots.ts', () => ({ run: () => 2, realScreenshotSystem: () => ({}) }));
    await import('../screenshots-to-branch.ts');
    expect(process.exitCode).toBe(2);
  });
});
