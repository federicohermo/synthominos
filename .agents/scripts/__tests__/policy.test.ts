import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { branchDenial, decide, isProtected, type Git, type Intent } from '../policy.ts';

const REPO = 'D:\\repo';

interface FakeTree { prefix: string; tree: string; main: string; branch: string | null }

function fakeGit(trees: readonly FakeTree[], own: string | null = REPO): Git {
  const of = (target: string) => trees.find(t => target.toLowerCase().startsWith(t.prefix.toLowerCase()));
  return {
    paths: path.win32,
    ownCheckout: () => own,
    treeOf: target => of(target)?.tree ?? null,
    mainCheckoutOf: dir => of(dir)?.main ?? null,
    branchOf: tree => of(tree)?.branch ?? null,
  };
}

const onBranch = (branch: string | null) => fakeGit([{ prefix: REPO, tree: REPO, main: REPO, branch }]);
const writes = (...paths: string[]): Intent => ({ writes: paths, worktrees: [] });

describe('isProtected: by resolved path, not by string', () => {
  it.each([
    ['D:\\repo\\src\\App.tsx', true],
    ['D:\\repo\\src', true],
    ['D:\\repo\\mcp-server\\src\\index.ts', true],
    ['D:\\repo\\src\\..\\docs\\x.md', false],
    ['D:\\repo\\..notas\\src', false],
    ['D:\\repo\\docs\\src.md', false],
    ['C:\\temp\\src\\x.ts', false],
  ])('%s → %s', (target, expected) => {
    expect(isProtected(path.win32, REPO, target)).toBe(expected);
  });
});

describe('branchDenial', () => {
  it.each(['staging', 'feature/x', 'bugfix/x', 'refactor/x', 'improvement/x'])('%s writes the product', branch => {
    expect(branchDenial(branch, 'src/x.ts')).toBeNull();
  });
  it('main says it changes through a promotion PR', () => {
    expect(branchDenial('main', 'src/x.ts')).toMatch(/promotion PR/);
  });
  it('any other branch names the branch, the path and the way out', () => {
    const reason = branchDenial('harness/x', 'src/x.ts');
    expect(reason).toMatch(/`harness\/x`.*`src\/x\.ts`/);
    expect(reason).toMatch(/hotfix:/);
  });
});

describe('decide: the branch rule', () => {
  it('without a src folder in the path it asks git nothing', () => {
    const git: Git = { ...onBranch('main'), treeOf: () => { throw new Error('must not be called'); } };
    expect(decide(writes('D:\\repo\\docs\\x.md'), git)).toEqual({ kind: 'no-opinion' });
  });
  it('a product branch passes silently', () => {
    expect(decide(writes('D:\\repo\\src\\x.ts'), onBranch('feature/x'))).toEqual({ kind: 'no-opinion' });
  });
  it('a branch without a prefix is denied', () => {
    expect(decide(writes('D:\\repo\\src\\x.ts'), onBranch('probe'))).toMatchObject({ kind: 'deny' });
  });
  it('a src folder that is not protected passes', () => {
    expect(decide(writes('D:\\repo\\docs\\src\\x.md'), onBranch('main'))).toEqual({ kind: 'no-opinion' });
  });
  it('no tree (outside any repo) passes', () => {
    expect(decide(writes('E:\\suelto\\src\\x.ts'), onBranch('main'))).toEqual({ kind: 'no-opinion' });
  });
  it('another repo passes: this gate has no opinion on it', () => {
    const git = fakeGit([{ prefix: 'E:\\otro', tree: 'E:\\otro', main: 'E:\\otro', branch: 'main' }]);
    expect(decide(writes('E:\\otro\\src\\x.ts'), git)).toEqual({ kind: 'no-opinion' });
  });
  it('a repo with an unreadable main checkout passes', () => {
    const git: Git = { ...onBranch('main'), mainCheckoutOf: () => null };
    expect(decide(writes('D:\\repo\\src\\x.ts'), git)).toEqual({ kind: 'no-opinion' });
  });
  it('if it does not know its own repo, it passes', () => {
    const git = fakeGit([{ prefix: REPO, tree: REPO, main: REPO, branch: 'main' }], null);
    expect(decide(writes('D:\\repo\\src\\x.ts'), git)).toEqual({ kind: 'no-opinion' });
  });
  it('a worktree of the repo is judged by ITS branch, not the main one', () => {
    const wt = 'D:\\repo\\.claude\\worktrees\\a';
    const git = fakeGit([
      { prefix: wt, tree: wt, main: REPO, branch: 'feature/a' },
      { prefix: REPO, tree: REPO, main: REPO, branch: 'main' },
    ]);
    expect(decide(writes(`${wt}\\src\\x.ts`), git)).toEqual({ kind: 'no-opinion' });
  });
  it('an unreadable branch warns and passes', () => {
    expect(decide(writes('D:\\repo\\src\\x.ts'), onBranch(null))).toMatchObject({ kind: 'warn' });
  });
  it('the first denial wins even after allowed writes', () => {
    expect(decide(writes('D:\\repo\\docs\\a.md', 'D:\\repo\\src\\x.ts'), onBranch('probe'))).toMatchObject({ kind: 'deny' });
  });
});

describe('decide: the worktree rule', () => {
  const opens = (gitDir: string, target: string): Intent => ({ writes: [], worktrees: [{ gitDir, target }] });

  it('a direct child of .claude/worktrees passes, in any case', () => {
    expect(decide(opens(REPO, 'd:\\REPO\\.claude\\worktrees\\x'), onBranch('staging'))).toEqual({ kind: 'no-opinion' });
  });
  it('next to the repo is denied and names the folder', () => {
    expect(decide(opens(REPO, 'D:\\afuera'), onBranch('staging'))).toMatchObject({ kind: 'deny', reason: expect.stringMatching(/worktrees/) as string });
  });
  it('nested in another worktree is denied', () => {
    expect(decide(opens(REPO, 'D:\\repo\\.claude\\worktrees\\a\\.claude\\worktrees\\b'), onBranch('staging'))).toMatchObject({ kind: 'deny' });
  });
  it('a worktree of another repo passes', () => {
    expect(decide(opens('E:\\otro', 'E:\\cualquiera'), onBranch('staging'))).toEqual({ kind: 'no-opinion' });
  });
});

describe('decide: a failing rule does not switch off the other', () => {
  it('the error becomes a warning and the other rule\'s denial still wins', () => {
    const git: Git = { ...onBranch('probe'), mainCheckoutOf: dir => { if (dir === 'X:\\roto') throw new Error('boom'); return REPO; } };
    const intent: Intent = { writes: ['D:\\repo\\src\\x.ts'], worktrees: [{ gitDir: 'X:\\roto', target: 'X:\\y' }] };
    expect(decide(intent, git)).toMatchObject({ kind: 'deny' });
  });
  it('without a denial, the error is warned', () => {
    const git: Git = { ...onBranch('staging'), mainCheckoutOf: () => { throw new Error('boom'); } };
    const intent: Intent = { writes: [], worktrees: [{ gitDir: REPO, target: 'D:\\y' }] };
    expect(decide(intent, git)).toEqual({ kind: 'warn', reason: 'worktree gate could not run and let the call through: Error: boom' });
  });
});

describe('on POSIX', () => {
  it('the comparison is case sensitive', () => {
    const git: Git = { paths: path.posix, ownCheckout: () => '/repo', treeOf: () => '/repo', mainCheckoutOf: () => '/Repo', branchOf: () => 'main' };
    expect(decide(writes('/repo/src/x.ts'), git)).toEqual({ kind: 'no-opinion' });
  });
});
