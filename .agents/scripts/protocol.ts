import type { PlatformPath } from 'node:path';
import { decide, type Git, type Intent, type Verdict } from './policy.ts';

/**
 * How both harnesses talk to a `PreToolUse` hook, and how their payload becomes an `Intent`.
 * The single door of the repo's hooks: `hook.ts` passes stdin in and writes what comes out.
 *
 * Measured on 2026-10-04 with Codex CLI 0.160 and Claude Code:
 *
 * - Both send `{ tool_name, tool_input, cwd }`. Codex sends `Bash` with `tool_input.command` as
 *   a string (PowerShell on Windows, despite the name), and `apply_patch` with the whole patch
 *   in `tool_input.command`, paths relative to `cwd`.
 * - Both honor a JSON `permissionDecision: "deny"`. Codex treats exit code 2 as a broken hook
 *   and lets the call through. So there is one encoding for a denial.
 * - `allow` is never emitted. In Claude Code it skips the permission system. No opinion means
 *   exiting silently.
 */

export type Agent = 'claude' | 'codex';
export interface Response { readonly stdout: string; readonly stderr: string }

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/** Git Bash's `/d/Users/…` is `D:/Users/…` on Windows. POSIX paths stay as they are. */
function native(paths: PlatformPath, target: string): string {
  if (paths.sep !== '\\') return target;
  return target.replace(/^\/([a-zA-Z])(?=\/|$)/, (_, drive: string) => `${drive.toUpperCase()}:`);
}

const resolveFrom = (paths: PlatformPath, cwd: string, target: string) => paths.resolve(cwd, native(paths, target));

// The shell: DETECTION, not a parser. It knows the write forms that occur in practice
// (redirection, `sed -i`, `tee`, `cp`/`mv`/`rm`, writing cmdlets, `git worktree add`) and is not
// exhaustive: a `python -c` that opens the file gets through. A gate that tries to parse shell
// fails in the expensive direction, blocking what it should not. POSIX and PowerShell syntax are
// always checked together, whatever the tool name.

export interface Word { readonly text: string; readonly redirect: boolean }

/** Splits a command into segments of words, honoring quotes. A redirection marks the word after it. */
export function segments(command: string): Word[][] {
  const result: Word[][] = [];
  let current: Word[] = [];
  let word = '';
  let inWord = false;
  let quote: string | null = null;
  let redirect = false;
  const heredocs: { readonly delimiter: string; readonly stripTabs: boolean }[] = [];

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
  const skipBodies = (newline: number) => {
    let at = newline;
    for (const { delimiter, stripTabs } of heredocs.splice(0)) {
      let closed = false;
      while (!closed && at < command.length) {
        const start = at + 1;
        at = command.indexOf('\n', start);
        if (at === -1) at = command.length;
        const line = command.slice(start, at);
        closed = (stripTabs ? line.replace(/^\t+/, '') : line) === delimiter;
      }
    }
    return at;
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
      // A digit glued in front (`2>`) is a descriptor, not a word of the command.
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
    // A heredoc body is text, not a command: a `>` in it writes no file.
    // The `<<` at the end of a here-string (`<<<`) opens no heredoc.
    const heredoc = c === '<' && command[i - 1] !== '<' ? /^<<(-?)[ \t]*([^\s<>;&|()]+)/.exec(command.slice(i)) : null;
    if (heredoc !== null) {
      heredocs.push({ delimiter: heredoc[2].replace(/['"\\]/g, ''), stripTabs: heredoc[1] === '-' });
      i += heredoc[0].length - 1;
      continue;
    }
    if (c === '\n' && heredocs.length > 0) {
      closeSegment();
      i = skipBodies(i);
      continue;
    }
    if (c === ';' || c === '\n' || c === '|' || c === '&') {
      // `&&`, `||`, `|`, `;`, newline and `&` all end the segment.
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

/** The program name: no folder, no `.exe`, lower case (PowerShell ignores case). */
const programName = (word: string) => word.replace(/^.*[/\\]/, '').replace(/\.exe$/i, '').toLowerCase();

/** What POSIX commands write, given their non-flag arguments. */
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

/** Writing cmdlets: the target's position among positionals, and the parameters that name it. */
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

/**
 * A cmdlet's targets. Without a named parameter it returns ALL positionals from its position.
 * Picking "the Nth" requires knowing which parameters are switches, and a mistake there fails
 * the expensive way: `Remove-Item -Force src` would lose the `src`. Extra candidates cost
 * nothing: a candidate that is not a protected path is dropped.
 */
function cmdletTargets(rest: readonly string[], position: number, params: readonly string[]): readonly string[] {
  const named = rest.findIndex(t => params.includes(t.toLowerCase()));
  if (named !== -1 && named + 1 < rest.length) return [rest[named + 1]];
  return rest.filter(t => !t.startsWith('-')).slice(position);
}

/** Sinks: redirecting there writes no file. */
const SINKS = new Set(['/dev/null', '$null', 'nul']);
const CHANGE_DIR = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl']);
/** `git worktree add` options that take the next word as their value. */
const TAKES_VALUE = new Set(['-b', '-B', '--reason']);

/** The `git worktree add` of a segment, if any: where git runs from and where it opens. */
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

/** What a shell command writes and which worktrees it opens, following each `cd`. */
export function commandIntent(command: string, cwd: string, paths: PlatformPath): Intent {
  const writes: string[] = [];
  const worktrees: { gitDir: string; target: string }[] = [];
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
    const writer = WRITERS[name];
    const cmdlet = CMDLETS[ALIASES[name] ?? name];
    const targets = writer !== undefined
      ? writer(rest.filter(t => !t.startsWith('-')), rest.filter(t => t.startsWith('-')))
      : cmdlet !== undefined ? cmdletTargets(rest, cmdlet[0], cmdlet[1]) : [];
    for (const t of targets) writes.push(resolveFrom(paths, here, t));
  }
  return { writes, worktrees };
}

/** The paths an `apply_patch` patch touches: added, updated, deleted or moved. */
export function patchPaths(patch: string): string[] {
  return [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+?)\s*$/gm)].map(m => m[1]);
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The `Intent` of a payload, or `null` if it could not be read. `null` is not "writes nothing"
 * (`[]`): the first one is warned about, the second one passes silently.
 */
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
    }
  }
  return { writes, worktrees };
}

/** Encodes a verdict for the calling harness. */
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

/** The single door of the hooks, for both harnesses. It never throws. */
export function handle(args: readonly string[], raw: string, git: Git): Response {
  const agent: Agent = args[0] === 'codex' ? 'codex' : 'claude';
  try {
    const intent = readIntent(raw, git.paths);
    if (intent === null) return encode({ kind: 'warn', reason: 'hook: unreadable payload, nothing was checked' }, agent);
    return encode(decide(intent, git), agent);
  } catch (error) {
    return encode({ kind: 'warn', reason: `hook: could not run and let the call through: ${String(error)}` }, agent);
  }
}
