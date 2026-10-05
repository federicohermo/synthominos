import { describe, it, expect } from 'vitest';
import path from 'node:path';
import type { Git } from '../policy.ts';
import { PR_TOOL, commandIntent, encode, handle, patchPaths, readIntent, segments } from '../protocol.ts';
import type { RunStore } from '../run-gate.ts';

/** The Codex payloads were captured from Codex CLI 0.160 on Windows. Claude's come from its hooks documentation. */

const CWD = 'D:\\repo';
const w = path.win32;

const writesOf = (command: string, cwd = CWD) => commandIntent(command, cwd, w).writes;

describe('segments: quotes, separators and redirections', () => {
  it('honors quotes and splits on the five separators', () => {
    const texts = segments(`a 'b c' "d" && e || f | g; h\ni & j`).map(s => s.map(x => x.text));
    expect(texts).toEqual([['a', 'b c', 'd'], ['e'], ['f'], ['g'], ['h'], ['i'], ['j']]);
  });
  it('marks the word after > and >>, glued or spaced', () => {
    const [s] = segments('echo hola>a.txt >> "b c.txt"');
    expect(s.filter(x => x.redirect).map(x => x.text)).toEqual(['a.txt', 'b c.txt']);
  });
  it('2>&1 and >&2 duplicate a descriptor and write nothing', () => {
    const [s] = segments('cmd 2>&1 >&2 x');
    expect(s).toEqual([{ text: 'cmd', redirect: false }, { text: 'x', redirect: false }]);
  });
  it('a glued descriptor (2>) is not a word of the command', () => {
    const [s] = segments('cmd 2>err.log');
    expect(s).toEqual([{ text: 'cmd', redirect: false }, { text: 'err.log', redirect: true }]);
  });
  it('an empty quote is a word', () => {
    expect(segments(`echo ''`)[0]).toHaveLength(2);
  });
  it('an empty command has no segments', () => {
    expect(segments('   ')).toEqual([]);
  });
});

describe('segments: a heredoc body is text, not a command', () => {
  it('a body line marks no redirection, and the delimiter is not a word', () => {
    expect(segments("cat <<'EOF'\n- new files + tests -> src/x.ts\nEOF")).toEqual([[{ text: 'cat', redirect: false }]]);
  });
  it('a redirection on the line of the << still writes', () => {
    expect(writesOf("cat <<'EOF' > src/a.ts\n-> src/x.ts\nEOF")).toEqual(['D:\\repo\\src\\a.ts']);
  });
  it.each([
    ["<<'EOF'", 'EOF'],
    ['<<"EOF"', 'EOF'],
    ['<<\\EOF', 'EOF'],
    ['<< EOF', 'EOF'],
    ['<<-EOF', '\t\tEOF'],
  ])('%s: the body ends at the line that equals the delimiter', (open, close) => {
    expect(writesOf(`cat ${open}\n-> src/x.ts\n${close}\necho y > src/b.ts`)).toEqual(['D:\\repo\\src\\b.ts']);
  });
  it('only <<- lets the closing line start with tabs', () => {
    expect(writesOf('cat <<EOF\n-> src/x.ts\n\tEOF\necho y > src/b.ts')).toEqual([]);
  });
  it('the line after the closing line is a command again: its redirection writes', () => {
    expect(writesOf("cat <<'EOF' > /tmp/n.md\n-> src/x.ts\nEOF\necho y > src/b.ts")).toEqual(['D:\\tmp\\n.md', 'D:\\repo\\src\\b.ts']);
  });
  it('two heredocs on one line: their bodies follow in order', () => {
    const command = "cat <<A > /tmp/a; cat <<'B' > /tmp/b\n-> src/x.ts\nA\n-> src/y.ts\nB\necho y > src/b.ts";
    expect(writesOf(command)).toEqual(['D:\\tmp\\a', 'D:\\tmp\\b', 'D:\\repo\\src\\b.ts']);
  });
  it('a heredoc that never closes: the rest of the command is its body', () => {
    expect(writesOf("cat <<'EOF' > /tmp/n.md\n-> src/x.ts\necho y > src/b.ts")).toEqual(['D:\\tmp\\n.md']);
  });
  it('a here-string (<<<) has no body: the next line is a command', () => {
    expect(writesOf('cat <<<EOF > /tmp/a\necho y > src/b.ts\ncat <<EOF\n-> src/x.ts\nEOF')).toEqual(['D:\\tmp\\a', 'D:\\repo\\src\\b.ts']);
  });
  it.each([
    "bash <<'EOF'",
    "cat <<'EOF' | bash",
    'sh -s <<EOF',
    "/usr/bin/zsh <<'EOF'",
    "cat <<'EOF' | PowerShell.exe -Command -",
  ])('%s: a shell reads the body as a script, so its lines are commands', open => {
    expect(writesOf(`${open}\nrm -rf src\nEOF`)).toEqual(['D:\\repo\\src']);
  });
  it('the closing line of a script body is not a word', () => {
    const bash = [{ text: 'bash', redirect: false }];
    const rm = [{ text: 'rm', redirect: false }, { text: '-rf', redirect: false }, { text: 'src', redirect: false }];
    expect(segments("bash <<'EOF'\nrm -rf src\nEOF")).toEqual([bash, rm]);
  });
  it('only a shell on the line of the << makes its body a script', () => {
    const command = "bash x.sh\ncat <<'EOF' > /tmp/n.md\n-> src/x.ts\nEOF\nbash <<'EOF'\nrm -rf src\nEOF";
    expect(writesOf(command)).toEqual(['D:\\tmp\\n.md', 'D:\\repo\\src']);
  });
});

