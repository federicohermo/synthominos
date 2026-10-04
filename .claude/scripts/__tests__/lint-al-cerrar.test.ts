import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

/**
 * El hook del spec 048: al cerrar el turno, se lintea lo que cambio.
 *
 * **Se prueba contra un repo FABRICADO**, por el mismo motivo que el gate del 037: el hook
 * decide leyendo `git diff` y `git ls-files`, asi que ejercerlo de verdad pide ensuciar el
 * arbol — y hacerlo sobre este repo dejaria archivos sueltos si un test se cae a la mitad.
 * Con un repo de juguete los cambios son de verdad y el hook corre sin un solo parametro de
 * test. No hay variable de entorno que le diga que hacer: un backdoor de testing en un hook
 * es la primera cosa que alguien usa para saltearlo.
 *
 * ## ESLint es el REAL, y por que eso importa
 *
 * `node_modules/` entra al repo de juguete por un enlace al del repo, asi que lo que corre es
 * el ESLint de verdad con un exit code de verdad — que es la unica entrada que este hook mira.
 * Lo que **no** es real es la config: el juguete trae una minima con una sola regla
 * (`TSEnumDeclaration`) y **sin informacion de tipos**. Es a proposito y esta medido: la config
 * real cuesta 4,42 s por invocacion y estos tests la llamarian cinco veces. Lo que se verifica
 * aca es el hook —que junta los archivos, filtra, decide por exit code y no bloquea de mas—,
 * no las reglas del repo, que las verifica `pnpm lint`.
 *
 * ## Los dos repos de juguete
 *
 * El segundo, **sin ESLint**, no es duplicacion: es el unico oraculo honesto de dos casos.
 * «Un `.png` no lo intenta» y «el binario ausente deja pasar diciendolo» solo se distinguen
 * si el hook, ante un archivo filtrado, sale **sin decir nada** aunque ESLint no exista. Con
 * ESLint presente los dos casos se ven igual —exit 0— y el test seria verde sin probar nada.
 *
 * Este archivo esta fuera del `include` de coverage (`src/**`), asi que no entra al umbral de
 * 100: el criterio de suficiencia es que cada caso sea un modo de falla real.
 */

/**
 * **El timeout se afloja acá, y no es pereza.** Cada caso que llega a ESLint arranca un
 * proceso de verdad: medido con la maquina descargada, 1,4 s por caso; con los cuatro nodos de
 * `verify` compitiendo por CPU —y este repo corre lotes de N carriles a la vez— el mismo caso
 * se midio en 6,1 s y volteo la suite contra el `testTimeout: 5_000` del default. Es el modo
 * de falla del spec 029: un rojo espurio en el nodo de convergencia entrena a leer el rojo
 * como ruido. Acá no se mide tiempo —lo que se verifica es el veredicto del hook, que sale de
 * un exit code— asi que el techo solo tiene que ser holgado. 30 s es el mismo numero que el
 * `timeout` del hook en `.claude/settings.json` y que el de `vite.config.ts` bajo coverage.
 */
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOOK_REAL = resolve(AQUI, '../lint-al-cerrar.mjs');
const NODE_MODULES_REAL = resolve(AQUI, '../../../node_modules');

/** El mismo que el hook: es un recurso de la maquina, no del repo, y por eso se comparte. */
const LOCK = join(tmpdir(), 'pentomino-lint-al-cerrar.lock');

/**
 * La config del juguete. Una sola regla, y `.md` NO entra: el hook lo tiene en su filtro pero
 * lintear Markdown pide el plugin de `@eslint/markdown`, y este archivo no verifica reglas.
 */
const CONFIG = [
  "import tseslint from 'typescript-eslint'",
  'export default [',
  "  { files: ['**/*.ts'],",
  '    languageOptions: { parser: tseslint.parser },',
  "    rules: { 'no-restricted-syntax': ['error', {",
  "      selector: 'TSEnumDeclaration', message: 'Cero enum: const-object y union derivado.' }] } },",
  "  { files: ['**/*.js'], rules: {} },",
  ']',
].join('\n');

let repo: string;
let repoSinEslint: string;

interface Salida { code: number; stdout: string; stderr: string }

