import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * El modelo de dos ramas —`staging` integra y es la default, `main` es release—, en los
 * tres lugares del arbol donde el repo lo escribe. Dos son maquinaria y el tercero es
 * la prosa que la explica.
 *
 * Sigue el molde de los otros gates de sincronizacion que ya existen:
 * `nombre-sincronizado.test.ts` cruza el nombre de la app en tres archivos,
 * `fondo-sincronizado.test.ts` el color de fondo en cuatro, y
 * `docs/__tests__/mapa-de-directorios.test.ts` el mapa de directorios contra los archivos
 * reales. Los tres leen del disco, comparan texto y corren sin red.
 *
 * Las copias son INEVITABLES. Una es YAML que GitHub Actions parsea antes de que exista
 * un proceso donde correr codigo, y la otra es el nucleo del hook de permisos: ninguna de
 * las dos puede importar una constante de la otra, y el documento lo lee una persona.
 *
 * ## Que NO mira este gate, y por que
 *
 * **El ruleset.** `main-solo-por-pr-verde` (id 21477023) es lo que de verdad impide
 * mergear en rojo, y es la unica copia del modelo que este archivo no cruza: vive en la
 * configuracion de GitHub y no en el arbol, asi que leerlo cuesta una llamada de red. Los
 * tests de este repo corren sin red a proposito.
 *
 * Se declara en vez de intentarse. Un gate que promete mas de lo que verifica es peor que
 * uno acotado que lo dice. Si algun dia se quiere cubrir, el lugar es un paso de la Action
 * y no un test: ahi hay red y hay token.
 *
 * ## Por que el YAML se extrae con un patron y no con un parser
 *
 * Porque no hay parser. El repo no depende de `yaml` ni de nada que lo lea, y no se agrega
 * una dependencia para leer dos lineas. Se extrae con la misma tecnica de los otros gates:
 * un patron, y `extraer`, que **tira nombrando el archivo** cuando no matchea.
 *
 * Que sea fragil ante un reformateo del YAML es aceptable y hasta deseable: un reformateo
 * que rompa el patron pone el gate en rojo, que es mejor que un parser permisivo leyendo
 * algo distinto de lo que lee GitHub.
 *
 * Es un test del proyecto `node`: cuatro archivos leidos del disco y comparados como
 * texto, sin un DOM en el medio. Vive en la raiz y no en `src/` porque no importa una
 * linea de la app.
 */

/** La raiz del repo, que es donde vive este archivo: `__tests__/` cuelga de ella. */
const raiz = new URL('../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

/**
 * Extrae el primer grupo del patron, y falla NOMBRANDO el archivo si no matchea.
 *
 * Falla en vez de devolver `undefined` por el mismo motivo que sus hermanos: los valores
 * se comparan entre si, y dos ausencias serian dos `undefined` iguales — la igualdad se
 * cumpliria vacia y el test pasaria sin haber mirado nada. Con una constante del hook
 * renombrada eso significaria declarar sincronizado un modelo que ya no existe.
 */
const extraer = (texto: string, patron: RegExp, donde: string) => {
  const m = patron.exec(texto);
  if (!m) throw new Error(`No se encontro el modelo de ramas en ${donde}`);
  return m[1];
};

/** Los nombres entre comillas simples o backticks de un fragmento, en orden. */
const entrecomillados = (texto: string) =>
  [...texto.matchAll(/['`]([^'`]+)['`]/g)].map((m) => m[1]);

/** Ordenado, porque el orden de una lista de ramas no significa nada. */
const conjunto = (ramas: string[]) => [...ramas].sort();

/**
 * `on.push.branches` de un workflow. El patron pide que `branches:` sea la linea siguiente
 * a `push:`, que es como esta escrito: un comentario metido en el medio lo rompe,
 * y esa fragilidad es la del docblock de arriba.
 */
const ramasDelWorkflow = (texto: string, donde: string) =>
  extraer(texto, /^\s*push:\s*\r?\n\s*branches:\s*\[([^\]]*)\]/m, donde)
    .split(',')
    .map((rama) => rama.trim());

const verify = leer('.github/workflows/verify.yml');
const politica = leer('.agents/scripts/policy.ts');
const doc = leer('docs/infra/ramas.md');

