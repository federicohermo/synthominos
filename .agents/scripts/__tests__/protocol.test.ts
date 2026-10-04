import { describe, it, expect } from 'vitest';
import path from 'node:path';
import type { Git } from '../policy.ts';
import { commandIntent, encode, handle, patchPaths, readIntent, segments } from '../protocol.ts';

/**
 * Los payloads de abajo son los que mandan los harnesses de verdad: los de Codex se capturaron
 * con un hook espía el 2026-10-04 (Codex CLI 0.160, Windows), y los de Claude salen de su
 * documentación de hooks.
 */

const CWD = 'D:\\repo';
const w = path.win32;

const writesOf = (command: string, cwd = CWD) => commandIntent(command, cwd, w).writes;

describe('segments: comillas, separadores y redirecciones', () => {
  it('respeta las comillas y corta por los cinco separadores', () => {
    const texts = segments(`a 'b c' "d" && e || f | g; h\ni & j`).map(s => s.map(x => x.text));
    expect(texts).toEqual([['a', 'b c', 'd'], ['e'], ['f'], ['g'], ['h'], ['i'], ['j']]);
  });
  it('marca la palabra que sigue a > y a >>, pegada o separada', () => {
    const [s] = segments('echo hola>a.txt >> "b c.txt"');
    expect(s.filter(x => x.redirect).map(x => x.text)).toEqual(['a.txt', 'b c.txt']);
  });
  it('2>&1 y >&2 duplican un descriptor y no escriben nada', () => {
    const [s] = segments('cmd 2>&1 >&2 x');
    expect(s).toEqual([{ text: 'cmd', redirect: false }, { text: 'x', redirect: false }]);
  });
  it('el descriptor pegado (2>) no es una palabra del comando', () => {
    const [s] = segments('cmd 2>err.log');
    expect(s).toEqual([{ text: 'cmd', redirect: false }, { text: 'err.log', redirect: true }]);
  });
  it('una comilla vacía es una palabra', () => {
    expect(segments(`echo ''`)[0]).toHaveLength(2);
  });
  it('un comando vacío no tiene segmentos', () => {
    expect(segments('   ')).toEqual([]);
  });
});

describe('commandIntent: qué escribe', () => {
  it.each([
    ['echo x > src/a.ts', ['D:\\repo\\src\\a.ts']],
    ['echo x 2> $null', []],
    ['echo x > /dev/null', []],
    ['tee -a src/a.ts src/b.ts', ['D:\\repo\\src\\a.ts', 'D:\\repo\\src\\b.ts']],
    ['cp -r docs/a src/b', ['D:\\repo\\src\\b']],
    ['mv a src/b', ['D:\\repo\\src\\b']],
    ['rm -rf src', ['D:\\repo\\src']],
    ['sed -i s/a/b/ src/a.ts', ['D:\\repo\\s\\a\\b', 'D:\\repo\\src\\a.ts']],
    ['sed s/a/b/ src/a.ts', []],
    ['/usr/bin/touch src/a.ts', ['D:\\repo\\src\\a.ts']],
    ['mkdir -p src/x', ['D:\\repo\\src\\x']],
    ['rmdir src/x', ['D:\\repo\\src\\x']],
    ['truncate -s 0 src/a.ts', ['D:\\repo\\0', 'D:\\repo\\src\\a.ts']],
    ['Set-Content -Path src/a.ts -Value x', ['D:\\repo\\src\\a.ts']],
    ['Remove-Item -Force src', ['D:\\repo\\src']],
    ['Copy-Item src/a.ts C:/tmp/a.ts', ['C:\\tmp\\a.ts']],
    ['cpi a -Destination src/b', ['D:\\repo\\src\\b']],
    ['git status', []],
    ['ls -la', []],
  ])('%s', (command, expected) => {
    expect(writesOf(command)).toEqual(expected);
  });

  it('sigue los cd: el bug que dejaba pasar `cd src && sed -i`', () => {
    expect(writesOf('cd src; echo x > y.ts')).toEqual(['D:\\repo\\src\\y.ts']);
    expect(writesOf('Set-Location -Path src && echo x > y.ts')).toEqual(['D:\\repo\\src\\y.ts']);
    expect(writesOf('cd - && echo x > y.ts')).toEqual(['D:\\repo\\y.ts']);
    expect(writesOf('cd && echo x > y.ts')).toEqual(['D:\\repo\\y.ts']);
  });
  it('traduce las rutas de Git Bash en Windows y las deja en POSIX', () => {
    expect(writesOf('echo x > /d/repo/src/a.ts', 'C:\\otro')).toEqual(['D:\\repo\\src\\a.ts']);
    expect(commandIntent('echo x > /d/a', '/home', path.posix).writes).toEqual(['/d/a']);
  });
  it('una redirección sola, sin comando, igual escribe', () => {
    expect(writesOf('cmd &> src/log')).toEqual(['D:\\repo\\src\\log']);
  });
});

