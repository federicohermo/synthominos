import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

/**
 * El gate del árbol de accesibilidad: las reglas de `.claude/rules/ui.md`, sección «El árbol
 * de accesibilidad dice lo que el color pinta».
 *
 * Es la sección que hasta el spec 050 no verificaba ninguna máquina.
 *
 * Qué cubre cada aserción, contra la cláusula que le corresponde:
 *
 * - «Todo control solo-icono lleva `aria-label`: **el glifo no es un nombre**» → las dos
 *   aserciones del primer caso, y hacen falta las dos: ver `SOLO_SIMBOLOS`.
 * - «La etiqueta se toma del texto visible con `aria-labelledby`, no se duplica en un
 *   `aria-label`» → la misma primera aserción, y por eso se pregunta por el nombre
 *   CALCULADO y no por el atributo: exigir `aria-label` prohibiría la forma preferida.
 * - «Todo control que alterna lleva `aria-pressed`, y su nombre es lo que alterna, no el
 *   valor» → el segundo caso, **la segunda mitad nada más**. La primera es circular y no se
 *   puede verificar acá; está en «qué NO cubre».
 * - «`type="button"` en todo `<button>`» → **no es de este archivo**: ya tiene dueño en el
 *   `describe` «App — lo que llega al arbol de accesibilidad» de `App.browser.test.tsx`, que
 *   recorre la app entera igual que éste.
 *
 * ## Por qué un archivo propio y no un `describe` más en `App.browser.test.tsx`
 *
 * Aquel archivo ya tiene un `describe` que recorre la app entera —«ningun boton de la app
 * puede enviar un formulario»—, así que la forma existe y el precedente es exacto. Pero es
 * un archivo de **casos**: verifica los gestos, el estado y los derivados del shell, con un
 * mock de `OrientationPanel` que cuenta ejecuciones y un motor que recuerda si arrancó. Un
 * gate que recorre el árbol no comparte nada de eso, y meterlo ahí lo ataría a esa
 * escenografía.
 *
 * Y hay un motivo medible: las tres falsificaciones de este archivo —sacarle el
 * `aria-label` a un botón, agregar uno vacío, renombrar un toggle al valor que ya dice su
 * `aria-pressed`— **también ponen en rojo a `App.browser.test.tsx`**. Una falsificación que
 * enrojece dos archivos no prueba cuál de los dos verificó. Separados, se corre
 * `pnpm exec vitest run src/__tests__/arbol-accesible.browser.test.tsx` y la respuesta es
 * de uno solo.
 *
 * ## La diferencia entre un test y un gate
 *
 * Los cuatro archivos que hoy consultan roles —`OrientationPanel`, `PiecePalette`,
 * `TransportPanel` y `App`— verifican **los controles que cada uno conoce**. Un control
 * nuevo sin etiqueta no rompe ninguna aserción de nombre. Este recorre **todo lo que
 * encuentra** —los controles nativos y los `role` de la lista cerrada de `ROLES`—, así que
 * falla ante un control que nadie escribió en ningún test.
 *
 * ## Qué NO cubre, que es la mitad que hay que leer antes de confiar
 *
 * - **Que el nombre sea BUENO.** Que un control tenga nombre accesible no dice que el
 *   nombre sirva: «Botón 3» pasa. Lo único que se puede decidir por máquina es que exista
 *   y —para un toggle— que no sea el valor que el propio `aria-pressed` ya anuncia.
 * - **Que un control que alterna LLEVE `aria-pressed`.** Es circular y por eso no está: el
 *   único modo de encontrar los toggles automáticamente es buscarlos **por el atributo que
 *   se quiere exigir**, así que un toggle al que se lo olvidaron no aparece en la lista y
 *   el gate lo saluda al pasar. Esa mitad sigue siendo revisión humana, y está declarada
 *   acá para que nadie lea este archivo como si la cubriera.
 * - **Un `role` que no esté en `ROLES`.** La lista es cerrada a propósito —ver su docblock—,
 *   así que un rol nuevo entra al árbol sin que este gate lo mire hasta que alguien lo
 *   agregue. Los controles NATIVOS sí entran todos, que es el caso frecuente.
 * - **El orden de tabulación**, que es la sección siguiente de `ui.md` y otro mecanismo.
 * - **El contraste**, que `DESIGN.md` trata como un test aparte (issue #50).
 * - **El comportamiento con un lector de pantalla de verdad.** Esto mira el árbol que el
 *   navegador calcula, que es una capa antes.
 */

