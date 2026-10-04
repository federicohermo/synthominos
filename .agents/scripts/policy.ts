import type { PlatformPath } from 'node:path';
import { isValidWorktreeTarget } from './worktrees.ts';

/**
 * The repo's rules on WHAT can be written from WHERE. The core of the hooks: it knows nothing
 * about Claude, Codex, shells or how to run git. It takes an `Intent` and a `Git` port.
 *
 * 1. The branch prefix decides whether the product can be written. `src/` and `mcp-server/src/`
 *    are written from a branch that says what kind of change it is, or from `staging` for a
 *    `hotfix:`. Only the NAME is checked: the PR checks that a `feature/` starts from a spec.
 * 2. A worktree of this repo opens only under `.claude/worktrees/`. See `worktrees.ts`.
 *
 * It fails open, and says so: it protects a convention, not a secret. Each rule runs in
 * isolation, so one rule's error does not switch off the other.
 */

/** What one tool call is going to do, as absolute paths. */
export interface Intent {
  readonly writes: readonly string[];
  /** `gitDir` is the directory git runs from for `git worktree add` (the cwd, or its `-C`). */
  readonly worktrees: readonly { readonly gitDir: string; readonly target: string }[];
}

export type Verdict =
  | { readonly kind: 'no-opinion' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'warn'; readonly reason: string };

/** All the core knows about git. Real in `system.ts`, fake in tests. */
export interface Git {
  /** `path.win32` or `path.posix`: the two-drive case is tested on any platform. */
  readonly paths: PlatformPath;
  /** The main checkout of the repo this harness lives in. `null` if git did not answer. */
  ownCheckout(): string | null;
  /** The toplevel of the tree that holds `target`, walking up to the nearest existing folder. */
  treeOf(target: string): string | null;
  /** The branch of the tree. During a rebase, the branch being rebased. */
  branchOf(tree: string): string | null;
  /** The main checkout of the repo of `dir`: the parent of its `--git-common-dir`. */
  mainCheckoutOf(dir: string): string | null;
}

export const PROTECTED = ['src', 'mcp-server/src'] as const;
export const PRODUCT_PREFIXES = ['feature/', 'bugfix/', 'refactor/', 'improvement/'] as const;
/** For the message only: they enable nothing, they name what does not touch the product. */
export const NON_PRODUCT_PREFIXES = ['harness/', 'docs/'] as const;
export const INTEGRATION_BRANCH = 'staging';
export const RELEASE_BRANCH = 'main';

const list = (prefixes: readonly string[]) => prefixes.map(p => `\`${p}\``).join(', ');

const WAY_OUT =
  `The product is written from ${list(PRODUCT_PREFIXES)}. A change that does not touch \`src/\` ` +
  `is named by what it touches: ${list(NON_PRODUCT_PREFIXES)}. A hotfix is a \`hotfix:\` commit ` +
  `straight on \`${INTEGRATION_BRANCH}\`. See \`docs/infra/branches.md\`.`;

/** The comparison the OS makes: Windows ignores case. */
function same(paths: PlatformPath, a: string, b: string): boolean {
  return paths.sep === '\\' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Whether `target` falls inside a protected folder of the tree `tree`.
 *
 * It compares RESOLVED paths, so `src/../src/x.ts` lands where it lands. The folder itself
 * counts as inside: `rm -rf src` is the delete that matters most. "Leaves" means `..` exactly or
 * `../…`, so a sibling named `..notes` does not leave. Across two Windows drives `relative`
 * returns the other drive's absolute path, which is outside.
 */
export function isProtected(paths: PlatformPath, tree: string, target: string): boolean {
  return PROTECTED.some(dir => {
    const relative = paths.relative(paths.join(tree, dir), target);
    const outside = relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative);
    return !outside;
  });
}

/** Why `branch` cannot write the product, or `null` if it can. */
export function branchDenial(branch: string, target: string): string | null {
  if (branch === INTEGRATION_BRANCH || PRODUCT_PREFIXES.some(p => branch.startsWith(p))) return null;
  if (branch === RELEASE_BRANCH) {
    return `You are on \`${RELEASE_BRANCH}\`, which changes only through a promotion PR from \`${INTEGRATION_BRANCH}\`. ${WAY_OUT}`;
  }
  return `The branch \`${branch}\` does not say what kind of change it is, and \`${target}\` is product code. ${WAY_OUT}`;
}

/** The main checkout of `dir` if it is THIS repo, or `null` if it is another repo or none. */
function ourMainCheckout(git: Git, dir: string): string | null {
  const main = git.mainCheckoutOf(dir);
  const own = git.ownCheckout();
  return main !== null && own !== null && same(git.paths, main, own) ? main : null;
}

function worktreeRule(intent: Intent, git: Git): Verdict {
  for (const w of intent.worktrees) {
    const main = ourMainCheckout(git, w.gitDir);
    if (main === null) continue;
    if (!isValidWorktreeTarget(git.paths, main, w.target)) {
      return {
        kind: 'deny',
        reason:
          `A worktree of this repo opens only as a direct child of ` +
          `\`${git.paths.join(main, '.claude', 'worktrees')}\`, the only folder the cleaner sweeps. ` +
          `\`${w.target}\` would be left out of every cleanup.`,
      };
    }
  }
  return { kind: 'no-opinion' };
}

function branchRule(intent: Intent, git: Git): Verdict {
  for (const write of intent.writes) {
    // A free necessary condition: every protected folder ends in `src`. Without it, git is not asked.
    if (!git.paths.normalize(write).split(git.paths.sep).some(s => s.toLowerCase() === 'src')) continue;
    const tree = git.treeOf(write);
    if (tree === null || ourMainCheckout(git, tree) === null) continue;
    if (!isProtected(git.paths, tree, write)) continue;
    const branch = git.branchOf(tree);
    if (branch === null) {
      return { kind: 'warn', reason: `branch gate: could not read the branch of \`${tree}\`, and let \`${write}\` through` };
    }
    const denial = branchDenial(branch, git.paths.relative(tree, write));
    if (denial !== null) return { kind: 'deny', reason: denial };
  }
  return { kind: 'no-opinion' };
}

/** Runs one rule without letting its error switch off the other. */
function isolated(name: string, rule: () => Verdict): Verdict {
  try {
    return rule();
  } catch (error) {
    return { kind: 'warn', reason: `${name} could not run and let the call through: ${String(error)}` };
  }
}

/** The verdict of both rules: the first denial wins; otherwise the first warning. */
export function decide(intent: Intent, git: Git): Verdict {
  const verdicts = [
    isolated('worktree gate', () => worktreeRule(intent, git)),
    isolated('branch gate', () => branchRule(intent, git)),
  ];
  return verdicts.find(v => v.kind === 'deny') ?? verdicts.find(v => v.kind === 'warn') ?? { kind: 'no-opinion' };
}
