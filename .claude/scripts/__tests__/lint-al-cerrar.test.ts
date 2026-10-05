import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

/**
 * The stop hook: when the turn ends, what changed is linted.
 *
 * **It is tested against a FABRICATED repo.** The hook decides from `git diff` and
 * `git ls-files`, so to exercise it for real takes a dirty tree, and on this repo that would
 * leave loose files if a test dies halfway. With a toy repo the changes are real and the hook
 * runs without one test parameter. No environment variable tells it what to do: a testing
 * backdoor in a hook is the first thing someone uses to skip it.
 *
 * ## ESLint is the REAL one, and why that matters
 *
 * `node_modules/` enters the toy repo through a link to the one of the repo, so what runs is
 * the real ESLint with a real exit code, which is the only input this hook looks at. What is
 * **not** real is the config: the toy has a minimal one with one rule (`TSEnumDeclaration`)
 * and **with no type information**. It is on purpose and measured: the real config costs
 * 4.42 s per invocation, and these tests call ESLint several times. What is verified here is
 * the hook (it gathers the files, filters, decides by exit code and does not block too much),
 * not the rules of the repo, which `pnpm lint` verifies.
 *
 * ## The two toy repos
 *
 * The second, **with no ESLint**, is not duplication: it is the only honest oracle of two
 * cases. "A `.png` is not tried" and "the missing binary lets the turn through and says so"
 * can be told apart only if the hook, on a filtered file, exits **with nothing said** even
 * when ESLint does not exist. With ESLint present the two cases look the same, exit 0, and
 * the test would be green and prove nothing.
 *
 * This file is outside the `include` of coverage, so it is not under the 100 threshold: the
 * criterion of sufficiency is that each case is a real failure mode.
 */

/**
 * **The timeout is looser here, for a measured reason.**
 *
 * Each case that reaches ESLint starts a real process: measured on an idle machine, 1.4 s per
 * case. With the four nodes of `verify` competing for CPU, and this repo runs batches of N
 * lanes at once, the same case measured 6.1 s and failed the suite against the default
 * `testTimeout: 5_000`. A false red in the convergence node teaches people to read red as
 * noise. No time is measured here (what is verified is the verdict of the hook, which comes
 * from an exit code), so the ceiling only has to be loose. 30 s is the same number as the
 * `timeout` of the hook in `.claude/settings.json` and as the one of `vite.config.ts` under
 * coverage.
 */
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK_REAL = resolve(AQUI, '../lint-al-cerrar.mjs');
const NODE_MODULES_REAL = resolve(AQUI, '../../../node_modules');

/** The same as the hook: it is a resource of the machine, not of the repo, so it is shared. */
const LOCK = join(tmpdir(), 'pentomino-lint-al-cerrar.lock');

/**
 * The config of the toy. One rule, and `.md` is NOT in it: the hook has `.md` in its filter,
 * but to lint Markdown takes `@eslint/markdown`, and this file verifies no rules.
 */
const CONFIG = [
  "import tseslint from 'typescript-eslint'",
  'export default [',
  "  { files: ['**/*.ts'],",
  '    languageOptions: { parser: tseslint.parser },',
  "    rules: { 'no-restricted-syntax': ['error', {",
  "      selector: 'TSEnumDeclaration', message: 'Zero enum: a const object and a derived union.' }] } },",
  "  { files: ['**/*.js'], rules: {} },",
  ']',
].join('\n');

let repo: string;
let repoSinEslint: string;

interface Salida { code: number; stdout: string; stderr: string }