/**
 * El motor, mockeado igual que en `App.browser.test.tsx` y por el mismo motivo: montar la
 * app entera no debería arrancar audio de verdad para contar etiquetas.
 *
 * Lo demás —el dominio, los componentes y el DOM— es real, que es de donde tiene que salir
 * el árbol.
 */
const motor = vi.hoisted(() => ({
  setSequence: vi.fn(),
  setBpm: vi.fn(),
  setClicksAudible: vi.fn(),
  startClock: vi.fn(),
  stopClock: vi.fn(),
  clockRunning: vi.fn(() => false),
  playNow: vi.fn(),
  playNotes: vi.fn(),
  playheadOffset: () => null,
  readSpectrum: () => null,
  cycleGeneration: () => 0,
}));
vi.mock('../audio/engine.ts', () => motor);

const App = (await import('../App.tsx')).default;

/**
 * Un viewport de escritorio, por lo mismo que `App.browser.test.tsx`: sin fijarlo,
 * Playwright arranca en 414 x 896 y el tablero sale de seis columnas.
 *
 * Acá no cambia el veredicto —las etiquetas son las mismas—, pero sí cuántos controles se
 * recorren, y un gate que mide menos según la ventana es un gate que se puede aflojar sin
 * tocarlo.
 */
const VIEWPORT: [number, number] = [1024, 768];

beforeEach(async () => {
  await page.viewport(...VIEWPORT);
});

/**
 * Qué cuenta como control, y por qué es una lista y no una heurística.
 *
 * Las dos mitades tienen motivos distintos. Los **nativos** entran por su etiqueta: un
 * `<button>` es un botón sin que nadie lo declare. Los **roles** entran por la lista
 * cerrada de abajo, que son los que esta app usa hoy más los vecinos obvios de cada uno —
 * un `role` nuevo que no esté acá no lo mira nadie, y eso es preferible a una heurística
 * que decida sola sobre roles que el repo todavía no tomó ninguna decisión sobre cómo
 * nombrar.
 *
 * `grid`, `gridcell` y `group` son composites y no controles, y entran igual: los tres
 * llevan nombre en esta app —el tablero, cada celda y el par de botones de régimen— y un
 * composite sin nombre es exactamente el caso que no se nota mirando la pantalla, porque
 * en la pantalla se ve el contenido.
 */
const ROLES = [
  'button', 'checkbox', 'switch', 'radio', 'link', 'tab', 'menuitem',
  'slider', 'spinbutton', 'textbox', 'combobox', 'listbox', 'option',
  'grid', 'gridcell', 'group',
];
const CONTROLES = ['button', 'input', 'select', 'textarea', 'a[href]', ...ROLES.map((r) => `[role="${r}"]`)].join(', ');

/**
 * Las palabras que son un VALOR y no un nombre, para el AC5.
 *
 * Va como lista cerrada y escrita acá porque las dos mitades de la pregunta se contestan
 * distinto: **cuál** control es un toggle lo dice el árbol —el que lleva `aria-pressed`—,
 * pero **qué palabra es un estado** no lo puede decidir ninguna máquina. «Activado» es un
 * valor y «Activar el metrónomo» es un nombre, y la diferencia es semántica.
 *
 * Están en minúscula y se comparan con un regex anclado e insensible a mayúsculas, o sea
 * que caza «Activado» y no caza «Recorrido activado en el vacío» — que sería un nombre malo
 * pero no es lo que esta regla persigue.
 */
