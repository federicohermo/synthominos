import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isMutated, mutationTarget, mutationTargetCommand, realMutationSystem, sameCode, type MutationSystem } from '../mutation.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { mutate: MUTATE } = JSON.parse(readFileSync(path.join(ROOT, 'stryker.config.json'), 'utf8')) as { mutate: string[] };

function fakeSystem(changed: string[] | null, versions: Record<string, readonly [before: string, now: string]> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const bases: string[] = [];
  const sys: MutationSystem = {
    changed: base => { bases.push(base); return changed; },
    before: (_, file) => versions[file]?.[0] ?? null,
    now: file => versions[file][1],
    config: () => JSON.stringify({ mutate: ['src/**/*.ts', '!src/**/__tests__/**'] }),
    out: line => out.push(line),
    err: line => err.push(line),
  };
  return { sys, out, err, bases };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../mutation.ts');
  process.exitCode = undefined;
});

describe('isMutated: the `mutate` list of this repo', () => {
  it.each([
    'src/circuit/sequence.ts', 'src/pieces/transform.ts', 'src/playback/scheduler.ts', 'src/accessibility/cell-name.ts',
    '.spec-anchored/kernel.ts', '.spec-anchored/pyjson.ts', '.spec-anchored/cli.ts',
  ])('%s is in the target', file => {
    expect(isMutated(file, MUTATE)).toBe(true);
  });

  it.each([
    // Only Chromium covers these six, and Stryker cannot run the browser project.
    'src/board-editing/use-input.ts', 'src/board-fit/use-grid.ts', 'src/playback/engine.ts', 'src/playback/playhead-loop.ts',
    'src/playback/use-engine.ts', 'src/spectrum/spectrum-loop.ts',
    'src/board-editing/Board.tsx', 'src/circuit/__tests__/sequence.test.ts', 'src/vite-env.d.ts', '.spec-anchored/spec-anchored.ts',
    '.spec-anchored/__tests__/kernel.test.ts', 'mcp-server/src/symbols.ts', '.agents/scripts/copies.ts', 'vite.config.ts',
  ])('%s is not in the target', file => {
    expect(isMutated(file, MUTATE)).toBe(false);
  });

  it('a list with no negated pattern takes every match', () => {
    expect(isMutated('src/a/__tests__/x.test.ts', ['src/**/*.ts'])).toBe(true);
  });
});

describe('mutationTarget', () => {
  it('splits the changed files: eligible, product code left out, and the rest in neither', () => {
    const changed = [
      'src/circuit/sequence.ts', 'src/circuit/__tests__/sequence.test.ts', 'src/playback/engine.ts', 'src/panels/TransportPanel.tsx',
      'mcp-server/src/symbols.ts', 'mcp-server/src/__tests__/symbols.test.ts', 'src/vite-env.d.ts', 'docs/README.md', '.spec-anchored/kernel.ts',
    ];
    expect(mutationTarget(changed, MUTATE)).toEqual({
      eligible: ['src/circuit/sequence.ts', '.spec-anchored/kernel.ts'],
      notEligible: ['src/playback/engine.ts', 'src/panels/TransportPanel.tsx', 'mcp-server/src/symbols.ts'],
    });
  });

  it('no changed file gives an empty target', () => {
    expect(mutationTarget([], MUTATE)).toEqual({ eligible: [], notEligible: [] });
  });
});

describe('sameCode: two versions of a file, comments and layout aside', () => {
  const code = 'export const f = (x: number) => {\n  return `${x}//${x}`;\n};\n';

  it('a comment and the layout are not code', () => {
    const commented = '/** What it is. */\nexport const f = (x: number) => { // why\n  return `${x}//${x}`; };\n';
    expect(sameCode(code, commented, 'src/a.ts')).toBe(true);
    expect(sameCode(code, code.replaceAll('\n', '\r\n'), 'src/a.ts')).toBe(true);
  });

  it('the `//` of a template literal is code', () => {
    expect(sameCode(code, code.replace('//${x}', '//${x + 1}'), 'src/a.ts')).toBe(false);
  });

  it('a JSX comment is not code, and the JSX next to it is', () => {
    const jsx = (comment: string, text: string) => `const A = () => <div>{/* ${comment} */}<b>${text}</b></div>;`;
    expect(sameCode(jsx('the board', 'x'), jsx('the board, because the grid rules', 'x'), 'src/A.tsx')).toBe(true);
    expect(sameCode(jsx('the board', 'x'), jsx('the board', 'y'), 'src/A.tsx')).toBe(false);
  });

  it('a file that is not TypeScript is compared as text', () => {
    expect(sameCode('{"a": 1}', '{"a": 1}', 'package.json')).toBe(true);
    expect(sameCode('{"a": 1}', '{ "a": 1 }', 'package.json')).toBe(false);
  });
});

