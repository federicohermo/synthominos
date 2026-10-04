/**
 * El hook del spec 048: el lint no espera a que alguien lo corra.
 *
 * Corre como hook `Stop` y `SubagentStop` —los dos, ver abajo—, lintea lo que cambio en el
 * arbol y, si hay rojo, lo devuelve como texto para que el agente lo arregle antes de dar el
 * turno por terminado.
 *
 * **Lo que compra, dicho con precision: NO reemplaza a `pnpm verify` ni a la CI.** Adelanta el
 * momento en que el agente se entera, de «cuando abre el PR» a «cuando cree que termino». Eso
 * es todo, y alcanza: el error se descubre con el contexto cargado y con dos archivos escritos,
 * no con veinte.
 *
 * ## Por turno y no por edicion, con los cuatro numeros que lo deciden
 *
 * El reflejo es un `PostToolUse` que lintee el archivo recien editado. Esta falsificado
 * (`specs/048`, M1, medido sobre `63e569a`):
 *
 *     pnpm lint entero .......................... 21,78 s
 *     1 archivo, CON informacion de tipos ....... 4,42 s
 *     1 archivo, SIN informacion de tipos ....... 2,44 s
 *     los 38 de src/, SIN informacion de tipos .. 3,47 s
 *
 * Dos conclusiones. **~2,4 s son arranque fijo**, asi que un `PostToolUse` le suma entre 2,4 y
 * 4,4 s a CADA `Edit`: veinte ediciones son un minuto y medio repartido en veinte pausas, que
 * es la clase de friccion que termina con alguien apagando el hook. Y **ir de 1 archivo a 38
 * cuesta 1 segundo**, o sea que la granularidad fina no compra nada. Las dos juntas dicen lo
 * mismo: el momento correcto es por turno.
 *
 * ## `Stop` Y `SubagentStop`, y lo que eso cuesta
 *
 * Son **dos eventos distintos** y `Stop` no cubre subagentes (confirmado contra la doc de
 * hooks al implementar). Este repo hace la mayor parte de su trabajo adentro de subagentes
 * —`spec-implement`, los tres `-batch`, `pr-review`— y ahi es donde se escriben los archivos:
 * un hook declarado solo en `Stop` **no ve el turno donde se escribio el codigo**, o sea que
 * nace sin cubrir el caso de uso principal.
 *
 * El costo de declararlo en los dos esta escrito porque es real: **N carriles en paralelo
 * pagan N veces el presupuesto**, sobre la misma cache de ESLint. Es el modo de falla que el
 * harness ya conoce —tres agentes sobre el mismo `node_modules` se cuelgan entre si— y por eso
 * el hook se serializa con un lock que NO espera (ver `tomarLock`).
 *
 * ## Las tres decisiones que no son obvias
 *
 * 1. **El veredicto sale del EXIT CODE, nunca de un grep de la salida.** Es la trampa que este
 *    repo ya piso: declaro un `verify` verde con el lint roto porque un `| grep` que no
 *    matchea devuelve 1. Un hook que la repita bloquea turnos limpios y deja pasar los sucios.
 *
 * 2. **Si algo falla, DEJA PASAR y lo dice** (`pasar(motivo)`). Es literal del gate del 037, y
 *    el motivo es el mismo: un hook que bloquea cuando no pudo decidir se desactiva el primer
 *    dia que su dependencia falla. Falla abierto a proposito — lo que protege es una
 *    convencion, no un secreto.
 *
 * 3. **El mensaje dice como salir.** Bloquear sin decir que hacer produce el reflejo de buscar
 *    como saltear el bloqueo, que es el fracaso completo del hook.
 *
 * ## El anti-bucle, y la unica cosa que la doc no declara
 *
 * `stop_hook_active` llega en `true` cuando el bloqueo anterior fue de este mismo hook, y
 * viendolo hay que salir con 0 o el hook bloquea sobre su propio bloqueo. **Ojo con la fuente:**
 * la guia de hooks dice textualmente que hay que parsear ese campo, pero la referencia de
 * schemas de `Stop`/`SubagentStop` **no lo declara**. Es una inconsistencia de la
 * documentacion, verificada al implementar. Por eso aca se lee con `=== true` y su ausencia se
 * trata como `false`: si el campo dejara de venir, el hook sigue linteando —que es su trabajo—
 * en vez de callarse para siempre. La plataforma tiene ademas su propio tope: corta un hook
 * `Stop` que bloquea ocho veces seguidas sin progreso.
 */
