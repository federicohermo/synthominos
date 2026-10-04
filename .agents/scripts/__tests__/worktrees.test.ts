import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clean, isValidWorktreeTarget, processKillScript, realMachine, type Machine } from '../worktrees.ts';

/**
 * The cleaner against a FAKE machine: its two failure modes (the ignored `node_modules` and the
 * live `.exe`) are Windows-only, and CI runs `ubuntu-latest`. The real machine is tested
 * separately, with a real delete on disk.
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

/** A fake machine that records what it is asked. */
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
    killProcessesInside: target => [`   killing inside ${target}`],
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
  it('on POSIX it is case sensitive', () => {
    expect(isValidWorktreeTarget(path.posix, '/repo', '/Repo/.claude/worktrees/x')).toBe(false);
  });
});

describe('clean', () => {
  it('without arguments, or with --todos, it prints the usage and exits with 2', () => {
    for (const args of [[], ['--todos']]) {
      const { m, log } = fakeMachine();
      expect(clean(args, m)).toBe(2);
      expect(log[0]).toMatch(/^usage:/);
    }
  });

  it('outside a repo it aborts', () => {
    const { m, log } = fakeMachine({ common: 1 });
    expect(clean([`${DIR}\\a`], m)).toBe(1);
    expect(log).toEqual(['ABORTED: not a git repo']);
  });

  it('the Windows order: unregister, kill, delete, then prune', () => {
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
    expect(log).toContain(`   killing inside ${DIR}\\a`);
    expect(log.at(-1)).toBe('   removed');
  });

  it('on POSIX it kills no process', () => {
    const { m, log } = fakeMachine({ windows: false });
    clean([`${DIR}\\a`], m);
    expect(log.some(l => l.includes('killing'))).toBe(false);
  });

  it('a slow handle release is retried once', () => {
    const { m, calls } = fakeMachine({ survivesRemovals: 1 });
    expect(clean([`${DIR}\\a`], m)).toBe(0);
    expect(calls).toContain('sleep 2000');
  });

  it('if it is still there after the retry, it says so and exits with 1', () => {
    const { m, log } = fakeMachine({ survivesRemovals: 2 });
    expect(clean([`${DIR}\\a`], m)).toBe(1);
    expect(log.at(-1)).toMatch(/STILL THERE/);
  });

  it('a missing path is not an error', () => {
    const { m, log } = fakeMachine();
    expect(clean([`${DIR}\\nada`], m)).toBe(0);
    expect(log).toContain('   does not exist: nothing to do');
  });

  it('outside .claude/worktrees, or nested, it is rejected', () => {
    const { m, log } = fakeMachine({ existing: [DIR, 'D:\\afuera', `${DIR}\\a\\b`] });
    expect(clean(['D:\\afuera', `${DIR}\\a\\b`], m)).toBe(1);
    expect(log.filter(l => l.includes('REJECTED'))).toHaveLength(2);
  });

  it('without the worktrees folder nothing is its own', () => {
    const { m, log } = fakeMachine({ existing: [`${DIR}\\a`] });
    expect(clean([`${DIR}\\a`], m)).toBe(1);
    expect(log.some(l => l.includes('REJECTED'))).toBe(true);
  });

  it('with uncommitted changes it does not touch it', () => {
    const { m, calls } = fakeMachine({ dirty: ' M src/a.ts' });
    expect(clean([`${DIR}\\a`], m)).toBe(1);
    expect(calls.some(c => c.startsWith('remove'))).toBe(false);
  });
});

describe('processKillScript', () => {
  it('is ASCII, escapes the quote and excludes its own process tree', () => {
    const script = processKillScript("D:\\o'brien\\wt");
    expect(script).toMatch(/^[\x20-\x7e\n]*$/);
    expect(script).toContain("$a = 'D:\\o''brien\\wt'");
    expect(script).toContain('$mine -notcontains $_.ProcessId');
  });
});

describe('realMachine', () => {
  it('git returns the code and the output, and 1 if the process fails', () => {
    const run = vi.fn((_: string, args: readonly string[]) => { if (args[0] === 'mal') throw new Error('x'); return 'ok'; });
    const m = realMachine('linux', run);
    expect(m.paths).toBe(path.posix);
    expect(m.git(['bien'], '.')).toEqual({ code: 0, output: 'ok' });
    expect(m.git(['mal'], '.')).toEqual({ code: 1, output: '' });
  });

  it('killProcessesInside returns one line per process, and continues without PowerShell', () => {
    const m = realMachine('win32', () => '   killing PID 1 - a\r\n\r\n   killing PID 2 - b\r\n');
    expect(m.windows).toBe(true);
    expect(m.killProcessesInside('D:\\x')).toEqual(['   killing PID 1 - a', '   killing PID 2 - b']);
    const without = realMachine('win32', () => { throw new Error('no powershell'); });
    expect(without.killProcessesInside('D:\\x')).toEqual(['   could not list processes: continuing with the delete']);
  });

  it('deletes on real disk without crossing a link that points outside: the sentinel survives', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'clean-'));
    const outside = path.join(root, 'outside');
    const wt = path.join(root, 'wt');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'sentinel'), 'alive');
    mkdirSync(path.join(wt, 'node_modules'), { recursive: true });
    // On Windows `junction` needs no admin rights; on POSIX the type is ignored.
    symlinkSync(outside, path.join(wt, 'node_modules', 'link'), 'junction');

    const m = realMachine(process.platform);
    expect(m.git(['--version'], root).output).toMatch(/^git version/);
    expect(m.realpath(path.join(root, 'missing'))).toBeNull();
    expect(m.realpath(wt)).not.toBeNull();
    m.remove(wt);
    expect(m.exists(wt)).toBe(false);
    expect(existsSync(path.join(outside, 'sentinel'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('sleep waits and log writes to the console', () => {
    const m = realMachine('linux');
    const start = Date.now();
    m.sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    m.log('hello');
    expect(out).toHaveBeenCalledWith('hello');
    out.mockRestore();
  });
});
