import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The two entrypoints. They are imported in-process with mocked edges, because v8 does not
 * measure a subprocess. They also run ONCE for real, the way each harness runs them: only that
 * proves the hook path and arguments work.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, '../hook.ts');

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../system.ts');
  vi.doUnmock('../worktrees.ts');
  vi.doUnmock('../copies.ts');
  process.exitCode = undefined;
});

describe('hook.ts', () => {
  it('reads stdin, decides and responds', async () => {
    const respond = vi.fn();
    vi.doMock('../system.ts', () => ({
      readInput: () => 'not json',
      realGit: () => ({ paths: path.posix }),
      respond,
    }));
    await import('../hook.ts');
    expect(respond).toHaveBeenCalledWith({ stdout: expect.stringMatching(/unreadable/) as string, stderr: '' });
  });

  it('for real, as Codex calls it: a worktree outside is denied', () => {
    // Two levels: run from a worktree under `.claude/worktrees/`, a `../x` target is a valid sibling.
    const payload = JSON.stringify({ cwd: process.cwd(), tool_name: 'Bash', tool_input: { command: 'git worktree add ../outside/worktree' } });
    const out = execFileSync(process.execPath, [HOOK, 'codex'], { input: payload, encoding: 'utf8' });
    expect(JSON.parse(out)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });
});

describe('clean-worktrees.ts', () => {
  it('returns the cleaner\'s exit code', async () => {
    vi.doMock('../worktrees.ts', () => ({ clean: () => 2, realMachine: () => ({}) }));
    await import('../clean-worktrees.ts');
    expect(process.exitCode).toBe(2);
  });
});

describe('sync.ts', () => {
  it('returns the exit code of the copy check', async () => {
    vi.doMock('../copies.ts', () => ({ sync: () => 1, realDisk: () => ({}) }));
    await import('../sync.ts');
    expect(process.exitCode).toBe(1);
  });
});