/** Corre el hook en el repo indicado y devuelve exit code y las dos salidas. */
function correr(donde: string, entrada = '{"hook_event_name":"Stop"}'): Salida {
  try {
    const stdout = execFileSync(process.execPath, [join(donde, '.claude/scripts/lint-al-cerrar.mjs')], {
      input: entrada, encoding: 'utf8', cwd: donde, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const error = e as { status: number | null; stdout: string; stderr: string };
    return { code: error.status ?? -1, stdout: error.stdout, stderr: error.stderr };
  }
}

/** Fabrica un repo de juguete con el hook real adentro, con o sin ESLint alcanzable. */
function fabricar(prefijo: string, conEslint: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), prefijo));
  mkdirSync(join(dir, '.claude/scripts'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });

  // El hook de verdad, no una reimplementacion: si alguien lo edita, esto lo prueba.
  cpSync(HOOK_REAL, join(dir, '.claude/scripts/lint-al-cerrar.mjs'));
  writeFileSync(join(dir, 'src/limpio.ts'), 'export const dos = 2;\n');

  if (conEslint) {
    // `junction` para que ande en Windows sin permisos de administrador; en POSIX el tipo se
    // ignora y queda un symlink comun.
    symlinkSync(NODE_MODULES_REAL, join(dir, 'node_modules'), 'junction');
    writeFileSync(join(dir, 'eslint.config.mjs'), CONFIG);
  }

  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.email', 'hook@test');
  git('config', 'user.name', 'Hook');
  // `node_modules` no se commitea ni se mira: si entrara, `git ls-files --others` devolveria
  // el arbol entero de dependencias y el hook intentaria lintearlo.
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
  git('add', '-A');
  git('commit', '-m', 'inicial', '--no-gpg-sign');
  return dir;
}

/** Deja el arbol del juguete como recien clonado, para que cada caso arranque de cero. */
function limpiar(donde: string) {
  execFileSync('git', ['checkout', '--', '.'], { cwd: donde, stdio: 'pipe' });
  execFileSync('git', ['clean', '-fd'], { cwd: donde, stdio: 'pipe' });
}

beforeAll(() => {
  repo = fabricar('lint-al-cerrar-', true);
  repoSinEslint = fabricar('lint-al-cerrar-pelado-', false);
});

afterEach(() => {
  limpiar(repo);
  limpiar(repoSinEslint);
  if (existsSync(LOCK)) unlinkSync(LOCK);
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(repoSinEslint, { recursive: true, force: true });
});

