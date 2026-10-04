import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { match } from '../../.spec-anchored/kernel.ts';

/**
 * The eligible target of a mutation run: the files that changed since a base commit and that the
 * `mutate` list of `stryker.config.json` covers.
 *
 *   node .agents/scripts/mutation-target.ts <base>            the eligible files, comma-separated
 *   node .agents/scripts/mutation-target.ts <base> --report   eligible and not eligible, as JSON
 *
 * Stryker does not intersect: a `--mutate` on its command line replaces the list of the config,
 * so a changed file that only a browser test covers would be mutated with no test to kill its
 * mutants. This script does the intersection. The CI job and the mutation hardener both call
 * it, so the two take the same target.
 */

export interface Target {
  /** Changed, and in the `mutate` list. */
  readonly eligible: readonly string[];
  /** Changed product code that the list leaves out: Stryker cannot run the test that covers it. */
  readonly notEligible: readonly string[];
}

/** Product code: what the hook protects, without its tests and its type declarations. */
const PRODUCT = ['src/**/*.ts', 'src/**/*.tsx', 'mcp-server/src/**/*.ts'];
const NOT_PRODUCT = ['**/__tests__/**', '**/*.d.ts'];

/**
 * Whether the `mutate` list takes `file`. A pattern that starts with `!` takes a file out, as in
 * Stryker: the file must match a pattern, and no negated one.
 */
export function isMutated(file: string, mutate: readonly string[]): boolean {
  const negated = mutate.filter(p => p.startsWith('!')).map(p => p.slice(1));
  const positive = mutate.filter(p => !p.startsWith('!'));
  return positive.some(p => match(file, p)) && !negated.some(p => match(file, p));
}

/** Splits the changed files into the eligible target and the product code that is left out. */
export function mutationTarget(changed: readonly string[], mutate: readonly string[]): Target {
  const eligible = changed.filter(file => isMutated(file, mutate));
  const product = (file: string) => PRODUCT.some(p => match(file, p)) && !NOT_PRODUCT.some(p => match(file, p));
  return { eligible, notEligible: changed.filter(file => !eligible.includes(file) && product(file)) };
}

/** The machine, as the command needs it. Real in `realMutationSystem`, fake in tests. */
export interface MutationSystem {
  /** The files added, changed or renamed between the merge base of `base` and `HEAD`. `null` if git refuses. */
  changed(base: string): string[] | null;
  /** The text of `stryker.config.json`. */
  config(): string;
  out(line: string): void;
  err(line: string): void;
}

/** The command. Returns the exit code: 0 done, 1 git refused the base, 2 bad usage. */
export function mutationTargetCommand(args: readonly string[], sys: MutationSystem): 0 | 1 | 2 {
  const [base, flag] = args;
  if (base === undefined || args.length > 2 || (flag !== undefined && flag !== '--report')) {
    sys.err('usage: node .agents/scripts/mutation-target.ts <base> [--report]');
    return 2;
  }
  const changed = sys.changed(base);
  if (changed === null) {
    sys.err(`git cannot diff against \`${base}\``);
    return 1;
  }
  const { mutate } = JSON.parse(sys.config()) as { mutate: string[] };
  const target = mutationTarget(changed, mutate);
  sys.out(flag === undefined ? target.eligible.join(',') : JSON.stringify(target, null, 2));
  return 0;
}

/** The real machine, with git run in `cwd`. */
export function realMutationSystem(cwd: string = process.cwd()): MutationSystem {
  return {
    changed(base) {
      const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`], { cwd, encoding: 'utf8' });
      return result.status === 0 ? result.stdout.split('\n').filter(line => line !== '') : null;
    },
    config: () => readFileSync(path.join(cwd, 'stryker.config.json'), 'utf8'),
    out: line => console.log(line),
    err: line => console.error(line),
  };
}
