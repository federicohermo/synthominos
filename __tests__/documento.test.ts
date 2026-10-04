import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * El documento que envuelve a la app, leido del disco.
 *
 * Es el unico archivo del repo que ningun test podia falsear: el proyecto `browser`
 * **sirve su propio documento** y nunca carga este `index.html`, asi que un
 * `lang` equivocado no rompe una sola asercion. Por eso el test vive en el proyecto
 * `node` y lee el archivo como texto.
 *
 * El nombre no es libre: hay OTRO test que lee este mismo
 * archivo del disco —la sincronia del color de fondo entre CSS, manifest y `meta`— y
 * va en `fondo-sincronizado.test.ts`. Si los dos hubieran elegido el nombre obvio
 * (`index-html.test.ts`), el segundo carril en mergear pisaba al primero sin que el
 * merge lo viera: un archivo entero perdido en verde.
 */
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('AC-ACC-001 — declara el idioma de la interfaz, que es el que se habla adentro', () => {
    // Un lector de pantalla usa `lang` para elegir el motor de voz. Con `en`
    // —la herencia de la plantilla de Create React App— «Reflexión» y «rotación 90°»
    // se pronunciaban con fonetica inglesa, incluido el `aria-label` de las miniaturas,
    // escrito en español a proposito. WCAG 2.2 3.1.1, nivel A.
    expect(HTML).toMatch(/<html\s+lang="es"\s*>/);
    // Y que no quede la vieja en ningun lado del documento: un segundo `lang` mas
    // adentro ganaria para su subarbol sin que la primera asercion se entere.
    expect(HTML).not.toContain('lang="en"');
  });
});
