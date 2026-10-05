/**
 * The stop hook: lint does not wait for someone to run it.
 *
 * It runs as the `Stop` and the `SubagentStop` hook (both, see below) and lints what changed in
 * the tree. On a finding, it returns the finding as text, so that the agent fixes it before it
 * ends the turn.
 *
 * **What it buys, exactly: it does NOT replace `pnpm verify` or CI.** It moves the moment the
 * agent learns about the error, from "when it opens the PR" to "when it thinks it is done".
 * That is all, and it is enough: the error is found with the context loaded and with two files
 * written, not with twenty.
 *
 * ## Per turn and not per edit, with the four numbers that decide it
 *
 * The reflex is a `PostToolUse` that lints the file just edited. The measurement rejects it
 * (measured on `63e569a`):
 *
 *     the whole pnpm lint ....................... 21.78 s
 *     1 file, WITH type information ............. 4.42 s
 *     1 file, WITHOUT type information .......... 2.44 s
 *     the 38 files of src/, WITHOUT types ....... 3.47 s
 *
 * Two conclusions. **~2.4 s are fixed startup**, so a `PostToolUse` adds between 2.4 s and
 * 4.4 s to EACH `Edit`: twenty edits are a minute and a half in twenty pauses, the kind of
 * friction that ends with someone turning the hook off. And **going from 1 file to 38 costs
 * 1 second**, so a finer grain buys nothing. Both say the same: the correct moment is per turn.
 *
 * ## `Stop` AND `SubagentStop`, and what that costs
 *
 * They are **two distinct events**, and `Stop` does not cover subagents (confirmed against the
 * hooks documentation). This repo does most of its work inside subagents (`implement-feature`,
 * the `-batch` skills, `pr-review`), and that is where the files are written: a hook declared
 * on `Stop` alone **does not see the turn where the code was written**, so it misses the main
 * use case.
 *
 * The cost of declaring it on both is written because it is real: **N parallel lanes pay the
 * budget N times**, on the same ESLint cache. It is a failure mode the harness knows: three
 * agents on the same `node_modules` hang each other. So the hook serializes with a lock that
 * does NOT wait (see `tomarLock`).
 *
 * ## The three decisions that are not obvious
 *
 * 1. **The verdict comes from the EXIT CODE, never from a grep of the output.** This repo hit
 *    that trap: it declared a green `verify` with lint broken, because a `| grep` that does
 *    not match returns 1. A hook that repeats it blocks clean turns and lets dirty ones
 *    through.
 *
 * 2. **If something fails, it LETS THE TURN THROUGH and says so** (`pasar(motivo)`). A hook
 *    that blocks when it could not decide is turned off the first day its dependency fails.
 *    It fails open on purpose: what it protects is a convention, not a secret.
 *
 * 3. **The message says how to get out.** A block that does not say what to do gives the
 *    reflex to look for a way around the block, which is the complete failure of the hook.
 *
 * ## The anti-loop, and the one thing the documentation does not declare
 *
 * `stop_hook_active` comes as `true` when the block before was from this same hook. On that
 * value the hook must exit with 0, or it blocks on its own block. **Mind the source:** the
 * hooks guide says in so many words to parse that field, but the schema reference of
 * `Stop`/`SubagentStop` **does not declare it**. It is an inconsistency of the documentation.
 * So here it is read with `=== true`, and its absence is treated as `false`: if the field
 * stops coming, the hook goes on linting, which is its job, and does not go quiet forever.
 * The platform also has its own limit: it stops a `Stop` hook that blocks eight times in a
 * row with no progress.
 */
