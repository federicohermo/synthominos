import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * El nombre de la app, en los tres lugares donde el repo lo escribe para que lo lea
 * una persona.
 *
 * Es el hermano exacto de `fondo-sincronizado.test.ts` y existe por el mismo motivo
 * medido, con otro valor: el color de fondo vivia en cuatro archivos y nada los
 * sincronizaba; el nombre vive en tres y tampoco. Y ya fallo una vez — el 2026-08-21
 * el `manifest.json` paso a decir «Synthominos» y el `<title>` y el README se
 * quedaron en «Pentomino Games», con `pnpm verify` **en verde**: `documento.test.ts`
 * lee este mismo `index.html` pero solo mira `lang`, y `fondo-sincronizado.test.ts`
 * compara colores. Un nombre a medio cambiar no rompia una sola asercion.
 *
 * Las tres copias son INEVITABLES, como las del color: el navegador parsea el
 * manifest y el `<title>` sin CSS ni JS a la vista —el manifest para el nombre de la
 * app instalada, el `<title>` para la pestaña— y el README lo lee una persona en
 * GitHub. Ninguno de los tres puede leer una constante de `src/`.
 *
 * ## Que NO cubre, y por que
 *
 * La identidad del **repositorio** —`package.json:name`, el remoto de GitHub, el
 * `pentomino-games` de los docs de tooling— se queda como esta y este test no la
 * mira. Son dos cosas distintas: una es como se llama el producto y la otra es donde
 * vive el codigo. Atarlas obligaria a renombrar el remoto y a repasar el deploy para
 * cambiar un `<title>`, que es exactamente el costo que hace que un rename se deje a
 * medias.
 *
 * Es un test del proyecto `node` y no del de navegador: son tres archivos leidos del
 * disco y comparados como texto, sin un DOM en el medio.
 */

/** La raiz del repo, que es donde vive este archivo: `__tests__/` cuelga de ella. */
const raiz = new URL('../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

/**
 * Extrae con el archivo a la vista y falla explicito si no esta.
 *
 * Falla en vez de devolver `undefined` por la misma razon que su gemelo del color:
 * los valores se comparan entre si, y dos ausencias serian dos `undefined` iguales
 * — la igualdad se cumpliria vacia y el test pasaria sin haber mirado nada.
 */
const extraer = (texto: string, patron: RegExp, donde: string) => {
  const m = patron.exec(texto);
  if (!m) throw new Error(`No se encontro el nombre de la app en ${donde}`);
  return m[1].trim();
};

const manifest = JSON.parse(leer('public/manifest.json')) as {
  name: string;
  short_name: string;
};
const html = leer('index.html');
const readme = leer('README.md');

describe('el nombre de la app esta sincronizado', () => {
  const nombre = manifest.name;

  it('AC-PNL-029 — el manifest declara un nombre no vacio', () => {
    expect(nombre).toBeTruthy();
  });

  it('AC-PNL-029 — el `<title>` del `index.html` dice el mismo nombre', () => {
    // Es lo que se ve en la pestaña y en el historial. Salio de la plantilla como
    // «React App»; que quede desincronizado lo devuelve a nombrar otra cosa.
    expect(extraer(html, /<title>([^<]+)<\/title>/, 'index.html')).toBe(nombre);
  });

  it('AC-PNL-029 — el encabezado del README dice el mismo nombre', () => {
    expect(extraer(readme, /^#\s+(.+)$/m, 'README.md')).toBe(nombre);
  });

  it('AC-PNL-029 — el `short_name` del manifest es el nombre o una version mas corta de el', () => {
    // La spec de PWA quiere `short_name` para cuando no entra `name`, asi que se
    // permite que sea mas corto — pero tiene que ser el MISMO nombre recortado y no
    // otro, que es como quedaria si alguien cambia uno solo de los dos campos.
    expect(nombre.startsWith(manifest.short_name)).toBe(true);
  });
});
