import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

// Each case that reaches ESLint starts a real process: 1.4 s idle, 6.1 s measured under `verify`.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK_REAL = resolve(AQUI, '../lint-al-cerrar.mjs');
const NODE_MODULES_REAL = resolve(AQUI, '../../../node_modules');

const LOCK = join(tmpdir(), 'pentomino-lint-al-cerrar.lock');

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

function fabricar(prefijo: string, conEslint: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), prefijo));
  mkdirSync(join(dir, '.claude/scripts'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });

  cpSync(HOOK_REAL, join(dir, '.claude/scripts/lint-al-cerrar.mjs'));
  writeFileSync(join(dir, 'src/limpio.ts'), 'export const dos = 2;\n');

  if (conEslint) {
    // `junction` works on Windows without administrator rights.
    symlinkSync(NODE_MODULES_REAL, join(dir, 'node_modules'), 'junction');
    writeFileSync(join(dir, 'eslint.config.mjs'), CONFIG);
  }

  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.email', 'hook@test');
  git('config', 'user.name', 'Hook');
  // Without this, `git ls-files --others` returns the whole dependency tree.
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
  git('add', '-A');
  git('commit', '-m', 'inicial', '--no-gpg-sign');
  return dir;
}

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
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('limpio.ts');
    expect(r.stderr).toContain('Zero enum');
  });

  it('a NEW untracked file, which `git diff` does not see', () => {
    writeFileSync(join(repo, 'src/nuevo.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('nuevo.ts');
  });

  it('a file DELETED in the same turn does not turn off the check of the rest', () => {
    rmSync(join(repo, 'src/limpio.ts'));
    writeFileSync(join(repo, 'src/nuevo.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('nuevo.ts');
  });

  it('a file with an accent in its name: git quotes it, and the hook still sees it', () => {
    writeFileSync(join(repo, 'src/sesión.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Zero enum');
  });

  it('a huge output is truncated, not dumped whole and not lost', () => {
    // The count is chosen to pass 1 MiB of output: with fewer, the test passes with the
    // `maxBuffer` removed.
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
    rmSync(join(repo, 'src/limpio.ts'));
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('a changed `.png`: it does not even try', () => {
    // The repo with no ESLint: an empty output proves that the hook did not try.
    writeFileSync(join(repoSinEslint, 'src/captura.png'), 'export enum Malo { a }\n');
    const r = correr(repoSinEslint);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});

describe('lets the turn through when it could not decide, and says so', () => {
  it('the ESLint binary is missing', () => {
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
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repo, '{"hook_event_name":"Stop","stop_hook_active":true}');
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('the lock already taken: it lets the turn through, says so, and does not wait', () => {
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    writeFileSync(LOCK, '999999');
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('another turn is linting');
  });

  it('and the lock is released after each run', () => {
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    expect(correr(repo).code).toBe(2);
    expect(existsSync(LOCK)).toBe(false);
  });
});
