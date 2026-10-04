import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readInput, realGit, respond } from '../system.ts';

/**
 * El `Git` real contra un repo FABRICADO, con un worktree y un rebase a la mitad: son los dos
 * estados en que leer «la rama» de la forma ingenua da la respuesta equivocada.
 */

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
  it('su propio repo es el del hook, y se pregunta una sola vez', () => {
    const run = vi.fn((args: readonly string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8' }));
    const g = realGit(path.join(repo, 'src'), process.platform, run);
    expect(run).not.toHaveBeenCalled();
    expect(r(g.ownCheckout())).toBe(r(repo));
    expect(g.ownCheckout()).toBe(g.ownCheckout());
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('el árbol de una ruta que todavía no existe es el de su carpeta existente', () => {
    const g = realGit(repo);
    expect(r(g.treeOf(path.join(repo, 'src', 'nueva', 'x.ts')))).toBe(r(repo));
    expect(r(g.treeOf(path.join(repo, 'src', 'a.ts')))).toBe(r(repo));
  });

  it('el árbol de un worktree es el worktree, y su principal es el repo', () => {
    const wt = path.join(repo, '.claude', 'worktrees', 'wt');
    const g = realGit(repo);
    expect(r(g.treeOf(path.join(wt, 'src', 'a.ts')))).toBe(r(wt));
    expect(r(g.mainCheckoutOf(wt))).toBe(r(repo));
    expect(g.branchOf(wt)).toBe('feature/wt');
  });

  it('fuera de todo repo no hay árbol ni principal', () => {
    const g = realGit(repo);
    const loose = mkdtempSync(path.join(tmpdir(), 'loose-'));
    expect(g.treeOf(path.join(loose, 'x'))).toBeNull();
    expect(g.mainCheckoutOf(loose)).toBeNull();
    rmSync(loose, { recursive: true });
  });

  it('una ruta sin ninguna carpeta existente no tiene árbol', () => {
    // Un disco que no existe: subir hasta la raíz no encuentra nada, en cualquier plataforma.
    const g = realGit(repo, 'win32', () => '');
    expect(g.treeOf('Q:\\no\\existe\\en\\ningun\\lado')).toBeNull();
  });

  it('si git no puede ubicar el estado del rebase, no hay rama', () => {
    const g = realGit(repo, process.platform, args => { if (args[0] === 'symbolic-ref') return ''; throw new Error('sin git'); });
    expect(g.branchOf(repo)).toBeNull();
  });

  it('en un rebase a la mitad, la rama es la que se rebasa', () => {
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

  it('HEAD desprendido sin rebase no tiene rama', () => {
    git(repo, 'switch', '-q', '--detach', 'HEAD');
    expect(realGit(repo).branchOf(repo)).toBeNull();
    git(repo, 'switch', '-q', 'staging');
  });

  it('usa las rutas de la plataforma, no las de la máquina que corre el test', () => {
    expect(realGit(repo, 'win32', () => '').paths).toBe(path.win32);
    expect(realGit(repo, 'linux', () => '').paths).toBe(path.posix);
  });
});

describe('entrada y salida', () => {
  it('readInput lee el archivo entero', () => {
    const file = path.join(repo, 'input.json');
    writeFileSync(file, '{"a":1}');
    expect(readInput(file)).toBe('{"a":1}');
  });

  it('respond escribe sólo lo que hay', () => {
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
