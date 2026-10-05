import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The base has no default: in a stacked batch, a diff against `staging` brings in the PR below.
// Imports only `node:*`: the `pr-review` skills carry a byte-for-byte copy of this file.

export const USAGE = [
  'usage: node pr-diff.ts <base-branch> <out-dir> [<head>]',
  "  The base is the PR's baseRefName, not `staging`: in a stacked batch, a diff against",
  '  staging brings in the commits of the PR below. The head defaults to HEAD.',
].join('\n');

/** Without `glob` magic, the `*` of a pathspec also matches `/`: this reaches `mcp-server/pnpm-lock.yaml` too. */
export const EXCLUDED = [':(exclude)*pnpm-lock.yaml', ':(exclude)dist/*', ':(exclude)coverage/*'] as const;

export const LARGE_DIFF = 1500;
export const MAX_CLAIMS = 60;

const PROSE = /\.(?:md|txt)$/;
const CONTRACT = /^specs\/(?!_)([^/]+)\/\1\.md$/;
const COMMENT = /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$))/;
const EMPTY = /^[\s|:#-]*$/;

const STRUCTURAL =
  /\b(?:BR|AC|OQ)-[^\s-]+-\d+\b|#\d+|\b[Ss]tep\s?\d+|\bspecs?\/?\s?\d{3}\b|\b\d{3}-[a-z]|\b[A-Za-z_]+\d\w*|^\s*(?:\/\/|\*)?\s*\d+[.)]\s|^\s*#+\s+\d+\s*[·.)-]|\[0-9\]/g;

const ERRORS = /\bthrow\b|\bcatch\b|console\.(?:error|warn)|process\.exitCode|\belse\b/g;
const SIGNATURES = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|interface|class|type)\s+\w/gm;

const THRESHOLD = { errors: 3, signatures: 2, comments: 5 } as const;

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DiffSystem {
  git(args: readonly string[]): GitResult;
  /** Creates the parent folders. */
  write(file: string, text: string): void;
  out(line: string): void;
  err(line: string): void;
}

export interface AddedLine {
  readonly file: string;
  readonly body: string;
}

export function addedLines(diff: string): AddedLine[] {
  const added: AddedLine[] = [];
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) file = line.slice('+++ b/'.length);
    else if (line.startsWith('+') && !line.startsWith('+++')) added.push({ file, body: line.slice(1) });
  }
  return added;
}

export function numericClaims(added: readonly AddedLine[]): string[] {
  return added
    .filter(({ file, body }) => (PROSE.test(file) || COMMENT.test(body)) && !EMPTY.test(body))
    .filter(({ body }) => /\d/.test(body.replace(STRUCTURAL, ' ')))
    .map(({ file, body }) => `${file}: ${body.slice(0, 150)}`);
}

function count(pattern: RegExp, text: string): number {
  return [...text.matchAll(pattern)].length;
}

const yes = (on: boolean): string => (on ? 'YES' : 'no');

function report(sys: DiffSystem, added: readonly AddedLine[], docs: readonly string[], contracts: readonly string[], stat: string): void {
  const text = added.map(a => a.body).join('\n');
  const errors = count(ERRORS, text);
  const signatures = count(SIGNATURES, text);
  // Only outside prose: in a `.md`, a `*` line is a list item and not a comment.
  const comments = added.filter(a => !PROSE.test(a.file) && COMMENT.test(a.body)).length;
  const prose = comments >= THRESHOLD.comments || docs.length >= 1;

  sys.out('');
  sys.out("== axes (thresholds DECLARED, not measured; an axis at 'no' is NOT reviewed) ==");
  sys.out('correctness+conventions : YES (always)');
  sys.out('layers                  : YES (always)');
  sys.out(`error handling          : ${yes(errors >= THRESHOLD.errors)}  (${errors}, threshold ${THRESHOLD.errors})`);
  sys.out(`signatures and types    : ${yes(signatures >= THRESHOLD.signatures)}  (${signatures}, threshold ${THRESHOLD.signatures})`);
  sys.out(`prose (docs+comments)   : ${yes(prose)}  (${comments} comments, ${docs.length} .md/.txt)`);
  sys.out(`contracts               : ${yes(contracts.length > 0)}  (${contracts.length} specs/<cap>/<cap>.md)`);

  sys.out('');
  sys.out('== capability contracts this PR touches ==');
  if (contracts.length === 0) sys.out('  (none)');
  for (const file of contracts) sys.out(`  ${file}`);

  sys.out('');
  sys.out('== numeric claims the diff ADDS ==');
  const claims = numericClaims(added);
  if (claims.length === 0) sys.out('  (none)');
  for (const claim of claims.slice(0, MAX_CLAIMS)) sys.out(claim);
  if (claims.length > MAX_CLAIMS) sys.out(`  ... and ${claims.length - MAX_CLAIMS} more (grep the rest yourself)`);

  sys.out('');
  sys.out('-- pr.stat --');
  sys.out(stat.replace(/\n$/, ''));
}