describe('segments: a comment is not a command', () => {
  it('a # that starts a word comments out the rest of the line', () => {
    expect(segments('echo hi # see -> src/x')).toEqual([[{ text: 'echo', redirect: false }, { text: 'hi', redirect: false }]]);
  });
  it.each([
    'git log a#b > out.txt # -> src/x',
    'echo $# > out.txt # -> src/x',
    'curl https://example.org/a#top > out.txt # -> src/x',
  ])('a # inside a word is not a comment: %s', command => {
    expect(writesOf(command)).toEqual(['D:\\repo\\out.txt']);
  });
  it('a # inside quotes is text', () => {
    const words = [{ text: 'echo', redirect: false }, { text: 'see # -> src/x', redirect: false }, { text: 'out.txt', redirect: true }];
    expect(segments('echo "see # -> src/x" > out.txt # -> src/y')).toEqual([words]);
  });
  it('a comment does not end a heredoc body early, in data or in a script', () => {
    expect(writesOf("cat <<'EOF' > /tmp/n.md # -> src/a\n# EOF\n- tests -> src/x\nEOF\necho y > src/b.ts")).toEqual(['D:\\tmp\\n.md', 'D:\\repo\\src\\b.ts']);
    expect(writesOf("bash <<'EOF' # run it\n# EOF\nrm -rf src\nEOF")).toEqual(['D:\\repo\\src']);
  });
});

describe('commandIntent: what it writes', () => {
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

  it('follows each cd: the bug that let `cd src && sed -i` through', () => {
    expect(writesOf('cd src; echo x > y.ts')).toEqual(['D:\\repo\\src\\y.ts']);
    expect(writesOf('Set-Location -Path src && echo x > y.ts')).toEqual(['D:\\repo\\src\\y.ts']);
    expect(writesOf('cd - && echo x > y.ts')).toEqual(['D:\\repo\\y.ts']);
    expect(writesOf('cd && echo x > y.ts')).toEqual(['D:\\repo\\y.ts']);
  });
  it('translates Git Bash paths on Windows and keeps them on POSIX', () => {
    expect(writesOf('echo x > /d/repo/src/a.ts', 'C:\\otro')).toEqual(['D:\\repo\\src\\a.ts']);
    expect(commandIntent('echo x > /d/a', '/home', path.posix).writes).toEqual(['/d/a']);
  });
  it('a bare redirection, with no command, still writes', () => {
    expect(writesOf('cmd &> src/log')).toEqual(['D:\\repo\\src\\log']);
  });
});

