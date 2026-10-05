import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** v8 does not measure a subprocess: the entrypoints are imported in-process, and run once for real. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, '../hook.ts');

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../system.ts');
  vi.doUnmock('../worktrees.ts');
  vi.doUnmock('../copies.ts');
  vi.doUnmock('../proofs.ts');
  vi.doUnmock('../browser.ts');
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
    const payload = JSON.stringify({ cwd: process.cwd(), tool_name: 'Bash', tool_input: { command: 'git worktree add ../afuera-del-repo' } });
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

describe('prove.ts and doctor.ts', () => {
  const mock = () => {
    vi.doMock('../proofs.ts', () => ({ prove: () => Promise.resolve(1), doctor: () => Promise.resolve(2) }));
    vi.doMock('../browser.ts', () => ({ realProveSystem: () => ({}) }));
  };

  it('prove.ts returns the exit code of the proof', async () => {
    mock();
    await import('../prove.ts');
    expect(process.exitCode).toBe(1);
  });

  it('doctor.ts returns the exit code of the doctor', async () => {
    mock();
    await import('../doctor.ts');
    expect(process.exitCode).toBe(2);
  });
});
