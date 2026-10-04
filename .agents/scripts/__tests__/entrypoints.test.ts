import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Los dos puntos de entrada. Se importan en el mismo proceso con sus bordes simulados, porque v8
 * no mide un subproceso; y además se corren UNA vez de verdad, como los corre cada harness, que
 * es lo único que prueba que la ruta y los argumentos de los hooks andan.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, '../hook.ts');

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../system.ts');
  vi.doUnmock('../worktrees.ts');
  process.exitCode = undefined;
});

describe('hook.ts', () => {
  it('lee stdin, decide y responde', async () => {
    const respond = vi.fn();
    vi.doMock('../system.ts', () => ({
      readInput: () => 'no es json',
      realGit: () => ({ paths: path.posix }),
      respond,
    }));
    await import('../hook.ts');
    expect(respond).toHaveBeenCalledWith({ stdout: expect.stringMatching(/ilegible/) as string, stderr: '' });
  });

  it('de verdad, como lo llama Codex: un worktree afuera se rechaza', () => {
    const payload = JSON.stringify({ cwd: process.cwd(), tool_name: 'Bash', tool_input: { command: 'git worktree add ../afuera-del-repo' } });
    const out = execFileSync(process.execPath, [HOOK, 'codex'], { input: payload, encoding: 'utf8' });
    expect(JSON.parse(out)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });
});

describe('clean-worktrees.ts', () => {
  it('devuelve el código del limpiador', async () => {
    vi.doMock('../worktrees.ts', () => ({ clean: () => 2, realMachine: () => ({}) }));
    await import('../clean-worktrees.ts');
    expect(process.exitCode).toBe(2);
  });
});
