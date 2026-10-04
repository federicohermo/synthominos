import type { PlatformPath } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Where this repo's worktrees live, and how they are removed.
 *
 * The hook (where a worktree OPENS) and the cleaner (where it is REMOVED) both import this
 * module, so the folder exists once. In the repo this harness comes from, a cleaner that took
 * every registered worktree deleted one open next to the repo, with uncommitted work in it.
 *
 * Worktrees of other owners are not touched. The Codex app opens its own in
 * `~/.codex/worktrees/` and cleans them itself. That is why the cleaner has no `--todos`.
 *
 * This file imports only `node:*`: skills carry a byte-for-byte copy of it.
 */

/** The folder, relative to the main checkout. A worktree is a DIRECT child of it. */
export const WORKTREES_DIR = ['.claude', 'worktrees'] as const;

/** Compares paths the way the OS does: Windows ignores case. */
function key(paths: PlatformPath, target: string): string {
  const normal = paths.resolve(target);
  return paths.sep === '\\' ? normal.toLowerCase() : normal;
}

/**
 * Whether `target` is a valid place for a worktree of the repo whose main checkout is
 * `mainCheckout`: a direct child of `<mainCheckout>/.claude/worktrees/`.
 *
 * Direct, not nested: a worktree opened inside another one is removed with its parent.
 */
export function isValidWorktreeTarget(paths: PlatformPath, mainCheckout: string, target: string): boolean {
  const dir = paths.join(mainCheckout, ...WORKTREES_DIR);
  return key(paths, paths.dirname(paths.resolve(target))) === key(paths, dir);
}

/** What the cleaner needs from the machine. Real in `realMachine`, fake in tests. */
export interface Machine {
  readonly paths: PlatformPath;
  readonly windows: boolean;
  git(args: readonly string[], cwd: string): { readonly code: number; readonly output: string };
  exists(target: string): boolean;
  /** `null` if the path does not exist. Resolves junctions and links, so they cannot lead outside. */
  realpath(target: string): string | null;
  /** Kills what runs inside `target` and returns one line per process. Windows only. */
  killProcessesInside(target: string): readonly string[];
  /** Recursive, and does NOT follow links or junctions: it unlinks them. */
  remove(target: string): void;
  sleep(ms: number): void;
  log(line: string): void;
}

const USAGE = 'usage: node .agents/scripts/clean-worktrees.ts <worktree-path> [<path> ...]';

/**
 * Removes the named worktrees. Windows has two failure modes, both measured:
 *
 * 1. `node_modules` is ignored, so `git worktree remove` leaves a non-empty folder and fails.
 *    Git still unregisters the worktree.
 * 2. A live process inside holds a handle. A running `.exe` from the worktree's `node_modules`
 *    is found only by its `ExecutablePath`.
 *
 * So the order is: unregister, kill what runs inside, then delete.
 * Returns the exit code: 0 all removed, 1 something stayed, 2 bad invocation.
 */
export function clean(args: readonly string[], m: Machine): 0 | 1 | 2 {
  if (args.length === 0 || args.includes('--todos')) {
    m.log(USAGE);
    return 2;
  }
  const common = m.git(['rev-parse', '--path-format=absolute', '--git-common-dir'], '.');
  if (common.code !== 0) {
    m.log('ABORTED: not a git repo');
    return 1;
  }
  const mainCheckout = m.paths.dirname(common.output.trim());
  const dir = m.realpath(m.paths.join(mainCheckout, ...WORKTREES_DIR));
  let failed: 0 | 1 = 0;

  for (const target of args) {
    m.log(`== ${target}`);
    const real = m.realpath(target);
    if (real === null) {
      m.log('   does not exist: nothing to do');
      continue;
    }
    // Compare the RESOLVED path: a junction inside `.claude/worktrees/` that points outside is rejected.
    if (dir === null || key(m.paths, m.paths.dirname(real)) !== key(m.paths, dir)) {
      m.log(`   REJECTED: not a direct child of ${WORKTREES_DIR.join('/')}/`);
      failed = 1;
      continue;
    }
    const status = m.git(['status', '--porcelain'], real);
    if (status.code !== 0 || status.output.trim() !== '') {
      m.log('   SKIPPED: it has uncommitted changes, or git could not read it');
      failed = 1;
      continue;
    }
    m.git(['worktree', 'unlock', real], mainCheckout);
    // Expected to fail on the final delete (mode 1). What matters is that it unregisters.
    m.git(['worktree', 'remove', '--force', real], mainCheckout);
    if (m.windows) for (const line of m.killProcessesInside(real)) m.log(line);
    m.remove(real);
    if (m.exists(real)) {
      // Windows is slow to release the handle of a just-killed `.exe`. A second failure is not timing.
      m.sleep(2000);
      m.remove(real);
    }
    if (m.exists(real)) {
      m.log('   STILL THERE: something holds an open handle. Close it and run this again.');
      failed = 1;
    } else {
      m.log('   removed');
    }
  }

  m.git(['worktree', 'prune'], mainCheckout);
  return failed;
}

/**
 * The PowerShell that kills what runs inside `target`. ASCII only: the string crosses to
 * `powershell.exe` through the console code page.
 *
 * It matches the PATH, never the process name, and it excludes its own process tree, whose
 * command line also contains the path.
 */
export function processKillScript(target: string): string {
  const literal = target.replaceAll("'", "''");
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    `$a = '${literal}'`,
    "$pats = @($a, $a.Replace('/','\\'))",
    '$all = Get-CimInstance Win32_Process',
    '$mine = @(); $p = $PID',
    'while ($p -and ($mine -notcontains $p)) { $mine += $p; $pr = $all | Where-Object { $_.ProcessId -eq $p }; if (-not $pr) { break }; $p = $pr.ParentProcessId }',
    "$all | Where-Object { $mine -notcontains $_.ProcessId } | Where-Object { $c = $_.CommandLine; $e = $_.ExecutablePath; ($c -and ($pats | Where-Object { $c.Contains($_) })) -or ($e -and ($pats | Where-Object { $e.StartsWith($_) })) } | ForEach-Object { Write-Output ('   killing PID ' + $_.ProcessId + ' - ' + $_.Name); Stop-Process -Id $_.ProcessId -Force }",
  ].join('\n');
}

/** How a process is run. Injected so the real machine has tests that launch nothing. */
export type Run = (program: string, args: readonly string[], cwd: string) => string;

const runForReal: Run = (program, args, cwd) =>
  execFileSync(program, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** The real machine. */
export function realMachine(platform: NodeJS.Platform, run: Run = runForReal): Machine {
  const windows = platform === 'win32';
  return {
    paths: windows ? path.win32 : path.posix,
    windows,
    git(args, cwd) {
      try {
        return { code: 0, output: run('git', args, cwd) };
      } catch {
        return { code: 1, output: '' };
      }
    },
    exists: existsSync,
    realpath: target => (existsSync(target) ? realpathSync.native(target) : null),
    killProcessesInside(target) {
      try {
        const output = run('powershell', ['-NoProfile', '-NonInteractive', '-Command', processKillScript(target)], '.');
        return output.split(/\r?\n/).filter(line => line.trim() !== '');
      } catch {
        // No PowerShell means nothing to kill: the delete below says if something stayed.
        return ['   could not list processes: continuing with the delete'];
      }
    },
    // A recursive `rmSync` unlinks a symlink or junction instead of entering it. The sentinel test proves it.
    remove: target => rmSync(target, { recursive: true, force: true, maxRetries: 3 }),
    sleep: ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
    log: line => console.log(line),
  };
}