const PALABRAS_DE_ESTADO = ['on', 'off', 'sí', 'si', 'no', 'activado', 'desactivado', 'encendido', 'apagado'];

/**
 * Un nombre hecho SOLO de símbolos, y por qué esta segunda aserción no es de más.
 *
 * La regla del repo dice «todo control solo-icono lleva `aria-label`: **el glifo no es un
 * nombre**», y ésa es justamente la parte que `toHaveAccessibleName()` a secas NO verifica:
 * el algoritmo del navegador toma el contenido del botón, así que un `<button>▶</button>`
 * **tiene** nombre accesible y es «▶». Medido: sacándole el `aria-label` al botón de
 * transporte de `TransportPanel.tsx:88`, el gate escrito con la sola aserción de existencia
 * seguía en verde — o sea que la regla que este archivo dice cerrar quedaba abierta.
 *
 * La línea que sí se puede decidir por máquina es ésta: un nombre tiene que tener **al menos
 * una letra o un dígito**. Un glifo, un emoji o una flecha no lo son en ninguna lengua, y
 * `\p{L}` / `\p{N}` es la definición de Unicode, no una lista escrita a mano. No dice que el
 * nombre sea bueno —eso está en «qué NO cubre»—, dice que hay algo que leer en voz alta.
 */
const SOLO_SIMBOLOS = /^[^\p{L}\p{N}]+$/u;

/** Cómo se nombra un control en un mensaje de falla, cuando justamente no tiene nombre. */
const señas = (el: Element) => `<${el.tagName.toLowerCase()}${el.getAttribute('role') ? ` role="${el.getAttribute('role')}"` : ''}> "${el.textContent ?? ''}"`;

describe('El arbol de accesibilidad de la app entera', () => {
  it('todo control tiene nombre accesible, y se recorren todos', async () => {
    const { container } = await render(<App />);
    const controles = [...container.querySelectorAll(CONTROLES)];

    // Un recorrido vacío pasaría en verde sin haber verificado nada, que es el modo de
    // falla que este repo ya se comió dos veces. El piso de 20 queda por debajo de los 23
    // botones que `App.browser.test.tsx` cuenta, así que cualquier número por debajo dice que
    // el selector dejó de encontrar la app y no que la app dejó de tener controles.
    expect(controles.length).toBeGreaterThan(20);

    for (const control of controles) {
      // `toHaveAccessibleName` y no leer `aria-label`: el nombre lo calcula el navegador
      // combinando texto, `aria-label`, `aria-labelledby` y contenido. La regla del repo
      // PREFIERE `aria-labelledby` sobre el texto visible, así que exigir el atributo
      // prohibiría la forma preferida — y `TransportPanel.tsx:45` la usa.
      expect(control, señas(control)).toHaveAccessibleName();
      // Y que ese nombre no sea el glifo. Ver `SOLO_SIMBOLOS`: sin esta línea la regla del
      // repo sobre los controles solo-icono queda escrita y sin verificar, que es
      // literalmente el problema que este spec vino a cerrar.
      expect(control, `${señas(control)} se llama con un glifo`).not.toHaveAccessibleName(SOLO_SIMBOLOS);
    }
  });

  it('ningun control que alterna se llama como el estado que ya anuncia', async () => {
    const { container } = await render(<App />);
    const toggles = [...container.querySelectorAll('[aria-pressed]')];

    // Mismo motivo que arriba: si el selector deja de encontrarlos, la aserción de abajo
    // no corre y nadie se entera. Hoy son los doce de `OrientationPanel`, los dos de
    // régimen y el del recorrido.
    expect(toggles.length).toBeGreaterThan(0);

    for (const toggle of toggles) {
      for (const palabra of PALABRAS_DE_ESTADO) {
        expect(toggle, `${señas(toggle)} se llama como su estado`)
          .not.toHaveAccessibleName(new RegExp(`^${palabra}$`, 'i'));
      }
    }
  });
});