/** La celda «Ramas» de la fila que el documento le dedica a un archivo. */
const ramasSegunElDoc = (archivo: string) => {
  const fila = new RegExp(`^\\|\\s*\`${archivo.replaceAll('.', '\\.')}\`\\s*\\|[^|]*\\|([^|]*)\\|`, 'm');
  return entrecomillados(extraer(doc, fila, `docs/infra/ramas.md, fila de \`${archivo}\``));
};

const RAMAS_VERIFY = ramasDelWorkflow(verify, '.github/workflows/verify.yml');
/** Las dos ramas que el hook nombra: la de integracion y la de entrega. */
const COMPARTIDAS = ['INTEGRATION_BRANCH', 'RELEASE_BRANCH'].map((nombre) =>
  extraer(politica, new RegExp(`^export const ${nombre} = '([^']+)';`, 'm'), `.agents/scripts/policy.ts, \`${nombre}\``),
);

describe('el modelo de dos ramas dice lo mismo en la maquinaria y en el documento', () => {
  it('las dos copias de la maquinaria se leyeron y no estan vacias', () => {
    // Si un patron matcheara vacio, las comparaciones de abajo cruzarian listas vacias
    // entre si y declararian sincronizado un repo que no miraron. Es el mismo «fallar en
    // verde» que el `--filter "{.}"` de `verify`, aca con otra cara.
    const vacia = [RAMAS_VERIFY, COMPARTIDAS].map((ramas) => ramas.length === 0);

    expect(vacia, 'un patron que matchea vacio cruza listas vacias y da verde').toEqual([false, false]);
  });

  it('`verify.yml` corre sobre las ramas que el documento dice', () => {
    expect(conjunto(RAMAS_VERIFY)).toEqual(conjunto(ramasSegunElDoc('.github/workflows/verify.yml')));
  });

  it('el hook nombra las ramas que el documento dice', () => {
    expect(conjunto(COMPARTIDAS)).toEqual(conjunto(ramasSegunElDoc('.agents/scripts/policy.ts')));
  });

  it('toda rama compartida tiene corrida propia de `verify`', () => {
    // No es una tercera copia del mismo dato: es la invariante que el modelo existe para
    // sostener. Una rama que recibe trabajo de otros y que `verify` no mira es exactamente
    // el agujero que el ruleset cierra sobre `main`.
    expect(conjunto(COMPARTIDAS)).toEqual(conjunto(RAMAS_VERIFY));
  });

  it('el documento nombra los dos roles', () => {
    const staging = extraer(doc, /^\|\s*`staging`\s*\|([^|]*)\|/m, 'docs/infra/ramas.md, fila de `staging`');
    const main = extraer(doc, /^\|\s*`main`\s*\|([^|]*)\|/m, 'docs/infra/ramas.md, fila de `main`');

    expect(staging).toMatch(/Integración/i);
    expect(staging).toMatch(/default/i);
    expect(main).toMatch(/Release/i);
  });

  it('el documento declara que el ruleset no lo verifica nadie', () => {
    // La copia que este gate NO cruza. Si esa seccion desaparece, el documento pasa a
    // prometer una cobertura que este archivo no da.
    expect(doc).toMatch(/## Qué no verifica nadie/);
  });
});

describe('el gate se falsifica desde el propio test, sin mutar un archivo del repo', () => {
  // Una mutacion a mano se revierte y no deja nada que vuelva a correr (regla del 039):
  // las dos falsificaciones de abajo viven acá y se corren en cada `pnpm verify`.

  it('`extraer` tira nombrando el archivo cuando el patron no matchea', () => {
    // AC3. Renombrar `INTEGRATION_BRANCH` a mano produce este mismo error.
    expect(() => extraer('', /(no matchea nada)/, 'un archivo inventado')).toThrow(
      'No se encontro el modelo de ramas en un archivo inventado',
    );
  });

  it('un `on.push.branches` distinto del que afirma el documento da rojo', () => {
    // AC2, y lo que prueba que las comparaciones de arriba miran de verdad: el mismo
    // `ramasDelWorkflow` sobre un workflow sintetico que corre sobre otra rama NO coincide
    // con lo que `ramas.md` afirma de `verify.yml`.
    const sintetico = ramasDelWorkflow(
      'on:\n  push:\n    branches: [gh-pages]\n',
      'un workflow sintetico',
    );

    expect(conjunto(sintetico)).not.toEqual(conjunto(ramasSegunElDoc('.github/workflows/verify.yml')));
  });
});