describe('mutationTargetCommand', () => {
  it('prints the eligible files on one line, for `stryker run --mutate`', () => {
    const { sys, out, bases } = fakeSystem(['src/a.ts', 'src/b.ts', 'src/__tests__/a.test.ts', 'README.md']);
    expect(mutationTargetCommand(['origin/staging'], sys)).toBe(0);
    expect(out).toEqual(['src/a.ts,src/b.ts']);
    expect(bases).toEqual(['origin/staging']);
  });

  it('a file where only a comment changed is not in the target, and not in the report', () => {
    const { sys, out } = fakeSystem(['src/a.ts', 'src/b.ts', 'src/Panel.tsx'], {
      'src/a.ts': ['const a = 1;\n', '// the reason\nconst a = 1;\n'],
      'src/b.ts': ['const b = 1;\n', 'const b = 2;\n'],
      'src/Panel.tsx': ['const P = () => <i>{/* uno */}</i>;\n', 'const P = () => <i>{/* one, because */}</i>;\n'],
    });
    expect(mutationTargetCommand(['origin/staging', '--report'], sys)).toBe(0);
    expect(JSON.parse(out.join('\n'))).toEqual({ eligible: ['src/b.ts'], notEligible: [] });
  });

  it('prints an empty line when nothing is eligible', () => {
    const { sys, out } = fakeSystem(['README.md']);
    expect(mutationTargetCommand(['origin/staging'], sys)).toBe(0);
    expect(out).toEqual(['']);
  });

  it('`--report` prints both lists as JSON', () => {
    const { sys, out } = fakeSystem(['src/a.ts', 'src/Panel.tsx']);
    expect(mutationTargetCommand(['HEAD~1', '--report'], sys)).toBe(0);
    expect(JSON.parse(out.join('\n'))).toEqual({ eligible: ['src/a.ts'], notEligible: ['src/Panel.tsx'] });
  });

  it.each([[[]], [['a', 'b', 'c']], [['a', '--json']]])('a wrong call exits 2: %j', args => {
    const { sys, err, out } = fakeSystem([]);
    expect(mutationTargetCommand(args, sys)).toBe(2);
    expect(err).toEqual(['usage: node .agents/scripts/mutation-target.ts <base> [--report]']);
    expect(out).toEqual([]);
  });

  it('a base that git refuses exits 1', () => {
    const { sys, err } = fakeSystem(null);
    expect(mutationTargetCommand(['no-such-ref'], sys)).toBe(1);
    expect(err).toEqual(['git cannot diff against `no-such-ref`']);
  });
});

describe('realMutationSystem', () => {
  it('reads the real config, and asks the real git', () => {
    const sys = realMutationSystem(ROOT);
    expect((JSON.parse(sys.config()) as { mutate: string[] }).mutate).toEqual(MUTATE);
    expect(sys.changed('HEAD')).toEqual([]);
    expect(sys.changed('no-such-ref-for-the-mutation-test')).toBeNull();
    expect(sys.before('HEAD', 'stryker.config.json')).toContain('"mutate"');
    expect(sys.before('HEAD', 'no-such-file-for-the-mutation-test.ts')).toBeNull();
    expect(sys.now('stryker.config.json')).toContain('"mutate"');
  });

  it('writes to the two standard streams', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sys = realMutationSystem();
    sys.out('a');
    sys.err('b');
    expect(log).toHaveBeenCalledWith('a');
    expect(error).toHaveBeenCalledWith('b');
    log.mockRestore();
    error.mockRestore();
  });
});

describe('mutation-target.ts', () => {
  it('returns the exit code of the command', async () => {
    vi.doMock('../mutation.ts', () => ({ mutationTargetCommand: () => 2, realMutationSystem: () => ({}) }));
    await import('../mutation-target.ts');
    expect(process.exitCode).toBe(2);
  });

  it('for real: against HEAD nothing changed, so the line is empty', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, '.agents/scripts/mutation-target.ts'), 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toBe('\n');
  });
});
