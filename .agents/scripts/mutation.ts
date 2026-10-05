import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { match } from '../../.spec-anchored/kernel.ts';

/**
 * The eligible target of a mutation run: the files whose CODE changed since a base commit and
 * that the `mutate` list of `stryker.config.json` covers.
 *
 *   node .agents/scripts/mutation-target.ts <base>            the eligible files, comma-separated
 *   node .agents/scripts/mutation-target.ts <base> --report   eligible and not eligible, as JSON
 *
 * Stryker does not intersect: a `--mutate` on its command line replaces the list of the config,
 * so a changed file that only a browser test covers would be mutated with no test to kill its
 * mutants. This script does the intersection. The CI job and the mutation hardener both call
 * it, so the two take the same target.
 *
 * A file where only a comment or the layout changed is not a changed file here. Its mutants are
 * the ones it had, and a PR that rewords the comments of twenty modules would pay for the
 * mutants of the twenty.
 */

export interface Target {
  /** Its code changed, and it is in the `mutate` list. */
  readonly eligible: readonly string[];
  /** Changed product code that the list leaves out: Stryker cannot run the test that covers it. */
  readonly notEligible: readonly string[];
}

/** Product code: what the hook protects, without its tests and its type declarations. */
const PRODUCT = ['src/**/*.ts', 'src/**/*.tsx', 'mcp-server/src/**/*.ts'];
const NOT_PRODUCT = ['**/__tests__/**', '**/*.d.ts'];
const TYPESCRIPT = /\.tsx?$/;

/**
 * Whether the `mutate` list takes `file`. A pattern that starts with `!` takes a file out, as in
 * Stryker: the file must match a pattern, and no negated one.
 */
export function isMutated(file: string, mutate: readonly string[]): boolean {
  const negated = mutate.filter(p => p.startsWith('!')).map(p => p.slice(1));
  const positive = mutate.filter(p => !p.startsWith('!'));
  return positive.some(p => match(file, p)) && !negated.some(p => match(file, p));
}

/**
 * The code of a TypeScript file with no comment and one layout: what the parser read, printed
 * again. A scanner alone is not enough: it reads the `//` of a URL inside a template literal as
 * a comment, and a change there is a change of code.
 */
function codeOf(text: string, file: string): string {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind));
}

/** Whether two versions of a file hold the same code: comments and layout aside. */
export function sameCode(before: string, now: string, file: string): boolean {
  return TYPESCRIPT.test(file) ? codeOf(before, file) === codeOf(now, file) : before === now;
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
  /** The text of `file` at the merge base of `base` and `HEAD`. `null` if it is not there. */
  before(base: string, file: string): string | null;
  /** The text of `file` in the working tree. */
  now(file: string): string;
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
  const codeChanged = changed.filter(file => {
    const before = sys.before(base, file);
    return before === null || !sameCode(before, sys.now(file), file);
  });
  const { mutate } = JSON.parse(sys.config()) as { mutate: string[] };
  const target = mutationTarget(codeChanged, mutate);
  sys.out(flag === undefined ? target.eligible.join(',') : JSON.stringify(target, null, 2));
  return 0;
}

/** The real machine, with git run in `cwd`. */
export function realMutationSystem(cwd: string = process.cwd()): MutationSystem {
  const git = (...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 ** 3 });
  return {
    changed(base) {
      const result = git('diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`);
      return result.status === 0 ? result.stdout.split('\n').filter(line => line !== '') : null;
    },
    before(base, file) {
      const result = git('show', `${git('merge-base', base, 'HEAD').stdout.trim()}:${file}`);
      return result.status === 0 ? result.stdout : null;
    },
    now: file => readFileSync(path.join(cwd, file), 'utf8'),
    config: () => readFileSync(path.join(cwd, 'stryker.config.json'), 'utf8'),
    out: line => console.log(line),
    err: line => console.error(line),
  };
}
