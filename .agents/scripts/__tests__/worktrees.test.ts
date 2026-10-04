import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clean, isValidWorktreeTarget, processKillScript, realMachine, type Machine } from '../worktrees.ts';

/**
 * El limpiador contra una máquina FALSA, porque sus dos modos de falla —el `node_modules` que
 * deja la carpeta sin vaciar y el `.exe` vivo que no se deja borrar— son de Windows y la CI es
 * `ubuntu-latest`. La máquina real se prueba aparte, y el borrado sobre disco de verdad.
 */

const MAIN = 'D:\\repo';
const DIR = 'D:\\repo\\.claude\\worktrees';

interface FakeOptions {
  readonly common?: number;
  readonly dirty?: string;
  readonly survivesRemovals?: number;
  readonly windows?: boolean;
  readonly existing?: readonly string[];
}

/** Una máquina falsa que registra lo que le piden. */
function fakeMachine(o: FakeOptions = {}) {
  const log: string[] = [];
  const calls: string[] = [];
  const existing = new Set(o.existing ?? [DIR, `${DIR}\\a`]);
  let survives = o.survivesRemovals ?? 0;
  const m: Machine = {
    paths: path.win32,
    windows: o.windows ?? true,
    git(args) {
      calls.push(`git ${args.join(' ')}`);
      if (args[0] === 'rev-parse') return { code: o.common ?? 0, output: `${MAIN}\\.git\n` };
      if (args[0] === 'status') return { code: 0, output: o.dirty ?? '' };
      return { code: 0, output: '' };
    },
    exists: target => existing.has(target),
    realpath: target => (existing.has(target) ? target : null),
    killProcessesInside: target => [`   matando adentro de ${target}`],
    remove(target) {
      calls.push(`remove ${target}`);
      if (survives > 0) survives--;
      else existing.delete(target);
    },
    sleep: ms => calls.push(`sleep ${ms}`),
    log: line => log.push(line),
  };
  return { m, log, calls };
}

describe('isValidWorktreeTarget', () => {
  it.each([
    ['D:\\repo\\.claude\\worktrees\\x', true],
    ['d:\\REPO\\.claude\\Worktrees\\x', true],
    ['D:\\repo\\.claude\\worktrees', false],
    ['D:\\repo\\.claude\\worktrees\\x\\y', false],
    ['D:\\afuera', false],
  ])('%s → %s', (target, expected) => {
    expect(isValidWorktreeTarget(path.win32, MAIN, target)).toBe(expected);
  });
  it('en POSIX distingue mayúsculas', () => {
    expect(isValidWorktreeTarget(path.posix, '/repo', '/Repo/.claude/worktrees/x')).toBe(false);
  });
});

