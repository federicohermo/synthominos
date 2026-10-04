import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative } from 'node:path';

/**
 * `docs/architecture/directory-structure.md` dice ser el mapa de `src/` y de
 * `mcp-server/src/`. Este test lo verifica: todo archivo de produccion esta nombrado
 * ahi.
 *
 * Ya estaba roto cuando se escribio, y por eso existe: **cinco** archivos no
 * aparecian —los tres de `audio/constants/`, `musical-model/music.ts` y
 * `mcp-server/src/symbols.ts`—, y tres de esos cinco estaban a nivel de carpeta y sin
 * extension («voice · scheduler · engine»), que es la forma en la que un mapa se
 * desactualiza sin que se note: dice algo parecido a la verdad.
 *
 * Un doc de estructura que miente es peor que no tenerlo, porque se lee para decidir
 * donde crear un archivo. Es exactamente el argumento del 030 para las seis reglas de
 * `CLAUDE.md`, movido de las reglas a la estructura.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAPA = readFileSync(join(RAIZ, 'docs/architecture/directory-structure.md'), 'utf8');

/**
 * Lo que el mapa NO tiene que nombrar archivo por archivo, y el motivo de cada uno:
 *
 * - `__tests__/` y `__screenshots__/`  el doc los documenta a nivel de carpeta a
 *   proposito, con una linea que dice que hay uno por modulo. Enumerarlos seria un
 *   segundo indice que mantener por cada test que se agrega.
 * - `mcp-server/src/tools/`  igual: el doc dice «una tool por archivo + el array de
 *   `index.ts`», que es mas util que la lista.
 */
const FUERA = [/__tests__/, /__screenshots__/, /^mcp-server[/\\]src[/\\]tools[/\\]/];

const caminar = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return caminar(ruta);
    return [ruta];
  });

/** Los archivos de codigo de produccion, relativos a la raiz y con `/`. */
const produccion = (desde: string, extensiones: RegExp) =>
  caminar(join(RAIZ, desde))
    .map((ruta) => relative(RAIZ, ruta).replaceAll('\\', '/'))
    .filter((ruta) => extensiones.test(ruta))
    .filter((ruta) => !FUERA.some((patron) => patron.test(ruta)));

const ARCHIVOS = [
  ...produccion('src', /\.(ts|tsx|css)$/),
  // Solo el primer nivel de `mcp-server/src`: `tools/` sale por `FUERA` y no hay mas.
  ...produccion('mcp-server/src', /^mcp-server\/src\/[^/]+\.ts$/),
];

describe('`directory-structure.md` es el mapa real del codigo', () => {
  it('encuentra archivos de produccion en los dos arboles', () => {
    // Si el caminante se rompe, el test de abajo pasa sobre una lista vacia y declara
    // el mapa correcto sin haber mirado un archivo.
    expect(ARCHIVOS.length).toBeGreaterThan(30);
    expect(ARCHIVOS.some((r) => r.startsWith('mcp-server/'))).toBe(true);
  });

  it('nombra cada archivo de produccion de `src/` y de `mcp-server/src/`', () => {
    // Se busca el NOMBRE del archivo y no su ruta completa porque el doc dibuja un
    // arbol: la ruta esta implicita en la indentacion y nunca escrita entera.
    const faltan = ARCHIVOS.filter((ruta) => !MAPA.includes(ruta.split('/').at(-1)!));

    expect(faltan, `archivos que el mapa no nombra:\n${faltan.join('\n')}`).toEqual([]);
  });

  /**
   * La direccion inversa —todo lo que el mapa nombra existe— **no se verifica**, y no
   * es un olvido.
   *
   * El doc nombra `App.css`, `logo.svg`, `assets/react.svg` y `setupTests.ts`
   * **justamente porque ya no existen**: son los residuos de las plantillas de Create
   * React App y de Vite, y decir que se eliminaron es lo que evita que alguien los
   * vuelva a crear. Un gate en esa direccion los borraria del doc, y con ellos el
   * unico registro de que se fueron a proposito.
   *
   * (No hay una seccion con titulo para lo muerto: es el parrafo que dice «were
   * deleted». Buscarla por encabezado da un falso negativo. Se verifica el contenido.)
   */
  it('no verifica la direccion inversa, y lo que el doc dice de lo muerto explica por que', () => {
    // Que el parrafo siga estando es lo que sostiene la excepcion de arriba: si se
    // fuera, la asimetria pasaria a ser un agujero en vez de una decision.
    expect(MAPA).toContain('were deleted');
    expect(MAPA).toContain('setupTests.ts');
  });
});