describe('commandIntent: qué worktrees abre', () => {
  const opens = (command: string) => commandIntent(command, CWD, w).worktrees;

  it.each([
    ['git worktree add ../afuera', [{ gitDir: CWD, target: 'D:\\afuera' }]],
    ['git -C .. -c a=b --no-pager worktree add -b nueva x', [{ gitDir: 'D:\\', target: 'D:\\x' }]],
    ['git worktree add --detach -B r .claude/worktrees/y', [{ gitDir: CWD, target: 'D:\\repo\\.claude\\worktrees\\y' }]],
    ['cd .. && git worktree add z', [{ gitDir: 'D:\\', target: 'D:\\z' }]],
    ['git worktree add -b sola', []],
    ['git worktree list', []],
    ['git -C', []],
  ])('%s', (command, expected) => {
    expect(opens(command)).toEqual(expected);
  });
});

describe('patchPaths', () => {
  it('agrega, cambia, borra y mueve', () => {
    const patch = '*** Begin Patch\n*** Add File: a.ts\n+x\n*** Update File: b.ts\n*** Move to: c.ts\n*** Delete File: d.ts \n*** End Patch';
    expect(patchPaths(patch)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
  });
});

describe('readIntent: los payloads reales', () => {
  const payload = (o: object) => JSON.stringify({ session_id: 's', hook_event_name: 'PreToolUse', cwd: CWD, ...o });

  it('Codex, apply_patch: el parche viaja en tool_input.command', () => {
    const raw = payload({ tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Add File: lib/b.txt\n+uno\n*** End Patch' } });
    expect(readIntent(raw, w)).toEqual({ writes: ['D:\\repo\\lib\\b.txt'], worktrees: [] });
  });
  it('Codex, Bash: el comando es un string (y en Windows es PowerShell)', () => {
    const raw = payload({ tool_name: 'Bash', tool_input: { command: 'cd lib; echo tres > c.txt' } });
    expect(readIntent(raw, w)?.writes).toEqual(['D:\\repo\\lib\\c.txt']);
  });
  it('un comando en forma de argv también se lee', () => {
    const raw = payload({ tool_name: 'Bash', tool_input: { command: ['rm', 'src/x'] } });
    expect(readIntent(raw, w)?.writes).toEqual(['D:\\repo\\src\\x']);
  });
  it('Claude, Edit y NotebookEdit: la ruta del archivo', () => {
    expect(readIntent(payload({ tool_name: 'Edit', tool_input: { file_path: 'D:\\repo\\src\\a.ts' } }), w)?.writes).toEqual(['D:\\repo\\src\\a.ts']);
    expect(readIntent(payload({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'n.ipynb', file_path: '' } }), w)?.writes).toEqual(['D:\\repo\\n.ipynb']);
  });
  it('una herramienta que no escribe no escribe, aunque tenga file_path', () => {
    expect(readIntent(payload({ tool_name: 'Read', tool_input: { file_path: 'src/a.ts' } }), w)).toEqual({ writes: [], worktrees: [] });
  });
  it('un parche adentro de un Bash también cuenta', () => {
    const raw = payload({ tool_name: 'Bash', tool_input: { command: "apply_patch <<'EOF'\n*** Begin Patch\n*** Update File: src/a.ts\n*** End Patch\nEOF" } });
    expect(readIntent(raw, w)?.writes).toContain('D:\\repo\\src\\a.ts');
  });
  it.each(['no es json', '[]', JSON.stringify({ tool_input: {} }), JSON.stringify({ cwd: CWD, tool_input: [] })])('ilegible: %s', raw => {
    expect(readIntent(raw, w)).toBeNull();
  });
  it('sin tool_name no mira nada', () => {
    expect(readIntent(JSON.stringify({ cwd: CWD, tool_input: { command: 'rm src' } }), w)).toEqual({ writes: [], worktrees: [] });
  });
});

describe('encode: una sola forma de rechazar, que los dos respetan', () => {
  it('denegar es el JSON de permissionDecision, en los dos', () => {
    for (const agent of ['claude', 'codex'] as const) {
      const r = encode({ kind: 'deny', reason: 'no' }, agent);
      expect(JSON.parse(r.stdout)).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'no' } });
    }
  });
  it('el aviso va por systemMessage en Claude y por stderr en Codex', () => {
    expect(encode({ kind: 'warn', reason: 'ojo' }, 'claude')).toEqual({ stdout: '{"systemMessage":"ojo"}', stderr: '' });
    expect(encode({ kind: 'warn', reason: 'ojo' }, 'codex')).toEqual({ stdout: '', stderr: 'ojo' });
  });
  it('sin opinión no dice nada: nunca un allow', () => {
    expect(encode({ kind: 'no-opinion' }, 'claude')).toEqual({ stdout: '', stderr: '' });
  });
});

describe('handle', () => {
  const git: Git = { paths: w, ownCheckout: () => CWD, treeOf: () => CWD, mainCheckoutOf: () => CWD, branchOf: () => 'probe' };
  const raw = JSON.stringify({ cwd: CWD, tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } });

  it('decide y codifica para el agente que nombra el argumento', () => {
    expect(JSON.parse(handle(['codex'], raw, git).stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });
  it('sin argumento es Claude, y un payload ilegible se avisa', () => {
    expect(handle([], 'x', git).stdout).toMatch(/systemMessage.*ilegible/);
  });
  it('nunca lanza: un error se vuelve aviso', () => {
    const broken: Git = { ...git, get paths(): never { throw new Error('boom'); } };
    expect(handle(['codex'], raw, broken)).toEqual({ stdout: '', stderr: 'hook: no pudo correr y dejó pasar: Error: boom' });
  });
});
