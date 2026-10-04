import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Pushes a folder of screenshots to the orphan branch `screenshots/<N>`, without a worktree.
 * The entrypoint is `screenshots-to-branch.ts`; this module holds the logic, with git and the
 * disk injected.
 *
 * It runs from the worktree of the issue branch. The screenshots an issue asks for do not go
 * in its branch: they go to `screenshots/<N>`, which is never merged, and the PR shows them
 * by their `raw.githubusercontent.com` URL.
 *
 * ## Plumbing, not a worktree
 *
 * The environment guard rejects `git -C <another worktree>`, so the recipe of an orphan
 * worktree committed from outside does not work from a lane's worktree. This module builds
 * the blobs and a tree with subfolders in a temporary index, and a commit with `commit-tree`,
 * in the repo of the current directory. The commit is pushed straight to the remote branch.
 *
 * ## Every run adds, none overwrites
 *
 * **If the branch exists, the new tree starts from its head's tree**, and the folder's files
 * go on top: what was there stays, and a file with the same path is replaced. Without this,
 * the branch head held only the last run's folder, and every URL of an earlier run gave 404
 * while the PR still showed it.
 *
 * This file imports only `node:*`: the `implement-feature` skill carries a byte-for-byte copy.
 */

export const USAGE = 'usage: node screenshots-to-branch.ts <issue-number> <folder> [--no-push]';

/** What the script needs from the machine. Real in `realScreenshotSystem`, fake in the tests. */
export interface ScreenshotSystem {
  /** Trimmed stdout. Throws if git fails. With `index`, git uses that index file. */
  git(args: readonly string[], index?: string): string;
  isDir(target: string): boolean;
  /** The files under `folder`, recursively, as sorted POSIX paths relative to it. */
  files(folder: string): string[];
  /** Runs `use` with the path of a fresh index file, and removes it afterwards. */
  withIndex<T>(use: (index: string) => T): T;
  out(line: string): void;
  err(line: string): void;
}

/** The hash of the tree of `folder`, with its subfolders, on top of the tree of commit `parent`. */
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

/** The `raw.githubusercontent.com` base of a GitHub remote, or `null` if it is not one. */
export function rawBase(remoteUrl: string): string | null {
  const found = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl);
  return found === null ? null : `https://raw.githubusercontent.com/${found.slice(1, 3).join('/')}`;
}

/** Runs the upload. Returns the exit code: 0 done, 1 git failed, 2 bad usage. */
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

/** The real machine, with git run in `cwd`. */
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
