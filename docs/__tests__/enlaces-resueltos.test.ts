import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, relative, sep } from 'node:path';

/**
 * Todo enlace relativo de todo `.md` del repo resuelve: el archivo existe, y si el
 * enlace trae ancla, el encabezado existe.
 *
 * Es el gate que ningun linter puede dar. `markdown/no-missing-link-fragments` mira
 * las anclas de UN archivo contra sus propios encabezados, y este repo enlaza sobre
 * todo hacia AFUERA —`CLAUDE.md` a `docs/`, `docs/` entre si, los specs a los specs—,
 * que es justo lo que esa regla no ve. Por eso esta apagada en `eslint.config.js` y
 * por eso existe este archivo.
 *
 * El otro motivo de que sea un test y no una regla es el slugger. El de la regla no
 * coincide con el de GitHub sobre un encabezado con backticks y guion bajo, asi que
 * declaraba roto el unico enlace a `#find_symbol` de `mcp-domain.md`, que en GitHub
 * resuelve: **«arreglarlo» lo habria roto de verdad**. Las dos diferencias estan
 * abajo, cada una con el falso positivo que produce si se escribe de la otra forma.
 *
 * Es un test del proyecto `node`: son archivos leidos del disco y comparados como
 * texto, sin un DOM en el medio. Vive en `docs/__tests__/` y no en `src/` porque no
 * importa una sola linea de la app: verifica la DOCUMENTACION, y `src/` no tiene por
 * que saber de ella (issue #100). Como el `include` de coverage es `src/**`, tampoco
 * entra al umbral de 100 — el criterio de suficiencia es otro y esta escrito abajo.
 */

/**
 * La raiz del repo: este archivo vive en `docs/__tests__/`, a dos niveles, que es la
 * misma profundidad que tenia en `src/__tests__/`.
 *
 * Con `fileURLToPath` y no con `.pathname`: en Windows el pathname de un `file://`
 * viene como `/D:/...`, con una barra de mas adelante, y `resolve` sobre eso da una
 * ruta que no existe.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Existe y es un archivo o un directorio. */
const existe = (ruta: string) => existsSync(ruta);

/**
 * Lo que no se camina. `node_modules` es obvio; `.claude/worktrees/` no lo es y es el
 * que importa: adentro vive un checkout completo del repo, asi que sin esta linea
 * cada `.md` del proyecto se verifica una vez de mas por cada tarea en paralelo que
 * este corriendo, y el test pasa a depender de si hay una.
 */
const IGNORADOS = new Set(['node_modules', 'dist', '.git', 'worktrees', '__screenshots__', '.stryker-tmp']);

const caminar = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORADOS.has(e.name)) return [];
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return caminar(ruta);
    return e.name.endsWith('.md') ? [ruta] : [];
  });

const ARCHIVOS = caminar(RAIZ);

/**
 * El slug de un encabezado, con las reglas de GitHub y las **dos** diferencias que
 * costaron un falso positivo cada una:
 *
 * 1. **Los espacios NO se colapsan** (`/\s/g` y no `/\s+/g`). GitHub reemplaza cada
 *    espacio por un guion, uno a uno. Un encabezado con `→` —que se borra por no ser
 *    alfanumerico— queda con dos espacios seguidos y por lo tanto con DOS guiones.
 *    Con el `+` daba 4 falsos positivos, los 4 sobre encabezados con flecha.
 * 2. **El `_` se conserva.** Al limpiar los backticks es tentador barrer tambien el
 *    guion bajo; si se hace, `### \`find_symbol\`` deja de dar `find_symbol` y
 *    reaparece el falso positivo del enlace de `docs/guides/mcp-domain.md`, que en
 *    GitHub anda. El guion bajo es uno de los pocos signos que GitHub NO borra.
 */
const slug = (encabezado: string) =>
  encabezado
    .trim()
    .toLowerCase()
    // Se van los signos, y se conservan letras (con acentos), numeros, espacios,
    // guiones y guiones bajos. `\p{L}` cubre la `ñ` y las vocales acentuadas, que en
    // este repo aparecen en casi todos los encabezados.
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s/g, '-');

/**
 * Los encabezados de un `.md`, ya como slugs y con el sufijo que GitHub le agrega a
 * los repetidos (`-1`, `-2`, …). Sin el sufijo, un enlace legitimo a la segunda
 * aparicion de un titulo daria roto.
 *
 * Los fences se saltean: un `# comentario` adentro de un bloque de codigo no es un
 * encabezado, y este repo tiene arboles de directorios llenos de `#`.
 */
const anclasDe = (contenido: string) => {
  const vistos = new Map<string, number>();
  const anclas = new Set<string>();
  let enFence = false;

  for (const linea of contenido.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(linea)) { enFence = !enFence; continue; }
    if (enFence) continue;

    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(linea);
    if (!m) continue;

    const base = slug(m[2]);
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    anclas.add(n === 0 ? base : `${base}-${n}`);
  }
  return anclas;
};

/** Cache: los archivos destino se leen una vez aunque los apunten veinte enlaces. */
const cacheAnclas = new Map<string, Set<string>>();
const anclasDeArchivo = (ruta: string) => {
  const yaEsta = cacheAnclas.get(ruta);
  if (yaEsta) return yaEsta;
  const calculadas = anclasDe(readFileSync(ruta, 'utf8'));
  cacheAnclas.set(ruta, calculadas);
  return calculadas;
};

/**
 * Los enlaces `[texto](destino)` de un archivo, ya descartados los externos.
 *
 * Se saltea el contenido de los fences por el mismo motivo que en `anclasDe`: un
 * ejemplo de sintaxis adentro de un bloque de codigo no es un enlace del documento.
 */