describe('bloquea el cierre cuando hay un hallazgo', () => {
  it('un archivo modificado con un `enum`: exit 2, y el texto nombra el archivo', () => {
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    // Exit 2 es lo unico que impide que el turno cierre, y el texto va por STDERR: un JSON en
    // stdout sin exit 2 no bloquea nada.
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('limpio.ts');
    expect(r.stderr).toContain('Cero enum');
  });

  it('un archivo NUEVO sin trackear, que `git diff` no ve', () => {
    // El caso que se olvida, y el que un agente produce todo el tiempo: un archivo recien
    // creado no aparece en `git diff` ni en `--cached`. Lo ve `git ls-files --others`.
    writeFileSync(join(repo, 'src/nuevo.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('nuevo.ts');
  });

  it('un archivo BORRADO en el mismo turno no apaga la verificacion del resto', () => {
    // **Fallo en verde medido.** `git diff --name-only` lista los borrados igual que los
    // modificados, y ESLint sobre una ruta que no existe sale con status 2 —«No files
    // matching the pattern»—, que el hook lee como «no pude decidir» y deja pasar. Antes del
    // filtro por `existsSync`, borrar `docs/guides/troubleshooting.md` en el repo real hacia
    // que un `enum` recien escrito en `src/pieces/transform.ts` saliera con exit 0. Y borrar
    // no es raro aca: la convencion es que los borrados van en su propio commit.
    rmSync(join(repo, 'src/limpio.ts'));
    writeFileSync(join(repo, 'src/nuevo.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('nuevo.ts');
  });

  it('un archivo con acento en el nombre: git lo cita, y el hook igual lo ve', () => {
    // Con el `core.quotePath` por default, `git ls-files` devuelve `"src/sesión.ts"` como
    // `"src/sesi\303\263n.ts"` —comillas incluidas—, asi que la extension deja de ser `.ts` y
    // el archivo se cae del filtro. En un repo que se escribe en espanol, eso es un archivo
    // que el hook no mira nunca y sin decirlo.
    writeFileSync(join(repo, 'src/sesión.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Cero enum');
  });

  it('una salida enorme se recorta, en vez de volcarse entera o perderse', () => {
    // Las dos mitades del mismo bug. El `maxBuffer` por default de `execFileSync` es 1 MiB y
    // pasarse NO se parece a un hallazgo: es `ENOBUFS` con `status: null`, o sea que el hook
    // fallaba abierto justo cuando mas hallazgos hay. Y devolverlos enteros seria volcar el
    // contexto del agente, que es lo contrario de «el mensaje dice como salir».
    //
    // **El numero de errores esta elegido para pasar 1 MiB de salida, no de mas**: con menos
    // el caso corre por el camino feliz y el test queda verde con el `maxBuffer` sacado, o sea
    // verificando solo la mitad. Medido con un pase de mutacion sobre las dos guardas.
    const muchos = Array.from({ length: 15_000 }, (_, i) => `export enum M${i} { a }`).join('\n');
    writeFileSync(join(repo, 'src/limpio.ts'), `${muchos}\n`);
    const r = correr(repo);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('recortado');
    expect(r.stderr.length).toBeLessThan(20_000);
  });

  it('el mensaje SIEMPRE dice como salir: sin eso, el reflejo es apagar el hook', () => {
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repo);
    expect(r.stderr).toContain('pnpm lint');
    // Y que no se lea como un reemplazo de `verify`, que seria peor que no tenerlo.
    expect(r.stderr).toContain('no reemplaza');
  });
});

describe('sale callado cuando no hay nada que decir', () => {
  it('el arbol sin cambios', () => {
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('un archivo cambiado y limpio', () => {
    writeFileSync(join(repo, 'src/limpio.ts'), 'export const tres = 3;\n');
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('un turno que SOLO borra: callado, y no «no se pudo correr eslint»', () => {
    // La otra mitad del caso de arriba, y la que distingue «lo filtre» de «lo intente y
    // fallo»: si el borrado llegara a ESLint, la salida diria que no se pudo correr.
    rmSync(join(repo, 'src/limpio.ts'));
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('un `.png` cambiado: ni lo intenta', () => {
    // **En el repo SIN ESLint**, que es lo que vuelve falsificable a este caso: si el filtro
    // de extensiones no estuviera, el hook llamaria a un binario que no existe y saldria
    // diciendo «no se pudo correr eslint». Salida vacia = no lo intento.
    writeFileSync(join(repoSinEslint, 'src/captura.png'), 'export enum Malo { a }\n');
    const r = correr(repoSinEslint);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});

describe('deja pasar cuando no pudo decidir, y lo dice', () => {
  it('el binario de ESLint no esta', () => {
    // La salida por defecto de todo fallo es dejar pasar contando por que: un hook que bloquea
    // cuando no pudo decidir se desactiva el primer dia que su dependencia falla.
    //
    // **Este caso encontro un bug de verdad**, y es el motivo por el que el hook pregunta por
    // el binario antes de lanzarlo: node arranca igual, no encuentra el modulo y sale con
    // status 1 —el MISMO que ESLint usa para «hay hallazgos»— con el «Cannot find module» por
    // stderr. La primera version leia eso como un hallazgo y **bloqueaba el turno con un stack
    // trace**, o sea justo lo contrario de fallar abierto.
    writeFileSync(join(repoSinEslint, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repoSinEslint);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('eslint no esta instalado');
  });

  it('la config de ESLint no esta', () => {
    renameSync(join(repo, 'eslint.config.mjs'), join(repo, 'eslint.config.guardada'));
    try {
      writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
      const r = correr(repo);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('no se pudo correr eslint');
    } finally {
      renameSync(join(repo, 'eslint.config.guardada'), join(repo, 'eslint.config.mjs'));
    }
  });
});

describe('no se traba a si mismo', () => {
  it('`stop_hook_active: true` con un hallazgo presente: sale callado igual', () => {
    // El anti-bucle. Sin esto el hook bloquea sobre su propio bloqueo y la sesion no cierra
    // nunca — la plataforma corta a los ocho intentos, pero ocho turnos ya son la sesion.
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    const r = correr(repo, '{"hook_event_name":"Stop","stop_hook_active":true}');
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('el lock ya tomado: deja pasar diciendolo, y sin esperar', () => {
    // Con `SubagentStop` declarado, N carriles terminan casi a la vez. El que no puede tomar
    // el lock no espera —esperar seria gastar el timeout para llegar tarde a decir lo mismo—
    // y por eso este caso tiene que ser rapido aunque haya un hallazgo servido.
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    writeFileSync(LOCK, '999999');
    const r = correr(repo);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('otro turno esta linteando');
  });

  it('y el lock queda liberado despues de cada corrida', () => {
    // Si no se liberara, el hook diria «otro turno esta linteando» durante un minuto entero:
    // mudo, en verde y sin que nada avise. Es el modo de falla que este repo persigue.
    writeFileSync(join(repo, 'src/limpio.ts'), 'export enum Malo { a }\n');
    expect(correr(repo).code).toBe(2);
    expect(existsSync(LOCK)).toBe(false);
  });
});