describe('commandIntent: which worktrees it opens', () => {
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
  it('adds, updates, deletes and moves', () => {
    const patch = '*** Begin Patch\n*** Add File: a.ts\n+x\n*** Update File: b.ts\n*** Move to: c.ts\n*** Delete File: d.ts \n*** End Patch';
    expect(patchPaths(patch)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
  });
});

describe('readIntent: the real payloads', () => {
  const payload = (o: object) => JSON.stringify({ session_id: 's', hook_event_name: 'PreToolUse', cwd: CWD, ...o });

  it('Codex, apply_patch: the patch travels in tool_input.command', () => {
    const raw = payload({ tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Add File: lib/b.txt\n+uno\n*** End Patch' } });
    expect(readIntent(raw, w)).toEqual({ writes: ['D:\\repo\\lib\\b.txt'], worktrees: [], pullRequests: [] });
  });
  it('Codex, Bash: the command is a string (PowerShell on Windows)', () => {
    const raw = payload({ tool_name: 'Bash', tool_input: { command: 'cd lib; echo tres > c.txt' } });
    expect(readIntent(raw, w)?.writes).toEqual(['D:\\repo\\lib\\c.txt']);
  });
  it('an argv-shaped command is read too', () => {
    const raw = payload({ tool_name: 'Bash', tool_input: { command: ['rm', 'src/x'] } });
    expect(readIntent(raw, w)?.writes).toEqual(['D:\\repo\\src\\x']);
  });
  it('Claude, Edit and NotebookEdit: the file path', () => {
    expect(readIntent(payload({ tool_name: 'Edit', tool_input: { file_path: 'D:\\repo\\src\\a.ts' } }), w)?.writes).toEqual(['D:\\repo\\src\\a.ts']);
    expect(readIntent(payload({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'n.ipynb', file_path: '' } }), w)?.writes).toEqual(['D:\\repo\\n.ipynb']);
  });
  it('a tool that does not write writes nothing, even with a file_path', () => {
    expect(readIntent(payload({ tool_name: 'Read', tool_input: { file_path: 'src/a.ts' } }), w)).toEqual({ writes: [], worktrees: [], pullRequests: [] });
  });
  it('a patch inside a Bash call counts too', () => {
    const raw = payload({ tool_name: 'Bash', tool_input: { command: "apply_patch <<'EOF'\n*** Begin Patch\n*** Update File: src/a.ts\n*** End Patch\nEOF" } });
    expect(readIntent(raw, w)?.writes).toContain('D:\\repo\\src\\a.ts');
  });
  it.each(['not json', '[]', JSON.stringify({ tool_input: {} }), JSON.stringify({ cwd: CWD, tool_input: [] })])('unreadable: %s', raw => {
    expect(readIntent(raw, w)).toBeNull();
  });
  it('without tool_name it checks nothing', () => {
    expect(readIntent(JSON.stringify({ cwd: CWD, tool_input: { command: 'rm src' } }), w)).toEqual({ writes: [], worktrees: [], pullRequests: [] });
  });
});

describe('encode: one way to deny, honored by both', () => {
  it('a denial is the permissionDecision JSON, for both', () => {
    for (const agent of ['claude', 'codex'] as const) {
      const r = encode({ kind: 'deny', reason: 'no' }, agent);
      expect(JSON.parse(r.stdout)).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'no' } });
    }
  });
  it('a warning goes to systemMessage on Claude and to stderr on Codex', () => {
    expect(encode({ kind: 'warn', reason: 'ojo' }, 'claude')).toEqual({ stdout: '{"systemMessage":"ojo"}', stderr: '' });
    expect(encode({ kind: 'warn', reason: 'ojo' }, 'codex')).toEqual({ stdout: '', stderr: 'ojo' });
  });
  it('no opinion says nothing: never an allow', () => {
    expect(encode({ kind: 'no-opinion' }, 'claude')).toEqual({ stdout: '', stderr: '' });
  });
});