export function prDiff(args: readonly string[], sys: DiffSystem): 0 | 1 | 2 {
  if (args.length < 2) {
    sys.err(USAGE);
    return 2;
  }
  const base = String(args[0]);
  const outDir = String(args[1]);
  const head = args[2] ?? 'HEAD';
  const exists = (ref: string): boolean => sys.git(['rev-parse', '--verify', '--quiet', ref]).code === 0;
  const git = (...gitArgs: string[]): string => {
    const result = sys.git(gitArgs);
    if (result.code !== 0) throw new Error(`ABORT: git ${gitArgs.join(' ')} -> ${result.stderr.trim()}`);
    return result.stdout;
  };

  try {
    if (sys.git(['fetch', 'origin', '--quiet']).code !== 0) sys.err('WARN: `git fetch` failed; using the local state');
    const ref = exists(`origin/${base}`) ? `origin/${base}` : base;
    if (!exists(ref)) throw new Error(`ABORT: neither \`${base}\` nor \`origin/${base}\` exists`);
    if (!exists(head)) throw new Error(`ABORT: head \`${head}\` does not exist`);
    const mergeBase = git('merge-base', ref, head).trim();
    const diffOf = (...extra: string[]): string => git('diff', ...extra, `${mergeBase}..${head}`, '--', '.', ...EXCLUDED);

    const diff = diffOf();
    const files = diffOf('--name-only').split('\n').filter(f => f !== '');
    const stat = diffOf('--stat');
    const docs = files.filter(f => PROSE.test(f));
    const code = files.filter(f => !PROSE.test(f));
    const contracts = files.filter(f => CONTRACT.test(f));
    const lines = (diff.match(/\n/g) ?? []).length;

    const outputs: Record<string, string> = {
      'pr.diff': diff,
      'pr.stat': stat,
      'pr.files': files.map(f => `${f}\n`).join(''),
      'pr.code': code.map(f => `${f}\n`).join(''),
      'pr.docs': docs.map(f => `${f}\n`).join(''),
      'pr.specs': contracts.map(f => `${f}\n`).join(''),
    };
    for (const [name, text] of Object.entries(outputs)) sys.write(path.join(outDir, name), text);

    sys.out(`base_ref=${ref}`);
    sys.out(`head_ref=${head}`);
    sys.out(`merge_base=${mergeBase}`);
    for (const name of Object.keys(outputs)) sys.out(`${name.replace('.', '_')}_path=${path.join(outDir, name)}`);
    sys.out(`diff_lines=${lines}`);
    sys.out(`files_changed=${files.length}`);
    sys.out(`code_files=${code.length}`);
    sys.out(`doc_files=${docs.length}`);
    sys.out(`spec_files=${contracts.length}`);
    if (lines > LARGE_DIFF) {
      sys.out('diff_size=large');
      sys.err(`WARN: > ${LARGE_DIFF} lines. Do NOT read it whole: triage from the stat.`);
    } else {
      sys.out('diff_size=ok');
    }

    report(sys, addedLines(diff), docs, contracts, stat);
    return 0;
  } catch (error) {
    sys.err(String(error).replace(/^Error: /, ''));
    return 1;
  }
}

export function realDiffSystem(cwd: string = process.cwd()): DiffSystem {
  return {
    git(args) {
      // A diff can weigh megabytes: the default buffer of 1 MB would cut it in silence.
      const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 ** 3 });
      return { code: result.status === 0 ? 0 : 1, stdout: result.stdout, stderr: result.stderr };
    },
    write(file, text) {
      mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      writeFileSync(file, text, 'utf8');
    },
    out: line => console.log(line),
    err: line => console.error(line),
  };
}
