import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { branchDenial, decide, isProtected, type Git, type Intent } from '../policy.ts';

/**
 * El núcleo de los hooks, contra un `Git` falso: las ramas y los repos se declaran en una tabla
 * en vez de fabricarse, y el caso de dos discos de Windows corre igual en el `ubuntu-latest` de
 * la CI porque las rutas son `path.win32`.
 */

const REPO = 'D:\\repo';

interface FakeTree { prefix: string; tree: string; main: string; branch: string | null }

/** Un `Git` falso: cada ruta cae en el primer árbol cuyo prefijo la contiene. */
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

describe('isProtected: por ruta resuelta, no por el string', () => {
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
  it.each(['staging', 'feature/x', 'bugfix/x', 'refactor/x', 'improvement/x'])('%s escribe el producto', branch => {
    expect(branchDenial(branch, 'src/x.ts')).toBeNull();
  });
  it('main dice que se promueve por PR', () => {
    expect(branchDenial('main', 'src/x.ts')).toMatch(/PR de promoción/);
  });
  it('cualquier otra nombra la rama, la ruta y cómo salir', () => {
    const reason = branchDenial('harness/x', 'src/x.ts');
    expect(reason).toMatch(/`harness\/x`.*`src\/x\.ts`/);
    expect(reason).toMatch(/hotfix:/);
  });
});

describe('decide: la regla de rama', () => {
  it('sin una carpeta src en el camino no le pregunta nada a git', () => {
    const git: Git = { ...onBranch('main'), treeOf: () => { throw new Error('no debía consultarse'); } };
    expect(decide(writes('D:\\repo\\docs\\x.md'), git)).toEqual({ kind: 'no-opinion' });
  });
  it('desde una rama del producto pasa callado', () => {
    expect(decide(writes('D:\\repo\\src\\x.ts'), onBranch('feature/x'))).toEqual({ kind: 'no-opinion' });
  });
  it('desde una rama sin prefijo deniega', () => {
    expect(decide(writes('D:\\repo\\src\\x.ts'), onBranch('probe'))).toMatchObject({ kind: 'deny' });
  });
  it('una carpeta src que no es una protegida pasa', () => {
    expect(decide(writes('D:\\repo\\docs\\src\\x.md'), onBranch('main'))).toEqual({ kind: 'no-opinion' });
  });
  it('sin árbol (fuera de todo repo) pasa', () => {
    expect(decide(writes('E:\\suelto\\src\\x.ts'), onBranch('main'))).toEqual({ kind: 'no-opinion' });
  });
  it('otro repo pasa: este gate no tiene opinión sobre él', () => {
    const git = fakeGit([{ prefix: 'E:\\otro', tree: 'E:\\otro', main: 'E:\\otro', branch: 'main' }]);
    expect(decide(writes('E:\\otro\\src\\x.ts'), git)).toEqual({ kind: 'no-opinion' });
  });
  it('un repo sin principal legible pasa', () => {
    const git: Git = { ...onBranch('main'), mainCheckoutOf: () => null };
    expect(decide(writes('D:\\repo\\src\\x.ts'), git)).toEqual({ kind: 'no-opinion' });
  });
  it('si no sabe cuál es su propio repo, pasa', () => {
    const git = fakeGit([{ prefix: REPO, tree: REPO, main: REPO, branch: 'main' }], null);
    expect(decide(writes('D:\\repo\\src\\x.ts'), git)).toEqual({ kind: 'no-opinion' });
  });
  it('un worktree del repo se juzga por SU rama, no por la del principal', () => {
    const wt = 'D:\\repo\\.claude\\worktrees\\a';
    const git = fakeGit([
      { prefix: wt, tree: wt, main: REPO, branch: 'feature/a' },
      { prefix: REPO, tree: REPO, main: REPO, branch: 'main' },
    ]);
    expect(decide(writes(`${wt}\\src\\x.ts`), git)).toEqual({ kind: 'no-opinion' });
  });
  it('sin rama legible avisa y deja pasar', () => {
    expect(decide(writes('D:\\repo\\src\\x.ts'), onBranch(null))).toMatchObject({ kind: 'warn' });
  });
  it('el primer rechazo gana aunque haya escrituras permitidas antes', () => {
    expect(decide(writes('D:\\repo\\docs\\a.md', 'D:\\repo\\src\\x.ts'), onBranch('probe'))).toMatchObject({ kind: 'deny' });
  });
});

describe('decide: la regla de worktrees', () => {
  const opens = (gitDir: string, target: string): Intent => ({ writes: [], worktrees: [{ gitDir, target }] });

  it('un hijo directo de .claude/worktrees pasa, con cualquier mayúscula', () => {
    expect(decide(opens(REPO, 'd:\\REPO\\.claude\\worktrees\\x'), onBranch('staging'))).toEqual({ kind: 'no-opinion' });
  });
  it('al lado del repo deniega y nombra la carpeta', () => {
    expect(decide(opens(REPO, 'D:\\afuera'), onBranch('staging'))).toMatchObject({ kind: 'deny', reason: expect.stringMatching(/worktrees/) as string });
  });
  it('anidado en otro worktree deniega', () => {
    expect(decide(opens(REPO, 'D:\\repo\\.claude\\worktrees\\a\\.claude\\worktrees\\b'), onBranch('staging'))).toMatchObject({ kind: 'deny' });
  });
  it('un worktree de otro repo pasa', () => {
    expect(decide(opens('E:\\otro', 'E:\\cualquiera'), onBranch('staging'))).toEqual({ kind: 'no-opinion' });
  });
});

describe('decide: una regla que se cae no apaga a la otra', () => {
  it('el error se vuelve aviso y el rechazo de la otra regla igual gana', () => {
    const git: Git = { ...onBranch('probe'), mainCheckoutOf: dir => { if (dir === 'X:\\roto') throw new Error('boom'); return REPO; } };
    const intent: Intent = { writes: ['D:\\repo\\src\\x.ts'], worktrees: [{ gitDir: 'X:\\roto', target: 'X:\\y' }] };
    expect(decide(intent, git)).toMatchObject({ kind: 'deny' });
  });
  it('sin rechazo, el error se avisa', () => {
    const git: Git = { ...onBranch('staging'), mainCheckoutOf: () => { throw new Error('boom'); } };
    const intent: Intent = { writes: [], worktrees: [{ gitDir: REPO, target: 'D:\\y' }] };
    expect(decide(intent, git)).toEqual({ kind: 'warn', reason: 'gate de worktrees no pudo correr y dejó pasar: Error: boom' });
  });
});

describe('en POSIX', () => {
  it('la comparación distingue mayúsculas', () => {
    const git: Git = { paths: path.posix, ownCheckout: () => '/repo', treeOf: () => '/repo', mainCheckoutOf: () => '/Repo', branchOf: () => 'main' };
    expect(decide(writes('/repo/src/x.ts'), git)).toEqual({ kind: 'no-opinion' });
  });
});
