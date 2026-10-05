import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Plumbing, not a worktree: the environment guard rejects `git -C <another worktree>`.
// The new tree starts from the head of the branch: the URL of an earlier run must not give 404.
// Imports only `node:*`: skills carry a byte-for-byte copy of this file.

export const USAGE = 'usage: node screenshots-to-branch.ts <issue-number> <folder> [--no-push]';

export interface ScreenshotSystem {
  /** Trimmed stdout. Throws if git fails. With `index`, git uses that index file. */
  git(args: readonly string[], index?: string): string;
  isDir(target: string): boolean;
  /** The files under `folder`, recursively, as sorted POSIX paths relative to it. */
  files(folder: string): string[];
  withIndex<T>(use: (index: string) => T): T;
  out(line: string): void;
  err(line: string): void;
}

export function buildTree(folder: string, parent: string | null, sys: ScreenshotSystem): string {
  return sys.withIndex(index => {
    if (parent !== null) sys.git(['read-tree', parent], index);
    for (const file of sys.files(folder)) {
      const blob = sys.git(['hash-object', '-w', path.join(folder, file)]);
      sys.git(['update-index', '--add', '--cacheinfo', `100644,${blob},${file}`], index);
    }
    return sys.git(['write-tree'], index);
  });
}

export function rawBase(remoteUrl: string): string | null {
  const found = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl);
  return found === null ? null : `https://raw.githubusercontent.com/${found.slice(1, 3).join('/')}`;
}

export function run(args: readonly string[], sys: ScreenshotSystem): 0 | 1 | 2 {
  const positional = args.filter(arg => arg !== '--no-push');
  if (positional.length !== 2 || !/^\d+$/.test(String(positional[0]))) {
    sys.err(USAGE);
    return 2;
  }
  const issue = String(positional[0]);
  const folder = path.resolve(String(positional[1]));
  if (!sys.isDir(folder)) {
    sys.err(`not a folder: ${folder}`);
    return 2;
  }
  const branch = `screenshots/${issue}`;
  try {
    const remote = sys.git(['ls-remote', 'origin', `refs/heads/${branch}`]);
    let parent: string | null = null;
    if (remote !== '') {
      sys.git(['fetch', '-q', 'origin', branch]);
      parent = String(remote.split(/\s/, 1)[0]);
    }
    const tree = buildTree(folder, parent, sys);
    const parents = parent === null ? [] : ['-p', parent];
    const commit = sys.git(['commit-tree', tree, ...parents, '-m', `screenshots of #${issue}`]);
    sys.out(sys.git(['ls-tree', '-r', '--name-only', commit]));
    if (args.includes('--no-push')) {
      sys.out(`commit ${commit}, not pushed`);
      return 0;
    }
    sys.git(['push', 'origin', `${commit}:refs/heads/${branch}`]);
    const base = rawBase(sys.git(['remote', 'get-url', 'origin']));
    sys.out(`pushed to ${branch}${base === null ? '' : `: ${base}/${branch}/<file>`}`);
    return 0;
  } catch (error) {
    sys.err(String(error).replace(/^Error: /, ''));
    return 1;
  }
}

export function realScreenshotSystem(cwd: string = process.cwd()): ScreenshotSystem {
  return {
    git(args, index) {
      const env = index === undefined ? process.env : { ...process.env, GIT_INDEX_FILE: index };
      return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    },
    isDir: target => statSync(target, { throwIfNoEntry: false })?.isDirectory() === true,
    files: folder =>
      readdirSync(folder, { recursive: true, encoding: 'utf8' })
        .filter(file => statSync(path.join(folder, file)).isFile())
        .map(file => file.split(path.sep).join('/'))
        .sort(),
    withIndex(use) {
      const dir = mkdtempSync(path.join(tmpdir(), 'screenshots-'));
      try {
        return use(path.join(dir, 'index'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    out: line => console.log(line),
    err: line => console.error(line),
  };
}