import { readFileSync, writeFileSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * ESLint is invoked by its file and not through `pnpm exec`: the package manager adds its own
 * startup to a budget measured in seconds, and nothing needs resolving here.
 */
const ESLINT = path.join(RAIZ, 'node_modules/eslint/bin/eslint.js');

/**
 * The extensions the ESLint config covers, read and not assumed: the blocks with `files` in
 * `eslint.config.js` are `**\/*.js`, `**\/*.{ts,tsx}` and `**\/*.md`.
 *
 * The filter is not tidiness: `eslint` on a file its config does not cover warns "File ignored
 * because no matching configuration was supplied", and with the `--max-warnings 0` of this
 * hook that is an exit 1. So a changed `.png` would block the turn.
 *
 * **`.mjs` is NOT in the list, and that is a known hole.** The `**\/*.js` glob that carries
 * `js.configs.recommended` does not match `.mjs` in flat config, so this file is linted with ZERO
 * rules. Adding `.mjs` here buys nothing until that changes, and the fix belongs in
 * `eslint.config.js`: it is open as issue #143.
 */
const EXTENSIONES = ['.ts', '.tsx', '.js', '.md'];

/**
 * The two limits on the ESLint output. Each exists for a measured failure in green.
 *
 * The default `maxBuffer` of `execFileSync` is **1 MiB**, and going over it does NOT look like
 * a finding: the call throws with `code: 'ENOBUFS'` and **`status: null`**, which the
 * discriminant below reads as "could not decide" and sends to `pasar`. So without this number
 * the hook fails open **exactly when there are the most findings**. Verified: 2 MiB on stdout
 * give `status=null, code=ENOBUFS`.
 *
 * Once that output fits, to return it whole would dump megabytes into the context of the
 * agent, the opposite of "the message says how to get out". It is truncated, and the message
 * says so: the first findings are enough to start the fix, and `pnpm lint` shows the rest.
 */
const TOPE_DEL_BUFFER = 32 * 1024 * 1024;
const TOPE_DEL_MENSAJE = 16 * 1024;

/**
 * The lock, and why it does NOT wait.
 *
 * With `SubagentStop` declared, N lanes end almost at once and would start N ESLint on the
 * same cache. To wait for a turn would spend the `timeout` of the hook to arrive late and say
 * the same, so the one that cannot take the lock **lets the turn through and says so**: the
 * same policy as `pasar(motivo)`, in doubt let through and tell.
 *
 * The short life exists for the ugly case: a hook that dies without releasing would leave the
 * lock set forever and the gate mute forever, which is failing green. It is loose against the
 * ceiling of the budget (6 s) so that it does not step on a legitimate run.
 */
const LOCK = path.join(tmpdir(), 'pentomino-lint-al-cerrar.lock');
const VIDA_DEL_LOCK_MS = 60_000;

/**
 * Writes and exits, in that order and with no window between the two.
 *
 * `writeFileSync` on the descriptor and not `console.log`: when the output is a pipe, which is
 * how the session reads it, `process.stdout.write` can be ASYNCHRONOUS, and a `process.exit()`
 * right after it cuts the process before the buffer drains. So the hook would block without
 * saying why, which is the complete failure of point 3 of the header.
 */
const salir = (codigo, descriptor, texto) => {
  if (texto) writeFileSync(descriptor, `${texto}\n`);
  process.exit(codigo);
};

/** Lets the turn through, and optionally tells why. It is the default exit of every failure. */
const pasar = (motivo) => salir(0, 1, motivo && `lint-al-cerrar: ${motivo}`);

/**
 * Blocks the end of the turn.
 *
 * **Exit 2 with the text on stderr** is the only way to keep the turn open: confirmed against
 * the documentation, a JSON on stdout without exit 2 blocks nothing. The model reads that
 * stderr and goes on working.
 */
const bloquear = (motivo) => salir(2, 2, motivo);

/** The payload of the hook, or `{}` if it cannot be read. With no payload nothing is decided. */
function payload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Takes the lock, or returns `false` if another process holds it and it is still alive.
 *
 * `wx` is the atomic creation: it fails if the file exists, which is exactly the question.
 */
function tomarLock() {
  try {
    writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    try {
      if (Date.now() - statSync(LOCK).mtimeMs > VIDA_DEL_LOCK_MS) {
        writeFileSync(LOCK, String(process.pid));
        return true;
      }
    } catch {
      // The lock was released between the `wx` and the `stat`. For the race to end in "not
      // taken" is the cheap and correct answer: the other process lints or will lint.
    }
    return false;
  }
}

const soltarLock = () => {
  try {
    unlinkSync(LOCK);
  } catch {
    // It is gone: another process took it as expired. There is nothing to fix.
  }
};

/**
 * The output of a git command, or `''` if git does not answer.
 *
 * **`core.quotePath=false` is not cosmetic.** With the default, git returns every path with a
 * non-ASCII character escaped and **between quotes** (`"docs/sesión.md"` comes out as
 * `"docs/sesi\303\263n.md"`), so the extension stops being `.md`, the file falls out of the
 * filter and is never linted. A path with an accent is then a file the hook does not look at,
 * in silence. Verified with `ls-files`.
 */
function git(...args) {
  try {
    return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: RAIZ, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

/**
 * The changed files, from the THREE commands.
 *
 * The third is not optional: a file just created does not appear in `git diff`, and that is
 * exactly the case of an agent that writes new code, the one that gets forgotten.
 */
function cambiados() {
  const crudo = [
    git('diff', '--name-only'),
    git('diff', '--name-only', '--cached'),
    git('ls-files', '--others', '--exclude-standard'),
  ].join('\n');
  const lista = crudo.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return [...new Set(lista)]
    .filter((f) => EXTENSIONES.includes(path.extname(f)))
    // **A DELETED file is dropped, and this is not tidiness.** `git diff --name-only` lists
    // deleted files the same as modified ones, and ESLint on a path that does not exist exits
    // with **status 2** ("No files matching the pattern"), which the discriminant below reads
    // as "could not decide" and lets through. So without this filter a turn that deletes one
    // `.md` stops the check of ALL the rest, in silence and green. Measured on this repo: with
    // `docs/guides/troubleshooting.md` deleted, an `enum` just written in
    // `src/pieces/transform.ts` came out with exit 0. And a deletion is not rare here: the
    // convention is that deletions go in their own commit, so in their own turn.
    .filter((f) => existsSync(path.join(RAIZ, f)));
}

/** Truncates the output at the limit and **says so**: a mute cut reads as the end. */
const recortar = (texto) => (texto.length <= TOPE_DEL_MENSAJE ? texto
  : `${texto.slice(0, TOPE_DEL_MENSAJE)}\n\n[...truncated: ${texto.length} characters of findings ` +
    'in total. Fix these and run `pnpm lint` to see the rest.]');

const COMO_SALIR =
  'Fix it before you end the turn, or run `pnpm lint` to see the detail. If the finding is a ' +
  'real exception, it goes as a per-file override in `eslint.config.js` with its reason ' +
  'written: `noInlineConfig` is set on purpose and there is no `eslint-disable`. This hook ' +
  'does not replace `pnpm verify` or CI: it only moves the moment you learn about the error.';

const { stop_hook_active: bloqueoActivo } = payload();

// The anti-loop. It goes before everything else: if the block before was from this hook, the
// only correct thing is to stay quiet, and it does not cost one call to git.
if (bloqueoActivo === true) process.exit(0);

if (!tomarLock()) {
  pasar('another turn is linting right now; this one does not wait, so that it does not spend its timeout');
}

// **`process.on('exit')` and not a `finally`**: every exit below goes through
// `process.exit()`, which ends the process at once and **does not run a `finally`**. With a
// `try/finally` the lock would stay set on each block and on each `pasar`, and from there the
// hook would say "another turn is linting" for a whole minute: mute, green, with no warning.
// This handler does run, also on an exit through `process.exit`.
//
// It goes AFTER `tomarLock`: if this process did not take the lock, the lock belongs to
// another one, and to delete it would be worse.
process.on('exit', soltarLock);

{
  const archivos = cambiados();

  // The most common case, and it must cost zero.
  if (archivos.length === 0) process.exit(0);

  // The binary, asked for before it is launched. **Without this check the hook blocks when
  // ESLint is missing**: node starts anyway, does not find the module and exits with status 1,
  // the SAME that ESLint uses for "there are findings", and writes the "Cannot find module" on
  // stderr. A half-installed `node_modules` would block every turn with a stack trace per
  // message, the opposite of failing open.
  if (!existsSync(ESLINT)) pasar('eslint is not installed, nothing was verified');

  let salida;
  try {
    salida = execFileSync(
      process.execPath,
      [ESLINT, '--max-warnings', '0', '--no-warn-ignored', ...archivos],
      { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: TOPE_DEL_BUFFER },
    );
  } catch (error) {
    // **The discriminant is exit 1 WITH findings on STDOUT**, and both halves are needed.
    // ESLint writes its findings on stdout and its failures on stderr, so an exit 1 with an
    // empty stdout is not a finding but the tool broken: a module that does not load, a
    // plugin that throws on import. All the rest, like the missing config, which is exit 2,
    // falls by itself into the `pasar` below.
    //
    // And `--no-warn-ignored` prevents the false positive of the changed file that falls
    // under `globalIgnores` (`dist`, `.claude/worktrees`): with `--max-warnings 0`, that
    // warning would be an exit 1, and a block for a file the repo decided not to lint.
    const hallazgos = `${error.stdout ?? ''}`.trim();
    if (error.status === 1 && hallazgos.length > 0) {
      bloquear(`Lint found this in what you changed:\n\n${recortar(hallazgos)}\n\n${COMO_SALIR}`);
    }
    pasar(`could not run eslint (status ${String(error.status)}), nothing was verified`);
  }

  // Exit 0 and a clean tree: there is nothing to say, and to say it would be noise in each turn.
  if (salida.trim().length > 0) pasar(salida.trim());
  process.exit(0);
}