import { readFileSync, writeFileSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * ESLint se invoca por su archivo y no por `pnpm exec`: el gestor le suma su propio arranque
 * a un presupuesto que se mide en segundos, y aca no hace falta resolver nada.
 */
const ESLINT = path.join(RAIZ, 'node_modules/eslint/bin/eslint.js');

/**
 * Las extensiones que la config de ESLint cubre, leidas y no supuestas: los bloques con
 * `files` de `eslint.config.js` son `**\/*.js`, `**\/*.{ts,tsx}` y `**\/*.md`.
 *
 * El filtro no es prolijidad: `eslint` sobre un archivo que su config no cubre avisa «File
 * ignored because no matching configuration was supplied», y con el `--max-warnings 0` que usa
 * este hook eso es un exit 1 — o sea un bloqueo por un `.png` cambiado.
 *
 * **`.mjs` is NOT in the list, and that is a known hole.** The `**\/*.js` glob that carries
 * `js.configs.recommended` does not match `.mjs` in flat config, so this file is linted with ZERO
 * rules. Adding `.mjs` here buys nothing until that changes, and the fix belongs in
 * `eslint.config.js`: it is open as issue #143.
 */
const EXTENSIONES = ['.ts', '.tsx', '.js', '.md'];

/**
 * Los dos topes de la salida de ESLint, y los dos existen por un fallo en verde medido.
 *
 * El `maxBuffer` por default de `execFileSync` es **1 MiB**, y pasarse NO se parece a un
 * hallazgo: la llamada tira con `code: 'ENOBUFS'` y **`status: null`**, que el discriminante de
 * abajo lee como «no pude decidir» y manda a `pasar`. O sea que sin este numero el hook falla
 * abierto **justo cuando mas hallazgos hay**. Verificado: 2 MiB por stdout dan
 * `status=null, code=ENOBUFS`.
 *
 * Y una vez que esa salida entra, devolverla entera seria volcar megabytes en el contexto del
 * agente, que es lo contrario de «el mensaje dice como salir». Se recorta y se dice que se
 * recorto: para empezar a arreglar alcanzan los primeros, y el resto lo muestra `pnpm lint`.
 */
const TOPE_DEL_BUFFER = 32 * 1024 * 1024;
const TOPE_DEL_MENSAJE = 16 * 1024;

/**
 * El lock, y por que NO espera.
 *
 * Con `SubagentStop` declarado, N carriles terminan casi a la vez y arrancarian N ESLint sobre
 * la misma cache. Esperar el turno seria gastar el `timeout` del hook para llegar tarde a
 * decir lo mismo, asi que el que no puede tomarlo **deja pasar diciendolo**: es la misma
 * politica de `pasar(motivo)`, ante la duda pasar contando.
 *
 * La vida corta existe por el caso feo: un hook que muere sin liberar dejaria el lock puesto
 * para siempre y el gate mudo para siempre, que es fallar en verde. Es holgado contra el techo
 * del presupuesto (6 s) para no pisar una corrida legitima.
 */
const LOCK = path.join(tmpdir(), 'pentomino-lint-al-cerrar.lock');
const VIDA_DEL_LOCK_MS = 60_000;

/**
 * Escribe y termina, en ese orden y sin ventana entre las dos.
 *
 * `writeFileSync` sobre el descriptor y no `console.log`: cuando la salida es un pipe —que es
 * como la lee la sesion— `process.stdout.write` puede ser ASINCRONICO, y `process.exit()`
 * inmediatamente despues corta el proceso antes de que el buffer se vacie. O sea que el hook
 * bloquearia sin decir por que, que es el fracaso completo del punto 3 del encabezado.
 */
const salir = (codigo, descriptor, texto) => {
  if (texto) writeFileSync(descriptor, `${texto}\n`);
  process.exit(codigo);
};

/** Deja pasar, y opcionalmente cuenta por que. Es la salida por defecto de todo fallo. */
const pasar = (motivo) => salir(0, 1, motivo && `lint-al-cerrar: ${motivo}`);

/**
 * Bloquea el cierre del turno.
 *
 * **Exit 2 con el texto por stderr** es la unica forma de que el turno no cierre: confirmado
 * contra la doc al implementar, un JSON en stdout sin exit 2 no bloquea nada. El modelo lee
 * ese stderr y sigue trabajando.
 */
const bloquear = (motivo) => salir(2, 2, motivo);

/** El payload del hook, o `{}` si no se pudo leer. Sin payload no hay nada que decidir. */
function payload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Toma el lock, o devuelve `false` si ya lo tiene otro y sigue vivo.
 *
 * `wx` es la creacion atomica: falla si el archivo existe, que es justo la pregunta.
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
      // El lock se libero entre el `wx` y el `stat`. Que la carrera termine en «no lo tomo»
      // es la respuesta barata y correcta: el otro proceso ya lintea o va a linear.
    }
    return false;
  }
}

const soltarLock = () => {
  try {
    unlinkSync(LOCK);
  } catch {
    // Ya no esta: otro lo dio por vencido. No hay nada que arreglar.
  }
};