describe('clean', () => {
  it('sin argumentos, o con --todos, explica el uso y sale con 2', () => {
    for (const args of [[], ['--todos']]) {
      const { m, log } = fakeMachine();
      expect(clean(args, m)).toBe(2);
      expect(log[0]).toMatch(/^uso:/);
    }
  });

  it('fuera de un repo aborta', () => {
    const { m, log } = fakeMachine({ common: 1 });
    expect(clean([`${DIR}\\a`], m)).toBe(1);
    expect(log).toEqual(['ABORTADO: no es un repo git']);
  });

  it('el orden de Windows: desregistrar, matar, borrar, y después prune', () => {
    const { m, log, calls } = fakeMachine();
    expect(clean([`${DIR}\\a`], m)).toBe(0);
    expect(calls).toEqual([
      'git rev-parse --path-format=absolute --git-common-dir',
      'git status --porcelain',
      `git worktree unlock ${DIR}\\a`,
      `git worktree remove --force ${DIR}\\a`,
      `remove ${DIR}\\a`,
      'git worktree prune',
    ]);
    expect(log).toContain(`   matando adentro de ${DIR}\\a`);
    expect(log.at(-1)).toBe('   borrado');
  });

  it('en POSIX no mata procesos', () => {
    const { m, log } = fakeMachine({ windows: false });
    clean([`${DIR}\\a`], m);
    expect(log.some(l => l.includes('matando'))).toBe(false);
  });

  it('un handle que tarda en soltarse se reintenta una vez', () => {
    const { m, calls } = fakeMachine({ survivesRemovals: 1 });
    expect(clean([`${DIR}\\a`], m)).toBe(0);
    expect(calls).toContain('sleep 2000');
  });

  it('si sigue ahí después del reintento, lo dice y sale con 1', () => {
    const { m, log } = fakeMachine({ survivesRemovals: 2 });
    expect(clean([`${DIR}\\a`], m)).toBe(1);
    expect(log.at(-1)).toMatch(/SIGUE AHÍ/);
  });

  it('lo que no existe no es un error', () => {
    const { m, log } = fakeMachine();
    expect(clean([`${DIR}\\nada`], m)).toBe(0);
    expect(log).toContain('   no existe: nada que hacer');
  });

  it('fuera de .claude/worktrees, o anidado, lo rechaza', () => {
    const { m, log } = fakeMachine({ existing: [DIR, 'D:\\afuera', `${DIR}\\a\\b`] });
    expect(clean(['D:\\afuera', `${DIR}\\a\\b`], m)).toBe(1);
    expect(log.filter(l => l.includes('RECHAZADO'))).toHaveLength(2);
  });

  it('sin la carpeta de worktrees no hay nada que sea suyo', () => {
    const { m, log } = fakeMachine({ existing: [`${DIR}\\a`] });
    expect(clean([`${DIR}\\a`], m)).toBe(1);
    expect(log.some(l => l.includes('RECHAZADO'))).toBe(true);
  });

  it('con cambios sin commitear no lo toca', () => {
    const { m, calls } = fakeMachine({ dirty: ' M src/a.ts' });
    expect(clean([`${DIR}\\a`], m)).toBe(1);
    expect(calls.some(c => c.startsWith('remove'))).toBe(false);
  });
});

describe('processKillScript', () => {
  it('es ASCII, escapa la comilla y excluye su propio árbol de procesos', () => {
    const script = processKillScript("D:\\o'brien\\wt");
    expect(script).toMatch(/^[\x20-\x7e\n]*$/);
    expect(script).toContain("$a = 'D:\\o''brien\\wt'");
    expect(script).toContain('$mine -notcontains $_.ProcessId');
  });
});

describe('realMachine', () => {
  it('git devuelve el código y la salida, y 1 si el proceso falla', () => {
    const run = vi.fn((_: string, args: readonly string[]) => { if (args[0] === 'mal') throw new Error('x'); return 'ok'; });
    const m = realMachine('linux', run);
    expect(m.paths).toBe(path.posix);
    expect(m.git(['bien'], '.')).toEqual({ code: 0, output: 'ok' });
    expect(m.git(['mal'], '.')).toEqual({ code: 1, output: '' });
  });

  it('killProcessesInside devuelve una línea por proceso, y sigue si no hay PowerShell', () => {
    const m = realMachine('win32', () => '   matando PID 1 - a\r\n\r\n   matando PID 2 - b\r\n');
    expect(m.windows).toBe(true);
    expect(m.killProcessesInside('D:\\x')).toEqual(['   matando PID 1 - a', '   matando PID 2 - b']);
    const without = realMachine('win32', () => { throw new Error('sin powershell'); });
    expect(without.killProcessesInside('D:\\x')).toEqual(['   no se pudo listar procesos: sigo con el borrado']);
  });

  it('borra en disco real sin cruzar un enlace que apunta afuera: el centinela sobrevive', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'clean-'));
    const outside = path.join(root, 'afuera');
    const wt = path.join(root, 'wt');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'centinela'), 'vivo');
    mkdirSync(path.join(wt, 'node_modules'), { recursive: true });
    // En Windows `junction` no pide permisos de administrador; en POSIX el tipo se ignora.
    symlinkSync(outside, path.join(wt, 'node_modules', 'enlace'), 'junction');

    const m = realMachine(process.platform);
    expect(m.git(['--version'], root).output).toMatch(/^git version/);
    expect(m.realpath(path.join(root, 'no-existe'))).toBeNull();
    expect(m.realpath(wt)).not.toBeNull();
    m.remove(wt);
    expect(m.exists(wt)).toBe(false);
    expect(existsSync(path.join(outside, 'centinela'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('sleep espera y log escribe en consola', () => {
    const m = realMachine('linux');
    const start = Date.now();
    m.sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    m.log('hola');
    expect(out).toHaveBeenCalledWith('hola');
    out.mockRestore();
  });
});
