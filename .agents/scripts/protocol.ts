import type { PlatformPath } from 'node:path';
import { decide, type Git, type Intent, type Verdict } from './policy.ts';
import { pullRequestRule, type RunStore } from './run-gate.ts';

// Codex treats exit code 2 as a broken hook and lets the call through: a denial is JSON only.
// `allow` is never emitted: in Claude Code it skips the permission system.

export type Agent = 'claude' | 'codex';
export interface Response { readonly stdout: string; readonly stderr: string }

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
export const PR_TOOL = 'mcp__github__create_pull_request';
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/** Git Bash's `/d/Users/…` is `D:/Users/…` on Windows. POSIX paths stay as they are. */
function native(paths: PlatformPath, target: string): string {
  if (paths.sep !== '\\') return target;
  return target.replace(/^\/([a-zA-Z])(?=\/|$)/, (_, drive: string) => `${drive.toUpperCase()}:`);
}

const resolveFrom = (paths: PlatformPath, cwd: string, target: string) => paths.resolve(cwd, native(paths, target));

// Detection, not a parser: a gate that parses shell blocks what it should not.
// Codex sends PowerShell under the tool name `Bash`: both syntaxes are always checked.

export interface Word { readonly text: string; readonly redirect: boolean }

export function segments(command: string): Word[][] {
  const result: Word[][] = [];
  let current: Word[] = [];
  let word = '';
  let inWord = false;
  let quote: string | null = null;
  let redirect = false;

  const closeWord = () => {
    if (inWord) {
      current.push({ text: word, redirect });
      redirect = false;
    }
    word = '';
    inWord = false;
  };
  const closeSegment = () => {
    closeWord();
    if (current.length > 0) result.push(current);
    current = [];
    redirect = false;
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      inWord = true;
      continue;
    }
    if (c === '>') {
      if (inWord && /^\d$/.test(word)) inWord = false;
      closeWord();
      if (command[i + 1] === '>') i++;
      // `2>&1` and `>&2` duplicate a descriptor: they write no file.
      if (command[i + 1] === '&') {
        i++;
        while (i + 1 < command.length && /[\d-]/.test(command[i + 1])) i++;
        continue;
      }
      redirect = true;
      continue;
    }
    if (c === ';' || c === '\n' || c === '|' || c === '&') {
      closeSegment();
      continue;
    }
    if (/\s/.test(c)) {
      closeWord();
      continue;
    }
    word += c;
    inWord = true;
  }
  closeSegment();
  return result;
}

const programName = (word: string) => word.replace(/^.*[/\\]/, '').replace(/\.exe$/i, '').toLowerCase();

const WRITERS: Readonly<Record<string, (args: readonly string[], flags: readonly string[]) => readonly string[]>> = {
  tee: args => args,
  cp: args => args.slice(-1),
  mv: args => args.slice(-1),
  rm: args => args,
  rmdir: args => args,
  mkdir: args => args,
  touch: args => args,
  truncate: args => args,
  sed: (args, flags) => (flags.some(f => f.startsWith('-i')) ? args : []),
};

const CMDLETS: Readonly<Record<string, readonly [number, readonly string[]]>> = {
  'set-content': [0, ['-path', '-literalpath']],
  'add-content': [0, ['-path', '-literalpath']],
  'clear-content': [0, ['-path', '-literalpath']],
  'out-file': [0, ['-filepath', '-path', '-literalpath']],
  'new-item': [0, ['-path']],
  'remove-item': [0, ['-path', '-literalpath']],
  'copy-item': [1, ['-destination']],
  'move-item': [1, ['-destination']],
  'rename-item': [1, ['-newname']],
};
const ALIASES: Readonly<Record<string, string>> = {
  sc: 'set-content', ac: 'add-content', clc: 'clear-content', ni: 'new-item', ri: 'remove-item',
  del: 'remove-item', erase: 'remove-item', rd: 'remove-item', cpi: 'copy-item', copy: 'copy-item',
  mi: 'move-item', move: 'move-item', rni: 'rename-item', ren: 'rename-item',
};

/** Every positional is a candidate: to pick one, the switches of each cmdlet must be known. */
function cmdletTargets(rest: readonly string[], position: number, params: readonly string[]): readonly string[] {
  const named = rest.findIndex(t => params.includes(t.toLowerCase()));
  if (named !== -1 && named + 1 < rest.length) return [rest[named + 1]];
  return rest.filter(t => !t.startsWith('-')).slice(position);
}

const SINKS = new Set(['/dev/null', '$null', 'nul']);
const CHANGE_DIR = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl']);
const TAKES_VALUE = new Set(['-b', '-B', '--reason']);

function worktreeOpening(words: readonly string[], cwd: string, paths: PlatformPath): { gitDir: string; target: string } | null {
  let dir = cwd;
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C' && i + 1 < words.length) dir = resolveFrom(paths, dir, words[++i]);
    else if (words[i] === '-c') i++;
    i++;
  }
  if (words[i] !== 'worktree' || words[i + 1] !== 'add') return null;
  for (let j = i + 2; j < words.length; j++) {
    if (TAKES_VALUE.has(words[j])) j++;
    else if (!words[j].startsWith('-')) return { gitDir: dir, target: resolveFrom(paths, dir, words[j]) };
  }
  return null;
}

