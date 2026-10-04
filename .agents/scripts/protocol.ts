import type { PlatformPath } from 'node:path';
import { decide, type Git, type Intent, type Verdict } from './policy.ts';

/**
 * Cómo hablan los dos harnesses con un hook `PreToolUse`, y cómo se traduce lo que mandan a un
 * `Intent`. Es la única puerta de los hooks del repo: `hook.ts` le pasa stdin y escribe lo que
 * devuelve.
 *
 * ## Lo que se midió antes de escribirlo (2026-10-04, Codex CLI 0.160 y Claude Code)
 *
 * - **Los dos mandan `{ tool_name, tool_input, cwd }`.** Codex manda `Bash` con
 *   `tool_input.command` como string —en Windows lo corre PowerShell, aunque se llame `Bash`— y
 *   `apply_patch` con el parche entero en `tool_input.command`, con rutas relativas al `cwd`.
 * - **Denegar es un JSON con `permissionDecision: "deny"`, en los dos.** Codex trata el código
 *   de salida 2 como «el hook falló» y deja pasar; el JSON sí lo frena. Claude acepta el mismo
 *   JSON. Por eso hay una sola codificación del rechazo.
 * - **Nunca se emite `allow`.** En Claude Code `allow` saltea el sistema de permisos: el gate
 *   anterior lo emitía en cada pasada y aprobaba sin preguntar cada `Edit` y cada `Bash`. Sin
 *   opinión es salir callado.
 */

export type Agent = 'claude' | 'codex';
export interface Response { readonly stdout: string; readonly stderr: string }

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/** `/d/Usuarios/…` de Git Bash es `D:/Usuarios/…` para Windows. En POSIX no se toca. */
function native(paths: PlatformPath, target: string): string {
  if (paths.sep !== '\\') return target;
  return target.replace(/^\/([a-zA-Z])(?=\/|$)/, (_, drive: string) => `${drive.toUpperCase()}:`);
}

const resolveFrom = (paths: PlatformPath, cwd: string, target: string) => paths.resolve(cwd, native(paths, target));

// ## El shell
//
// Es DETECCIÓN y no un parser: reconoce las formas que se usan de verdad —redirección, `sed -i`,
// `tee`, `cp`/`mv`/`rm`, los cmdlets de PowerShell que escriben y `git worktree add`— y no
// pretende ser exhaustiva. Un `python -c` que abra el archivo pasa. Está bien que pase: un gate
// que intenta parsear shell de verdad se equivoca en la dirección cara, que es bloquear lo que
// no debía. Las dos sintaxis se miran siempre juntas, sin importar el nombre de la herramienta.

export interface Word { readonly text: string; readonly redirect: boolean }

/** Corta un comando en segmentos de palabras, respetando comillas. Una redirección marca a la palabra que la sigue. */
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
      // El dígito pegado adelante (`2>`) es un descriptor, no una palabra del comando.
      if (inWord && /^\d$/.test(word)) inWord = false;
      closeWord();
      if (command[i + 1] === '>') i++;
      // `2>&1` y `>&2` duplican un descriptor: no escriben un archivo.
      if (command[i + 1] === '&') {
        i++;
        while (i + 1 < command.length && /[\d-]/.test(command[i + 1])) i++;
        continue;
      }
      redirect = true;
      continue;
    }
    if (c === ';' || c === '\n' || c === '|' || c === '&') {
      // `&&`, `||`, `|`, `;`, salto de línea y `&` cortan el segmento por igual.
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

/** El nombre del programa: sin carpeta, sin `.exe`, en minúsculas (PowerShell no distingue). */
const programName = (word: string) => word.replace(/^.*[/\\]/, '').replace(/\.exe$/i, '').toLowerCase();

/** Lo que escriben los comandos POSIX, sobre sus argumentos que no son flags. */
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

/** Cmdlets que escriben: la posición del destino entre los posicionales, y los parámetros que lo nombran. */
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
 * El destino de un cmdlet. Sin parámetro nombrado devuelve TODOS los posicionales desde su
 * posición, no uno: saber cuál es «el N-ésimo» obliga a saber qué parámetros son interruptores,
 * y equivocarse ahí sale caro hacia el lado malo (`Remove-Item -Force src` se comería el `src`).
 * Devolver de más no cuesta nada: un candidato que no es ruta protegida se descarta solo.
 */
function cmdletTargets(rest: readonly string[], position: number, params: readonly string[]): readonly string[] {
  const named = rest.findIndex(t => params.includes(t.toLowerCase()));
  if (named !== -1 && named + 1 < rest.length) return [rest[named + 1]];
  return rest.filter(t => !t.startsWith('-')).slice(position);
}

/** Los sumideros: redirigir ahí no escribe ningún archivo. */
const SINKS = new Set(['/dev/null', '$null', 'nul']);
const CHANGE_DIR = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl']);
/** Opciones de `git worktree add` que consumen el valor siguiente. */
const TAKES_VALUE = new Set(['-b', '-B', '--reason']);

/** El `git worktree add` de un segmento, si lo hay: desde qué directorio corre git y adónde abre. */
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

/** Lo que escribe un comando de shell y los worktrees que abre, siguiendo los `cd`. */
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

/** Las rutas que toca un parche de `apply_patch`: las que agrega, cambia, borra o mueve. */
export function patchPaths(patch: string): string[] {
  return [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+?)\s*$/gm)].map(m => m[1]);
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * El `Intent` de un payload, o `null` si no se pudo leer. `null` NO es lo mismo que «no escribe
 * nada» (`[]`): el primero se avisa, el segundo pasa callado.
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
    // Un parche viaja en `apply_patch` o adentro de un Bash (`apply_patch <<EOF`): se mira en los dos.
    for (const target of patchPaths(command)) writes.push(resolveFrom(paths, cwd, target));
    if (typeof tool === 'string' && SHELL_TOOLS.has(tool)) {
      const fromCommand = commandIntent(command, cwd, paths);
      writes.push(...fromCommand.writes);
      worktrees.push(...fromCommand.worktrees);
    }
  }
  return { writes, worktrees };
}

/** Codifica un veredicto para el harness que llamó. */
export function encode(verdict: Verdict, agent: Agent): Response {
  if (verdict.kind === 'deny') {
    const output = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: verdict.reason } };
    return { stdout: JSON.stringify(output), stderr: '' };
  }
  if (verdict.kind === 'warn') {
    // Codex rechaza campos que no conoce en la salida: el aviso va por stderr, que muestra.
    return agent === 'claude' ? { stdout: JSON.stringify({ systemMessage: verdict.reason }), stderr: '' } : { stdout: '', stderr: verdict.reason };
  }
  return { stdout: '', stderr: '' };
}

/** La única puerta de los hooks, para los dos harnesses. Nunca lanza. */
export function handle(args: readonly string[], raw: string, git: Git): Response {
  const agent: Agent = args[0] === 'codex' ? 'codex' : 'claude';
  try {
    const intent = readIntent(raw, git.paths);
    if (intent === null) return encode({ kind: 'warn', reason: 'hook: payload ilegible, no se verificó nada' }, agent);
    return encode(decide(intent, git), agent);
  } catch (error) {
    return encode({ kind: 'warn', reason: `hook: no pudo correr y dejó pasar: ${String(error)}` }, agent);
  }
}
