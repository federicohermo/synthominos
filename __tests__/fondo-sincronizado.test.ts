import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * El color de fondo, en los cuatro lugares donde el repo lo escribe.
 *
 * Adentro de `src/` esta unificado: hay UN token, `--color-fondo`, y de ahi
 * salen el `body` y el `div` raiz de `App.tsx`. Pero afuera de `src/` quedan tres
 * copias mas y son INEVITABLES, no un descuido: el navegador parsea el manifest y la
 * `<meta name="theme-color">` sin CSS a la vista —el manifest lo lee para pintar el
 * icono y el splash de la app instalada, y la meta para pintar la barra del navegador
 * movil—, asi que ninguna de las dos puede consumir una custom property.
 *
 * Lo que no puede pasar es que se desincronicen. Sin este test, el mismo spec que vino
 * a cerrar "un valor escrito dos veces y nada lo sincroniza" lo reintroducia cruzando
 * el borde CSS/JSON/HTML en vez del borde CSS/TSX. Un comentario en el manifest
 * tampoco era opcion: JSON no tiene comentarios.
 *
 * Es un test del proyecto `node` y no del de navegador: son tres archivos leidos del
 * disco y comparados como texto, sin un DOM en el medio.
 */

/** La raiz del repo, que es donde vive este archivo: `__tests__/` cuelga de ella. */
const raiz = new URL('../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

/**
 * Extrae el color y falla con el archivo a la vista si no esta.
 *
 * Falla explicito en vez de devolver `undefined` porque los cuatro valores se comparan
 * entre si: dos ausencias serian dos `undefined` iguales, y la igualdad se cumpliria
 * vacia. Ese es el modo de falla que este test tiene que cerrar, no el otro.
 */
const color = (texto: string, patron: RegExp, donde: string) => {
  const m = patron.exec(texto);
  if (!m) throw new Error(`No se encontro el color de fondo en ${donde}`);
  return m[1].toLowerCase();
};

const css = leer('src/styles/index.css');
const manifest = leer('public/manifest.json');
const html = leer('index.html');

describe('el color de fondo esta sincronizado fuera de `src/`', () => {
  const token = color(css, /--color-fondo:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'src/styles/index.css');

  it('AC-PNL-030 — el token existe y es un color escrito', () => {
    // Si `@theme` desaparece, Tailwind deja de generar `bg-fondo` y el `div` raiz queda
    // transparente: el fondo lo taparia el `body` y no se veria nada raro en pantalla.
    expect(token).toMatch(/^#[0-9a-f]{6}$/);
    expect(css).toContain('var(--color-fondo)');
  });

  it('AC-PNL-030 — `theme_color` y `background_color` del manifest dicen el token', () => {
    const m = JSON.parse(manifest) as { theme_color: string; background_color: string };
    expect(m.theme_color.toLowerCase()).toBe(token);
    expect(m.background_color.toLowerCase()).toBe(token);
  });

  it('AC-PNL-030 — la `<meta name="theme-color">` del `index.html` dice el token', () => {
    const meta = color(html, /<meta\s+name="theme-color"\s+content="(#[0-9a-fA-F]{3,8})"/, 'index.html');
    expect(meta).toBe(token);
  });
});
