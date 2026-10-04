import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Materializes the diff of ONE pull request and measures which review axes apply. The
 * entrypoint is `pr-diff.ts`; this module holds the logic, with git and the disk injected.
 *
 * It runs at the head of the PR: in the main checkout when `pr-review` calls it, or inside
 * the agent's worktree in a batch review. The optional head argument lets a parent measure a
 * PR without a checkout, and size the fan-out from that.
 *
 * **The base is the PR's `baseRefName`, NOT `staging`**, so it has no default: in a stacked
 * batch, a diff against `staging` brings in the commits of the PR below, and the review fills
 * with findings that belong to another PR.
 *
 * ## The axis thresholds
 *
 * They are **declared, not measured**: they come from the repo this harness was ported from,
 * where they were counted on real runs. Here no run has measured them yet. The first run
 * that contradicts one moves it, and then it is measured, with its date.
 *
 * This file imports only `node:*`: the `pr-review` skill carries a byte-for-byte copy.
 */

export const USAGE = [
  'usage: node pr-diff.ts <base-branch> <out-dir> [<head>]',
  "  The base is the PR's baseRefName, not `staging`: in a stacked batch, a diff against",
  '  staging brings in the commits of the PR below. The head defaults to HEAD.',
].join('\n');

/**
 * Generated files: they leave the diff and cost nothing. A PR that updates a lockfile is
 * reviewed by reading `package.json`, not the lockfile line by line. Without `glob` magic,
 * the `*` of a pathspec also matches `/`, so this reaches `mcp-server/pnpm-lock.yaml` too.
 */
export const EXCLUDED = [':(exclude)*pnpm-lock.yaml', ':(exclude)dist/*', ':(exclude)coverage/*'] as const;

/** A diff above this many lines is triaged from the stat, not read whole. */
export const LARGE_DIFF = 1500;
/** The numeric claims printed; the rest are counted. */
export const MAX_CLAIMS = 60;

const PROSE = /\.(?:md|txt)$/;
/** A capability contract: `specs/<cap>/<cap>.md`. The `_template` folder is not one. */
const CONTRACT = /^specs\/(?!_)([^/]+)\/\1\.md$/;
/** A comment line in TypeScript and JavaScript: `//`, `/*`, and the ` * ` of a doc block. */
const COMMENT = /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$))/;
/** A line with nothing to claim: blanks, table rules, heading marks. */
const EMPTY = /^[\s|:#-]*$/;

/**
 * The STRUCTURAL numbering of this repo, which is never a falsifiable claim about the tree:
 * a contract ID, an issue number, a numbered spec of the old regime, a numbered step, an
 * identifier with a digit inside (`win32`, `utf8`), an ordered-list marker, also inside a
 * comment, and a numbered heading. It is removed from the line BEFORE asking whether
 * any digit remains.
 *
 * **It is the only filter, and it works on the repo's documented vocabulary, not on the
 * meaning of the sentence.** In the source repo it cut 375 candidate lines to 112 on a real
 * PR: a block that is 70 % noise is not read, and an unread block is an axis turned off.
 * What remains still has noise on purpose: it is a list of candidates, not a verdict.
 */
const STRUCTURAL =
  /\b(?:BR|AC|OQ)-[^\s-]+-\d+\b|#\d+|\b[Ss]tep\s?\d+|\bspecs?\/?\s?\d{3}\b|\b\d{3}-[a-z]|\b[A-Za-z_]+\d\w*|^\s*(?:\/\/|\*)?\s*\d+[.)]\s|^\s*#+\s+\d+\s*[·.)-]|\[0-9\]/g;

/** Error branches in TypeScript. A diff that adds error paths without any of these is what the axis looks for. */
const ERRORS = /\bthrow\b|\bcatch\b|console\.(?:error|warn)|process\.exitCode|\belse\b/g;
/** Declarations whose types the types axis reviews. */
const SIGNATURES = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|interface|class|type)\s+\w/gm;

const THRESHOLD = { errors: 3, signatures: 2, comments: 5 } as const;

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** What the script needs from the machine. Real in `realDiffSystem`, fake in the tests. */
export interface DiffSystem {
  git(args: readonly string[]): GitResult;
  /** Creates the parent folders. */
  write(file: string, text: string): void;
  out(line: string): void;
  err(line: string): void;
}

/** One added line, with the file it belongs to: a `#` is a heading in Markdown and nothing in TypeScript. */
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

/** Prose lines and comment lines that keep a digit once the structural numbering is gone. */
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

/** Prints the axes, the contracts, the claims and the stat. Every line goes to `out`. */
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
  // A prose or comment line with a number is a falsifiable claim. This block does not say
  // which one is wrong: it says which ones to cross-check against the tree and the contract.
  const claims = numericClaims(added);
  if (claims.length === 0) sys.out('  (none)');
  for (const claim of claims.slice(0, MAX_CLAIMS)) sys.out(claim);
  if (claims.length > MAX_CLAIMS) sys.out(`  ... and ${claims.length - MAX_CLAIMS} more (grep the rest yourself)`);

  sys.out('');
  sys.out('-- pr.stat --');
  sys.out(stat.replace(/\n$/, ''));
}

/** Runs the measurement. Returns the exit code: 0 done, 1 aborted, 2 bad usage. */
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

/** The real machine, with git run in `cwd`. */
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