describe('commandIntent: which pull requests it opens', () => {
  const opens = (command: string) => commandIntent(command, CWD, w).pullRequests;

  it.each([
    ['gh pr create --base staging', [{ cwd: CWD, head: null }]],
    ['"/c/Program Files/GitHub CLI/gh.exe" pr create --head feature/x', [{ cwd: CWD, head: 'feature/x' }]],
    ['gh pr create -H fork:bugfix/y', [{ cwd: CWD, head: 'bugfix/y' }]],
    ['gh pr create --head=refactor/z', [{ cwd: CWD, head: 'refactor/z' }]],
    ['gh pr create --head', [{ cwd: CWD, head: null }]],
    ['gh pr new --head improvement/w', [{ cwd: CWD, head: 'improvement/w' }]],
    ['cd .claude/worktrees/a && gh pr create', [{ cwd: 'D:\\repo\\.claude\\worktrees\\a', head: null }]],
    ['gh pr view 12', []],
    ['gh issue create', []],
  ])('%s', (command, expected) => {
    expect(opens(command)).toEqual(expected);
  });

  it('the GitHub tool opens one too, with the head it names or none', () => {
    const call = (input: object) => readIntent(JSON.stringify({ cwd: CWD, tool_name: PR_TOOL, tool_input: input }), w)?.pullRequests;
    expect(call({ head: 'feature/x', base: 'staging' })).toEqual([{ cwd: CWD, head: 'feature/x' }]);
    expect(call({ base: 'staging' })).toEqual([{ cwd: CWD, head: null }]);
  });
});

describe('handle', () => {
  const NO_RUNS: RunStore = { list: () => [], read: () => null, diff: () => null };
  const git: Git = { paths: w, ownCheckout: () => CWD, treeOf: () => CWD, mainCheckoutOf: () => CWD, branchOf: () => 'probe' };

  it('a call that no rule has an opinion on gets no output', () => {
    const read = JSON.stringify({ cwd: CWD, tool_name: 'Bash', tool_input: { command: 'git status' } });
    expect(handle([], read, git, NO_RUNS)).toEqual({ stdout: '', stderr: '' });
  });

  it('a pull request of a product branch with no run is warned, and a write that is denied still wins', () => {
    const onFeature: Git = { ...git, branchOf: () => 'feature/x' };
    const pr = JSON.stringify({ cwd: CWD, tool_name: 'Bash', tool_input: { command: 'gh pr create' } });
    expect(handle(['codex'], pr, onFeature, NO_RUNS).stderr).toMatch(/^run gate: the branch `feature\/x` has no run/);
    const both = JSON.stringify({ cwd: CWD, tool_name: 'Bash', tool_input: { command: 'echo x > src/a.ts && gh pr create --head feature/x' } });
    expect(JSON.parse(handle(['codex'], both, git, NO_RUNS).stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });
  const raw = JSON.stringify({ cwd: CWD, tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } });

  it('decides and encodes for the agent named by the argument', () => {
    expect(JSON.parse(handle(['codex'], raw, git, NO_RUNS).stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });
  it('without an argument it is Claude, and an unreadable payload is warned', () => {
    expect(handle([], 'x', git, NO_RUNS).stdout).toMatch(/systemMessage.*unreadable/);
  });
  it('a heredoc that writes a note outside src/ is not denied for the arrow in its body', () => {
    const command = "cat >> /tmp/scratchpad/notes.md <<'EOF'\n- new files + tests -> src/panels/; ...\nEOF";
    expect(handle(['claude'], JSON.stringify({ cwd: CWD, tool_name: 'Bash', tool_input: { command } }), git)).toEqual({ stdout: '', stderr: '' });
  });
  it('a heredoc that a shell reads is a script: its rm of src/ is denied', () => {
    const command = "bash <<'EOF'\nrm -rf src\nEOF";
    expect(handle(['claude'], JSON.stringify({ cwd: CWD, tool_name: 'Bash', tool_input: { command } }), git).stdout).toMatch(/"permissionDecision":"deny"/);
  });
  it('never throws: an error becomes a warning', () => {
    const broken: Git = { ...git, get paths(): never { throw new Error('boom'); } };
    expect(handle(['codex'], raw, broken, NO_RUNS)).toEqual({ stdout: '', stderr: 'hook: could not run and let the call through: Error: boom' });
  });
});