const enlacesDe = (contenido: string) => {
  const enlaces: { destino: string; linea: number }[] = [];
  let enFence = false;

  contenido.split(/\r?\n/).forEach((texto, i) => {
    if (/^\s*(```|~~~)/.test(texto)) { enFence = !enFence; return; }
    if (enFence) return;

    for (const m of texto.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const destino = m[1];
      // Externos y protocolos: no son cosa de este gate.
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(destino)) continue;
      enlaces.push({ destino, linea: i + 1 });
    }
  });
  return enlaces;
};

/**
 * Los `specs/NNN-…/` estan **ignorados** desde el spec 034: pueden estar hidratados o
 * no, y cualquiera de los dos es correcto. Un spec hidratado que cita a otro que no lo
 * esta daria «roto» sin que nada este mal, asi que **los enlaces DE un spec HACIA otro
 * spec** dejan de verificarse — y solo esos. Todo el resto del repo, incluidos los
 * enlaces de `docs/` y del `README.md` de `specs/`, se sigue verificando igual.
 *
 * Esto era condicional hasta el spec 035: `log.md` declaraba un «regimen» —si el
 * registro vivia en el repo o en GitHub— y la excepcion valia solo en el segundo. Con
 * `log.md` borrado no hay dos mundos que distinguir: hay uno.
 */

/** ¿La ruta cae dentro de un directorio de spec, que es lo que el 034 ignora? */
const esDeUnSpec = (absoluto: string) => /[/\\]specs[/\\]\d{3}-/.test(absoluto);

describe('los enlaces relativos de la documentacion resuelven', () => {
  it('camina los `.md` del repo, y son los que su regimen tiene', () => {
    // El gate mas importante del archivo y el que parece de adorno: si el caminante
    // se rompe o si un `IGNORADOS` de mas se come medio repo, los otros dos tests
    // pasan **sin haber mirado nada**. Es el mismo «fallar en verde» que el `--filter
    // "{.}"` de `verify`, aca con otra cara.
    //
    // El piso es 25 y no 100 porque la cuenta cambio sola con el spec 034, no porque
    // el gate afloje. Medido el 2026-08-24 sobre un worktree SIN hidratar: **28**
    // archivos, contra los 170 que camina el mismo arbol con `specs/` hidratado — los
    // 142 de la diferencia son exactamente los specs. Un piso de 25 sigue siendo una
    // red que atrapa un caminante roto; lo que no podia era seguir en 100 y fallar por
    // el motivo equivocado.
    //
    // El margen es de 3 y se achica solo: la medicion anterior, del 034, daba 30. Si
    // llega a 0 el arreglo es re-medir y bajar el piso, no borrarlo.
    const piso = 25;

    expect(ARCHIVOS.length, `piso ${piso}, con specs/ hidratado o no`).toBeGreaterThan(piso);
  });

  it('cada enlace apunta a un archivo que existe', () => {
    const rotos: string[] = [];

    for (const archivo of ARCHIVOS) {
      for (const { destino, linea } of enlacesDe(readFileSync(archivo, 'utf8'))) {
        const [ruta] = destino.split('#');
        if (ruta === '') continue; // ancla propia: la mira el test de abajo
        const absoluto = resolve(dirname(archivo), ruta);

        // La unica excepcion, y es angosta a proposito: un spec citando algo de
        // `specs/`. Son dos casos y los dos son correctos.
        //
        // A otro spec: los dos estan ignorados y la hidratacion puede haber traido uno
        // y no el otro.
        //
        // Y a un archivo de `specs/` que ya no esta — el `../log.md` que el `tasks.md`
        // del 007 cita en su linea 205. Un spec mergeado **no se reescribe** (la
        // Desviacion 2, y desde el 034 su texto vive en el issue, asi que arreglarlo
        // seria editar el issue), y ademas el enlace era cierto cuando se escribio: un
        // archivo que existio y se borro es historia correcta, no un enlace roto.
        //
        // Lo que la excepcion NO cubre: un spec enlazando a `docs/` o a `src/`. Ahi el
        // destino sigue trackeado, asi que un enlace roto es un enlace roto.
        //
        // El separador al final no es cosmetico: sin el, `startsWith` tambien eximiria a
        // un hermano futuro como `specs-archivo/`, o sea que un directorio nuevo entraria
        // solo a la excepcion sin que nadie lo decida.
        if (esDeUnSpec(archivo) && absoluto.startsWith(join(RAIZ, 'specs') + sep)) continue;

        if (!ARCHIVOS.includes(absoluto) && !existe(absoluto)) {
          rotos.push(`${relative(RAIZ, archivo)}:${linea} → ${destino}`);
        }
      }
    }

    // La lista entera y no el primero: son todos los `.md` del repo, y un gate que dice «fallo»
    // sin decir donde es un gate que se apaga.
    expect(rotos, `enlaces a un archivo que no existe:\n${rotos.join('\n')}`).toEqual([]);
  });

  it('cada ancla apunta a un encabezado que existe, propia o ajena', () => {
    const rotas: string[] = [];

    for (const archivo of ARCHIVOS) {
      const contenido = readFileSync(archivo, 'utf8');
      for (const { destino, linea } of enlacesDe(contenido)) {
        const [ruta, ancla] = destino.split('#');
        if (!ancla) continue;

        const objetivo = ruta === '' ? archivo : resolve(dirname(archivo), ruta);
        if (!existe(objetivo)) continue; // ya lo reporta el test de arriba
        if (!objetivo.endsWith('.md')) continue;

        if (!anclasDeArchivo(objetivo).has(ancla.toLowerCase())) {
          rotas.push(`${relative(RAIZ, archivo)}:${linea} → ${destino}`);
        }
      }
    }

    expect(rotas, `anclas que no existen:\n${rotas.join('\n')}`).toEqual([]);
  });
});