/** Runs the hook in the given repo and returns the exit code and the two outputs. */
function correr(donde: string, entrada = '{"hook_event_name":"Stop"}'): Salida {
  try {
    const stdout = execFileSync(process.execPath, [join(donde, '.claude/scripts/lint-al-cerrar.mjs')], {
      input: entrada, encoding: 'utf8', cwd: donde, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const error = e as { status: number | null; stdout: string; stderr: string };
    return { code: error.status ?? -1, stdout: error.stdout, stderr: error.stderr };
  }
}

/** Builds a toy repo with the real hook inside, with or without a reachable ESLint. */
function fabricar(prefijo: string, conEslint: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), prefijo));
  mkdirSync(join(dir, '.claude/scripts'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });

  // The real hook, not a reimplementation: if someone edits it, this tests it.
  cpSync(HOOK_REAL, join(dir, '.claude/scripts/lint-al-cerrar.mjs'));
  writeFileSync(join(dir, 'src/limpio.ts'), 'export const dos = 2;\n');

  if (conEslint) {
    // `junction` so that it works on Windows without administrator rights; on POSIX the type
    // is ignored and the result is a plain symlink.
    symlinkSync(NODE_MODULES_REAL, join(dir, 'node_modules'), 'junction');
    writeFileSync(join(dir, 'eslint.config.mjs'), CONFIG);
  }

  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.email', 'hook@test');
  git('config', 'user.name', 'Hook');
  // `node_modules` is not committed and not looked at: if it were, `git ls-files --others`
  // would return the whole dependency tree and the hook would try to lint it.
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
  git('add', '-A');
  git('commit', '-m', 'inicial', '--no-gpg-sign');
  return dir;
}

/** Leaves the tree of the toy as just cloned, so that each case starts from zero. */
function limpiar(donde: string) {
  execFileSync('git', ['checkout', '--', '.'], { cwd: donde, stdio: 'pipe' });
  execFileSync('git', ['clean', '-fd'], { cwd: donde, stdio: 'pipe' });
}

beforeAll(() => {
  repo = fabricar('lint-al-cerrar-', true);
  repoSinEslint = fabricar('lint-al-cerrar-pelado-', false);
});

afterEach(() => {
  limpiar(repo);
  limpiar(repoSinEslint);
  if (existsSync(LOCK)) unlinkSync(LOCK);
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(repoSinEslint, { recursive: true, force: true });
});