/**
 * La salida de un comando de git, o `''` si git no contesta.
 *
 * **`core.quotePath=false` no es cosmetica.** Con el default, git devuelve toda ruta con un
 * caracter no ASCII escapada y **entre comillas** —`"docs/sesión.md"` sale como
 * `"docs/sesi\303\263n.md"`—, asi que la extension deja de ser `.md`, el archivo se cae del
 * filtro y no se lintea nunca. En un repo cuya documentacion se escribe en espanol eso es una
 * ruta con acento a un archivo que el hook no mira, callado. Verificado con `ls-files`.
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
 * Los archivos cambiados, con los TRES comandos.
 *
 * El tercero no es opcional: un archivo recien creado no aparece en `git diff`, y es
 * exactamente el caso de un agente escribiendo codigo nuevo — el que se olvida.
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
    // **El archivo BORRADO se descarta, y esto no es prolijidad.** `git diff --name-only`
    // lista los borrados igual que los modificados, y ESLint sobre una ruta que no existe
    // sale con **status 2** —«No files matching the pattern»— que el discriminante de abajo
    // lee como «no pude decidir» y deja pasar. O sea que un turno que borra un solo `.md`
    // dejaba de verificar TODO lo demas, callado y en verde. Medido sobre este repo: con
    // `docs/guides/troubleshooting.md` borrado, un `enum` recien escrito en
    // `src/pieces/domain/transform.ts` salio con exit 0. Y borrar no es raro aca: la convencion es
    // que los borrados van en su propio commit, o sea en su propio turno.
    .filter((f) => existsSync(path.join(RAIZ, f)));
}

/** Recorta la salida al tope y **dice que la recorto**: un corte mudo se lee como el final. */
const recortar = (texto) => (texto.length <= TOPE_DEL_MENSAJE ? texto
  : `${texto.slice(0, TOPE_DEL_MENSAJE)}\n\n[...recortado: ${texto.length} caracteres de hallazgos ` +
    'en total. Arregla estos y corre `pnpm lint` para ver el resto.]');

const COMO_SALIR =
  'Arreglalo antes de cerrar el turno, o corre `pnpm lint` para ver el detalle. Si el hallazgo ' +
  'es una excepcion legitima, va como override por archivo en `eslint.config.js` con su motivo ' +
  'escrito: `noInlineConfig` esta puesto a proposito y no hay `eslint-disable`. Este hook no ' +
  'reemplaza a `pnpm verify` ni a la CI: solo adelanta el momento en que te enteras.';

const { stop_hook_active: bloqueoActivo } = payload();

// El anti-bucle. Va antes que todo lo demas: si el bloqueo anterior fue de este hook, lo unico
// correcto es callarse, y no cuesta ni una llamada a git.
if (bloqueoActivo === true) process.exit(0);

if (!tomarLock()) {
  pasar('otro turno esta linteando ahora mismo; este no espera para no gastar su timeout');
}

// **`process.on('exit')` y no un `finally`**: todas las salidas de abajo pasan por
// `process.exit()`, que termina el proceso en el acto y **no corre los `finally`**. Con un
// `try/finally` el lock quedaria puesto en cada bloqueo y en cada `pasar`, y a partir de ahi
// el hook diria «otro turno esta linteando» durante un minuto entero — mudo, en verde y sin
// que nada avise. Este handler si corre, incluida la salida por `process.exit`.
//
// Va DESPUES de `tomarLock`: si no lo tomamos, el lock es de otro y borrarlo seria peor.
process.on('exit', soltarLock);

{
  const archivos = cambiados();

  // El caso mas comun, y tiene que costar cero.
  if (archivos.length === 0) process.exit(0);

  // El binario, preguntado antes de lanzarlo. **Sin este chequeo el hook bloquea cuando
  // ESLint no esta**: node arranca igual, no encuentra el modulo y sale con status 1 —el
  // MISMO que usa ESLint para «hay hallazgos»— escribiendo el «Cannot find module» por
  // stderr. Un `node_modules` a medio instalar trabaria todos los turnos con un stack trace
  // por mensaje, que es lo contrario de fallar abierto. Lo encontro el test, no el diseno.
  if (!existsSync(ESLINT)) pasar('eslint no esta instalado, no se verifico');

  let salida;
  try {
    salida = execFileSync(
      process.execPath,
      [ESLINT, '--max-warnings', '0', '--no-warn-ignored', ...archivos],
      { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: TOPE_DEL_BUFFER },
    );
  } catch (error) {
    // **El discriminante es exit 1 CON hallazgos por STDOUT**, y las dos mitades hacen falta.
    // ESLint escribe sus hallazgos por stdout y sus fallas por stderr, asi que un exit 1 con
    // stdout vacio no es un hallazgo sino la herramienta rota —un modulo que no carga, un
    // plugin que tira al importarse—. Todo lo demas —la config ausente, que es exit 2— cae
    // solo en el `pasar` de abajo.
    //
    // Y `--no-warn-ignored` es lo que impide el falso positivo del archivo cambiado que cae
    // bajo `globalIgnores` (`dist`, `.claude/worktrees`): con `--max-warnings 0`, ese aviso
    // seria un exit 1 y un bloqueo por un archivo que el repo decidio no lintear.
    const hallazgos = `${error.stdout ?? ''}`.trim();
    if (error.status === 1 && hallazgos.length > 0) {
      bloquear(`El lint encontro esto en lo que cambiaste:\n\n${recortar(hallazgos)}\n\n${COMO_SALIR}`);
    }
    pasar(`no se pudo correr eslint (status ${String(error.status)}), no se verifico`);
  }

  // Exit 0 y arbol limpio: no hay nada que decir, y decirlo seria ruido en cada turno.
  if (salida.trim().length > 0) pasar(salida.trim());
  process.exit(0);
}