/** `--head feature/x`, `-H feature/x`, `--head=feature/x`, with or without the `owner:` of a fork. */
function headOf(words: readonly string[]): string | null {
  const at = words.findIndex(w => w === '--head' || w === '-H' || w.startsWith('--head='));
  const value = at === -1 ? undefined : words[at].startsWith('--head=') ? words[at].slice('--head='.length) : words[at + 1];
  return value === undefined ? null : value.replace(/^[^:]*:/, '');
}

export function commandIntent(command: string, cwd: string, paths: PlatformPath): Intent {
  const writes: string[] = [];
  const worktrees: { gitDir: string; target: string }[] = [];
  const pullRequests: { cwd: string; head: string | null }[] = [];
  let here = cwd;

  for (const segment of segments(command)) {
    for (const w of segment) if (w.redirect && !SINKS.has(w.text.toLowerCase())) writes.push(resolveFrom(paths, here, w.text));
    const words = segment.filter(w => !w.redirect).map(w => w.text);
    if (words.length === 0) continue;
    const name = programName(words[0]);
    const rest = words.slice(1);

    if (CHANGE_DIR.has(name)) {
      const [target] = cmdletTargets(rest, 0, ['-path', '-literalpath']);
      if (target !== undefined && target !== '-') here = resolveFrom(paths, here, target);
      continue;
    }
    if (name === 'git') {
      const opening = worktreeOpening(words, here, paths);
      if (opening !== null) worktrees.push(opening);
      continue;
    }
    if (name === 'gh' && rest[0] === 'pr' && rest[1] === 'create') {
      pullRequests.push({ cwd: here, head: headOf(rest) });
      continue;
    }
    const writer = WRITERS[name];
    const cmdlet = CMDLETS[ALIASES[name] ?? name];
    const targets = writer !== undefined
      ? writer(rest.filter(t => !t.startsWith('-')), rest.filter(t => t.startsWith('-')))
      : cmdlet !== undefined ? cmdletTargets(rest, cmdlet[0], cmdlet[1]) : [];
    for (const t of targets) writes.push(resolveFrom(paths, here, t));
  }
  return { writes, worktrees, pullRequests };
}

export function patchPaths(patch: string): string[] {
  return [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+?)\s*$/gm)].map(m => m[1]);
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `null` is not "writes nothing": the first is warned about, the second passes silently. */
export function readIntent(raw: string, paths: PlatformPath): Intent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(payload) || typeof payload.cwd !== 'string' || !isRecord(payload.tool_input)) return null;
  const { cwd, tool_name: tool, tool_input: input } = payload;
  const writes: string[] = [];
  const worktrees: { gitDir: string; target: string }[] = [];
  const pullRequests: { cwd: string; head: string | null }[] = [];

  if (tool === PR_TOOL) pullRequests.push({ cwd, head: typeof input.head === 'string' ? input.head : null });
  if (typeof tool === 'string' && FILE_TOOLS.has(tool)) {
    for (const field of ['file_path', 'notebook_path']) {
      const target = input[field];
      if (typeof target === 'string' && target !== '') writes.push(resolveFrom(paths, cwd, target));
    }
  }
  const command = Array.isArray(input.command) ? input.command.map(String).join(' ') : input.command;
  if (typeof command === 'string') {
    // A patch travels in `apply_patch` or inside a Bash call (`apply_patch` with a heredoc): check both.
    for (const target of patchPaths(command)) writes.push(resolveFrom(paths, cwd, target));
    if (typeof tool === 'string' && SHELL_TOOLS.has(tool)) {
      const fromCommand = commandIntent(command, cwd, paths);
      writes.push(...fromCommand.writes);
      worktrees.push(...fromCommand.worktrees);
      pullRequests.push(...fromCommand.pullRequests);
    }
  }
  return { writes, worktrees, pullRequests };
}

export function encode(verdict: Verdict, agent: Agent): Response {
  if (verdict.kind === 'deny') {
    const output = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: verdict.reason } };
    return { stdout: JSON.stringify(output), stderr: '' };
  }
  if (verdict.kind === 'warn') {
    // Codex rejects unknown output fields: its warning goes to stderr, which it shows.
    return agent === 'claude' ? { stdout: JSON.stringify({ systemMessage: verdict.reason }), stderr: '' } : { stdout: '', stderr: verdict.reason };
  }
  return { stdout: '', stderr: '' };
}

export function handle(args: readonly string[], raw: string, git: Git, runs: RunStore): Response {
  const agent: Agent = args[0] === 'codex' ? 'codex' : 'claude';
  try {
    const intent = readIntent(raw, git.paths);
    if (intent === null) return encode({ kind: 'warn', reason: 'hook: unreadable payload, nothing was checked' }, agent);
    const verdicts = [decide(intent, git), pullRequestRule(intent, git, runs)];
    return encode(verdicts.find(v => v.kind === 'deny') ?? verdicts.find(v => v.kind === 'warn') ?? { kind: 'no-opinion' }, agent);
  } catch (error) {
    return encode({ kind: 'warn', reason: `hook: could not run and let the call through: ${String(error)}` }, agent);
  }
}