describe('blocks the end of the turn on a finding', () => {
  it('a modified file with an `enum`: exit 2, and the text names the file', () => {
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    // Exit 2 is the only thing that keeps the turn open, and the text goes on STDERR: a JSON
    // on stdout without exit 2 blocks nothing.
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('limpio.ts');
    expect(r.stderr).toContain('Zero enum');
  });

  it('a NEW untracked file, which `git diff` does not see', () => {
    // The case that gets forgotten, and the one an agent produces all the time: a file just
    // created does not appear in `git diff` or in `--cached`. `git ls-files --others` sees it.
    writeFileSync(join(repo, 'src/nuevo.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('nuevo.ts');
  });

  it('a file DELETED in the same turn does not turn off the check of the rest', () => {
    // **A measured failure in green.** `git diff --name-only` lists deleted files the same as
    // modified ones, and ESLint on a path that does not exist exits with status 2 ("No files
    // matching the pattern"), which the hook reads as "could not decide" and lets through.
    // Without the `existsSync` filter, to delete `docs/guides/troubleshooting.md` in the real
    // repo made an `enum` just written in `src/pieces/transform.ts` come out with exit 0. And
    // a deletion is not rare here: the convention is that deletions go in their own commit.
    rmSync(join(repo, 'src/limpio.ts'));
    writeFileSync(join(repo, 'src/nuevo.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('nuevo.ts');
  });

  it('a file with an accent in its name: git quotes it, and the hook still sees it', () => {
    // With the default `core.quotePath`, `git ls-files` returns `"src/sesión.ts"` as
    // `"src/sesi\303\263n.ts"`, quotes included, so the extension stops being `.ts` and the
    // file falls out of the filter. That is a file the hook never looks at, in silence.
    writeFileSync(join(repo, 'src/sesión.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Zero enum');
  });

  it('a huge output is truncated, not dumped whole and not lost', () => {
    // The two halves of the same bug. The default `maxBuffer` of `execFileSync` is 1 MiB, and
    // going over it does NOT look like a finding: it is `ENOBUFS` with `status: null`, so
    // without the limit the hook fails open exactly when there are the most findings. And to
    // return them whole would dump them into the context of the agent, the opposite of "the
    // message says how to get out".
    //
    // **The number of errors is chosen to go over 1 MiB of output, and not more**: with
    // fewer, the case runs the happy path and the test stays green with the `maxBuffer`
    // removed, so it verifies only one half. Measured with a mutation pass on the two guards.
    const muchos = Array.from({ length: 15_000 }, (_, i) => `export enum M${i} { a }`).join('\n');
    writeFileSync(join(repo, 'src/limpio.ts'), `${muchos}\n`);
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('truncated');
    expect(r.stderr.length).toBeLessThan(20_000);
  });

  it('the message ALWAYS says how to get out: without that, the reflex is to turn the hook off', () => {
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.stderr).toContain('pnpm lint');
    // And it must not read as a replacement of `verify`, which would be worse than no hook.
    expect(r.stderr).toContain('does not replace');
  });
});

describe('exits quiet when there is nothing to say', () => {
  it('a tree with no changes', () => {
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('a changed and clean file', () => {
    writeFileSync(join(repo, 'src/limpio.ts'), 'export const tres = 3;\n');
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('a turn that ONLY deletes: quiet, and not "could not run eslint"', () => {
    // The other half of the deleted-file case above, and the one that tells "filtered" from
    // "tried and failed": if the deleted file reached ESLint, the output would say that
    // eslint could not run.
    rmSync(join(repo, 'src/limpio.ts'));
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('a changed `.png`: it does not even try', () => {
    // **In the repo WITH NO ESLint**, which makes this case falsifiable: without the
    // extension filter the hook would look for a binary that does not exist, and would exit
    // saying that eslint is not installed. An empty output means it did not try.
    writeFileSync(join(repoSinEslint, 'src/captura.png'), 'export enum Malo { a }\n');
    const r = correr(repoSinEslint);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});

describe('lets the turn through when it could not decide, and says so', () => {
  it('the ESLint binary is missing', () => {
    // The default exit of every failure is to let the turn through and tell why: a hook that
    // blocks when it could not decide is turned off the first day its dependency fails.
    //
    // **This case found a real bug**, and it is why the hook asks for the binary before it
    // launches it: node starts anyway, does not find the module and exits with status 1, the
    // SAME that ESLint uses for "there are findings", with the "Cannot find module" on
    // stderr. Read as a finding, that **blocks the turn with a stack trace**, the opposite
    // of failing open.
    writeFileSync(join(repoSinEslint, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repoSinEslint);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('eslint is not installed');
  });

  it('the ESLint config is missing', () => {
    renameSync(join(repo, 'eslint.config.mjs'), join(repo, 'eslint.config.guardada'));
    try {
      writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
      const r = correr(repo);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('could not run eslint');
    } finally {
      renameSync(join(repo, 'eslint.config.guardada'), join(repo, 'eslint.config.mjs'));
    }
  });
});

describe('does not block itself', () => {
  it('`stop_hook_active: true` with a finding present: it still exits quiet', () => {
    // The anti-loop. Without this the hook blocks on its own block and the session never
    // ends. The platform stops it at eight attempts, but eight turns are already the session.
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repo, '{"hook_event_name":"Stop","stop_hook_active":true}');
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('the lock already taken: it lets the turn through, says so, and does not wait', () => {
    // With `SubagentStop` declared, N lanes end almost at once. The one that cannot take the
    // lock does not wait (to wait would spend the timeout to arrive late and say the same),
    // so this case must be fast even with a finding ready.
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    writeFileSync(LOCK, '999999');
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('another turn is linting');
  });

  it('and the lock is released after each run', () => {
    // If it were not released, the hook would say "another turn is linting" for a whole
    // minute: mute, green, with no warning.
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    expect(correr(repo).code).toBe(2);
    expect(existsSync(LOCK)).toBe(false);
  });
});
