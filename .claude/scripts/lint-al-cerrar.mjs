import { readFileSync, writeFileSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// By its file, not through `pnpm exec`: the package manager adds its own startup.
const ESLINT = path.join(RAIZ, 'node_modules/eslint/bin/eslint.js');

// `eslint` warns on a file that its config does not cover, and `--max-warnings 0` makes that an
// exit 1. `.mjs` is absent: the `**/*.js` block of the config does not match it (#143).
const EXTENSIONES = ['.ts', '.tsx', '.js', '.md'];

// The default `maxBuffer` is 1 MiB. Over it the call throws with `status: null`, which reads as
// "could not decide": the hook would pass when there are the most findings.
const TOPE_DEL_BUFFER = 32 * 1024 * 1024;
const TOPE_DEL_MENSAJE = 16 * 1024;

// N lanes end at once: the one that cannot take the lock passes. The short life frees the lock
// of a hook that died.
const LOCK = process.env.LINT_AL_CERRAR_LOCK ?? path.join(tmpdir(), 'pentomino-lint-al-cerrar.lock');
const VIDA_DEL_LOCK_MS = 60_000;

// `writeFileSync` on the descriptor: `process.stdout.write` on a pipe can be asynchronous, and
// `process.exit()` cuts it before the buffer drains.
const salir = (codigo, descriptor, texto) => {
  if (texto) writeFileSync(descriptor, `${texto}\n`);
  process.exit(codigo);
};

const pasar = (motivo) => salir(0, 1, motivo && `lint-al-cerrar: ${motivo}`);

// Only exit 2 with the text on stderr keeps the turn open.
const bloquear = (motivo) => salir(2, 2, motivo);

function payload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

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
      // The lock was released between the `wx` and the `stat`.
    }
    return false;
  }
}

const soltarLock = () => {
  try {
    unlinkSync(LOCK);
  } catch {
    // Another process took it as expired.
  }
};

// `core.quotePath=false`: by default git quotes and escapes a path with a non-ASCII character,
// and its extension no longer matches the filter.
function git(...args) {
  try {
    return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: RAIZ, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

// `ls-files --others`: a file just created is not in `git diff`.
function cambiados() {
  const crudo = [
    git('diff', '--name-only'),
    git('diff', '--name-only', '--cached'),
    git('ls-files', '--others', '--exclude-standard'),
  ].join('\n');
  const lista = crudo.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return [...new Set(lista)]
    .filter((f) => EXTENSIONES.includes(path.extname(f)))
    // `git diff` lists a deleted file, and ESLint on a missing path exits 2, which reads as
    // "could not decide" for all the other files.
    .filter((f) => existsSync(path.join(RAIZ, f)));
}

const recortar = (texto) => (texto.length <= TOPE_DEL_MENSAJE ? texto
  : `${texto.slice(0, TOPE_DEL_MENSAJE)}\n\n[...truncated: ${texto.length} characters of findings ` +
    'in total. Fix these and run `pnpm lint` to see the rest.]');

const COMO_SALIR =
  'Fix it before you end the turn, or run `pnpm lint` to see the detail. If the finding is a ' +
  'real exception, it goes as a per-file override in `eslint.config.js` with its reason ' +
  'written: `noInlineConfig` is set on purpose and there is no `eslint-disable`. This hook ' +
  'does not replace `pnpm verify` or CI: it only moves the moment you learn about the error.';

const { stop_hook_active: bloqueoActivo } = payload();

// The anti-loop. The schema reference does not declare `stop_hook_active`: absent means false.
if (bloqueoActivo === true) process.exit(0);

if (!tomarLock()) {
  pasar('another turn is linting right now; this one does not wait, so that it does not spend its timeout');
}

// `process.exit()` does not run a `finally`. After `tomarLock`: a lock this process did not take
// belongs to another one.
process.on('exit', soltarLock);

{
  const archivos = cambiados();

  if (archivos.length === 0) process.exit(0);

  // Without this check node exits 1 on the missing module, the same status as a finding.
  if (!existsSync(ESLINT)) pasar('eslint is not installed, nothing was verified');

  let salida;
  try {
    salida = execFileSync(
      process.execPath,
      [ESLINT, '--max-warnings', '0', '--no-warn-ignored', ...archivos],
      { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: TOPE_DEL_BUFFER },
    );
  } catch (error) {
    // An exit 1 with an empty stdout is the tool broken, not a finding. `--no-warn-ignored`: a
    // changed file under `globalIgnores` would warn, and so block.
    const hallazgos = `${error.stdout ?? ''}`.trim();
    if (error.status === 1 && hallazgos.length > 0) {
      bloquear(`Lint found this in what you changed:\n\n${recortar(hallazgos)}\n\n${COMO_SALIR}`);
    }
    pasar(`could not run eslint (status ${String(error.status)}), nothing was verified`);
  }

  if (salida.trim().length > 0) pasar(salida.trim());
  process.exit(0);
}
