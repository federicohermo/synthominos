import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readInput, realGit, realRunStore, respond } from '../system.ts';

let repo: string;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
const r = (p: string | null) => path.resolve(p ?? '');

beforeAll(() => {
  repo = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'system-')));
  git(repo, 'init', '-q', '-b', 'staging');
  git(repo, 'config', 'user.email', 't@t');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'commit.gpgsign', 'false');
  mkdirSync(path.join(repo, 'src'));
  writeFileSync(path.join(repo, 'src', 'a.ts'), 'uno\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'uno');
  git(repo, 'worktree', 'add', '-q', '-b', 'feature/wt', path.join(repo, '.claude', 'worktrees', 'wt'));
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('realGit', () => {
  it('its own repo is the hook\'s, and it is asked once', () => {
    const run = vi.fn((args: readonly string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8' }));
    const g = realGit(path.join(repo, 'src'), process.platform, run);
    expect(run).not.toHaveBeenCalled();
    expect(r(g.ownCheckout())).toBe(r(repo));
    expect(g.ownCheckout()).toBe(g.ownCheckout());
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('the tree of a path that does not exist yet is the tree of its existing folder', () => {
    const g = realGit(repo);
    expect(r(g.treeOf(path.join(repo, 'src', 'nueva', 'x.ts')))).toBe(r(repo));
    expect(r(g.treeOf(path.join(repo, 'src', 'a.ts')))).toBe(r(repo));
  });

  it('the tree of a worktree is the worktree, and its main checkout is the repo', () => {
    const wt = path.join(repo, '.claude', 'worktrees', 'wt');
    const g = realGit(repo);
    expect(r(g.treeOf(path.join(wt, 'src', 'a.ts')))).toBe(r(wt));
    expect(r(g.mainCheckoutOf(wt))).toBe(r(repo));
    expect(g.branchOf(wt)).toBe('feature/wt');
  });

  it('outside any repo there is no tree and no main checkout', () => {
    const g = realGit(repo);
    const loose = mkdtempSync(path.join(tmpdir(), 'loose-'));
    expect(g.treeOf(path.join(loose, 'x'))).toBeNull();
    expect(g.mainCheckoutOf(loose)).toBeNull();
    rmSync(loose, { recursive: true });
  });

  it('a path with no existing folder has no tree', () => {
    // A drive that does not exist: walking up to the root finds nothing, on any platform.
    const g = realGit(repo, 'win32', () => '');
    expect(g.treeOf('Q:\\no\\existe\\en\\ningun\\lado')).toBeNull();
  });

  it('if git cannot locate the rebase state, there is no branch', () => {
    const g = realGit(repo, process.platform, args => { if (args[0] === 'symbolic-ref') return ''; throw new Error('no git'); });
    expect(g.branchOf(repo)).toBeNull();
  });

  it('during a rebase, the branch is the one being rebased', () => {
    git(repo, 'switch', '-q', '-c', 'bugfix/choque');
    writeFileSync(path.join(repo, 'src', 'a.ts'), 'dos\n');
    git(repo, 'commit', '-q', '-am', 'dos');
    git(repo, 'switch', '-q', 'staging');
    writeFileSync(path.join(repo, 'src', 'a.ts'), 'tres\n');
    git(repo, 'commit', '-q', '-am', 'tres');
    git(repo, 'switch', '-q', 'bugfix/choque');
    expect(() => git(repo, 'rebase', 'staging')).toThrow();
    expect(realGit(repo).branchOf(repo)).toBe('bugfix/choque');
    git(repo, 'rebase', '--abort');
    git(repo, 'switch', '-q', 'staging');
  });

  it('a detached HEAD without a rebase has no branch', () => {
    git(repo, 'switch', '-q', '--detach', 'HEAD');
    expect(realGit(repo).branchOf(repo)).toBeNull();
    git(repo, 'switch', '-q', 'staging');
  });

  it('uses the platform paths, not those of the machine running the test', () => {
    expect(realGit(repo, 'win32', () => '').paths).toBe(path.win32);
    expect(realGit(repo, 'linux', () => '').paths).toBe(path.posix);
  });
});

describe('realRunStore', () => {
  it('lists a folder, reads a file, and answers empty and null for what is not there', () => {
    const store = realRunStore();
    expect(store.list(repo)).toContain('src');
    expect(store.list(path.join(repo, 'no-such-folder'))).toEqual([]);
    expect(store.read(path.join(repo, 'src', 'a.ts'))).toMatch(/\n$/);
    expect(store.read(path.join(repo, 'src', 'no-such-file.ts'))).toBeNull();
  });

  it('asks git for the NUL diff from the base to the branch, and answers null when git refuses', () => {
    const asked: (readonly string[])[] = [];
    const store = realRunStore((args, cwd) => { asked.push([...args, cwd]); return 'M\0src/a.ts\0'; });
    expect(store.diff(repo, 'abc', 'feature/x')).toBe('M\0src/a.ts\0');
    expect(asked).toEqual([['diff', '--name-status', '-z', '--find-renames', '--find-copies', 'abc..refs/heads/feature/x', repo]]);
    expect(realRunStore().diff(repo, 'no-such-ref-for-the-run-gate', 'feature/wt')).toBeNull();
  });

  it('diffs the branch, not the HEAD of the tree that opens the PR', () => {
    const wt = path.join(repo, '.claude', 'worktrees', 'wt');
    writeFileSync(path.join(wt, 'gate.txt'), 'x\n');
    git(wt, 'add', 'gate.txt');
    git(wt, 'commit', '-q', '-m', 'gate');
    expect(realRunStore().diff(repo, 'HEAD', 'feature/wt')).toMatch(/^A\0gate\.txt\0|\0A\0gate\.txt\0/);
    expect(realRunStore().diff(repo, 'HEAD', 'no-such-branch')).toBeNull();
  });
});

describe('input and output', () => {
  it('readInput reads the whole file', () => {
    const file = path.join(repo, 'input.json');
    writeFileSync(file, '{"a":1}');
    expect(readInput(file)).toBe('{"a":1}');
  });

  it('respond writes only what there is', () => {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    respond({ stdout: '', stderr: '' });
    expect(out).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    respond({ stdout: 'a', stderr: 'b' });
    expect(out).toHaveBeenCalledWith('a');
    expect(err).toHaveBeenCalledWith('b');
    out.mockRestore();
    err.mockRestore();
  });
});
