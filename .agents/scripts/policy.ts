import type { PlatformPath } from 'node:path';
import { isValidWorktreeTarget } from './worktrees.ts';

// It fails open, and says so: it protects a convention, not a secret.

export interface Intent {
  readonly writes: readonly string[];
  readonly worktrees: readonly { readonly gitDir: string; readonly target: string }[];
  /** `head` is the branch the call names, or `null` for the branch of `cwd`. */
  readonly pullRequests: readonly { readonly cwd: string; readonly head: string | null }[];
}

export type Verdict =
  | { readonly kind: 'no-opinion' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'warn'; readonly reason: string };

export interface Git {
  readonly paths: PlatformPath;
  ownCheckout(): string | null;
  treeOf(target: string): string | null;
  branchOf(tree: string): string | null;
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

function same(paths: PlatformPath, a: string, b: string): boolean {
  return paths.sep === '\\' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** The folder itself counts as inside: `rm -rf src` is the delete that matters most. */
export function isProtected(paths: PlatformPath, tree: string, target: string): boolean {
  return PROTECTED.some(dir => {
    const relative = paths.relative(paths.join(tree, dir), target);
    const outside = relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative);
    return !outside;
  });
}

export function branchDenial(branch: string, target: string): string | null {
  if (branch === INTEGRATION_BRANCH || PRODUCT_PREFIXES.some(p => branch.startsWith(p))) return null;
  if (branch === RELEASE_BRANCH) {
    return `You are on \`${RELEASE_BRANCH}\`, which changes only through a promotion PR from \`${INTEGRATION_BRANCH}\`. ${WAY_OUT}`;
  }
  return `The branch \`${branch}\` does not say what kind of change it is, and \`${target}\` is product code. ${WAY_OUT}`;
}

export function ourMainCheckout(git: Git, dir: string): string | null {
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

function isolated(name: string, rule: () => Verdict): Verdict {
  try {
    return rule();
  } catch (error) {
    return { kind: 'warn', reason: `${name} could not run and let the call through: ${String(error)}` };
  }
}

export function decide(intent: Intent, git: Git): Verdict {
  const verdicts = [
    isolated('worktree gate', () => worktreeRule(intent, git)),
    isolated('branch gate', () => branchRule(intent, git)),
  ];
  return verdicts.find(v => v.kind === 'deny') ?? verdicts.find(v => v.kind === 'warn') ?? { kind: 'no-opinion' };
}
