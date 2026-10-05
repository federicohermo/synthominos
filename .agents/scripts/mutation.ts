import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { match } from '../../.spec-anchored/kernel.ts';

// Stryker does not intersect: a `--mutate` on its command line replaces the list of the config.

export interface Target {
  readonly eligible: readonly string[];
  readonly notEligible: readonly string[];
}

const PRODUCT = ['src/**/*.ts', 'src/**/*.tsx', 'mcp-server/src/**/*.ts'];
const NOT_PRODUCT = ['**/__tests__/**', '**/*.d.ts'];
const TYPESCRIPT = /\.tsx?$/;

export function isMutated(file: string, mutate: readonly string[]): boolean {
  const negated = mutate.filter(p => p.startsWith('!')).map(p => p.slice(1));
  const positive = mutate.filter(p => !p.startsWith('!'));
  return positive.some(p => match(file, p)) && !negated.some(p => match(file, p));
}

/** A scanner alone reads the `//` of a URL inside a template literal as a comment: this prints what the parser read. */
function codeOf(text: string, file: string): string {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind));
}

// Git gives the base with LF, and a Windows checkout has CRLF: the printer keeps it inside a template literal.
const lf = (text: string) => text.replaceAll('\r\n', '\n');

export function sameCode(before: string, now: string, file: string): boolean {
  const [a, b] = [lf(before), lf(now)];
  return TYPESCRIPT.test(file) ? codeOf(a, file) === codeOf(b, file) : a === b;
}

export function mutationTarget(changed: readonly string[], mutate: readonly string[]): Target {
  const eligible = changed.filter(file => isMutated(file, mutate));
  const product = (file: string) => PRODUCT.some(p => match(file, p)) && !NOT_PRODUCT.some(p => match(file, p));
  return { eligible, notEligible: changed.filter(file => !eligible.includes(file) && product(file)) };
}

export interface MutationSystem {
  changed(base: string): string[] | null;
  before(base: string, file: string): string | null;
  now(file: string): string;
  config(): string;
  out(line: string): void;
  err(line: string): void;
}

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
