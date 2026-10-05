import { describe, it, expect } from 'vitest';
import { grillaPara, CELL_PX_OBJETIVO, NOTA_RAZON, PASO_RAZON } from '../grid-fit.ts';
import { GRID_MIN } from '../../board-editing/placement.ts';

/**
 * La única parte que se puede verificar sin navegador: la fórmula.
 *
 * El resto —que `--cell` se escriba con unidad, que un `resize` la reescriba, que las
 * dimensiones vuelvan como estado— es cableado y vive en `use-grid.browser.test.tsx`.
 *
 * Lo que este archivo fija es lo que el spec promete, y son tres cosas distintas: que la
 * grilla **entre** (AC1), que salga del viewport (AC2) y que la celda se quede **cerca de
 * los 73 px de siempre** (AC3).
 */

/** La tabla del research, medida sobre viewports reales. */
const VIEWPORTS: [vw: number, vh: number, cols: number, rows: number, cell: number][] = [
  [1920, 1080, 26, 15, 72.0],
  [1512, 982, 21, 13, 72.0],
  [1440, 900, 20, 12, 72.0],
  [1366, 768, 19, 11, 69.8],
  [1280, 720, 18, 10, 71.1],
  [834, 1112, 11, 15, 74.1],
  [430, 932, 6, 13, 71.7],
  [375, 667, 5, 9, 74.1],
  // El único donde manda el mínimo: 5 columnas de 73 px no entran en 320, así que lo que
  // cede es la celda. Sin eso habría scroll, que es lo primero que el spec prohíbe.
  [320, 568, 5, 8, 64.0],
];

describe('031 AC2 — la grilla sale del viewport', () => {
  it('AC-FIT-001 — la tabla de viewports entera', () => {
    for (const [vw, vh, cols, rows, cell] of VIEWPORTS) {
      const g = grillaPara(vw, vh);
      expect([g.dims.w, g.dims.h], `${vw}x${vh}`).toEqual([cols, rows]);
      expect(g.cell, `${vw}x${vh}`).toBeCloseTo(cell, 1);
    }
  });

  it('AC-FIT-002 — crece con la pantalla, que es lo que el 021 hacía con la celda', () => {
    // La comparación que da sentido al spec: el mismo par de viewports que en el 021 movía
    // la BALDOSA de 73 a 180 px, acá mueve la CANTIDAD de celdas y deja la baldosa quieta.
    const chico = grillaPara(730, 438);
    const grande = grillaPara(1920, 1080);
    expect(grande.dims.w * grande.dims.h).toBeGreaterThan(chico.dims.w * chico.dims.h * 6);
    expect(Math.abs(grande.cell - chico.cell)).toBeLessThan(2);
  });
});

/**
 * Lo que el epsilon del `floor` puede pasarse, en px.
 *
 * No es una tolerancia de conveniencia: el epsilon existe para que `20,999999997` cuente
 * como 21 columnas, y el precio simétrico es que un ancho que da `21 - 1e-13` también las
 * cuente. Medido en el barrido de abajo, el peor caso es `916 px` de viewport, donde la
 * grilla se pasa **1e-13 px**. Un navegador maquetea en unidades de 1/64 px, así que eso
 * no es un píxel de scroll: es cero redondeado a más dígitos de los que el layout tiene.
 */
const ROCE = 1e-6;

describe('031 AC1 — la grilla entra, siempre', () => {
  it('AC-FIT-004 — en ningún viewport de la tabla la grilla desborda su caja', () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { dims, cell } = grillaPara(vw, vh);
      expect(dims.w * cell, `ancho ${vw}x${vh}`).toBeLessThanOrEqual(vw + ROCE);
      expect(dims.h * cell, `alto ${vw}x${vh}`).toBeLessThanOrEqual(vh + ROCE);
    }
  });

  it('AC-FIT-005 — lo que sobra es siempre menos de una celda, en los DOS ejes', () => {
    // Es la mitad que el tercer paso de la fórmula agrega, y la que hace que «ocupa la
    // pantalla» no sea una manera de decir: sobrar una celda entera significaría que
    // entraba una fila o una columna más.
    for (const [vw, vh] of VIEWPORTS) {
      const { dims, cell } = grillaPara(vw, vh);
      expect(vw - dims.w * cell, `ancho ${vw}x${vh}`).toBeLessThan(cell);
      expect(vh - dims.h * cell, `alto ${vw}x${vh}`).toBeLessThan(cell);
    }
  });

  it('AC-FIT-005 — y también en las ventanas desproporcionadas, que es para lo que existe el tercer paso', () => {
    // Sin recontar contra la celda real, a 2000 × 300 el mínimo de 5 filas fuerza una celda
    // de 60 px y sobran 380 px de ancho: seis columnas sin usar. Los dos casos son el mismo
    // dado vuelta, así que se verifican los dos — un `Math.min` mal puesto pasa uno.
    for (const [vw, vh] of [[2000, 300], [300, 2000]]) {
      const { dims, cell } = grillaPara(vw, vh);
      expect(vw - dims.w * cell, `ancho ${vw}x${vh}`).toBeLessThan(cell);
      expect(vh - dims.h * cell, `alto ${vw}x${vh}`).toBeLessThan(cell);
    }
  });

  it('AC-FIT-006 — la cuenta es la MAXIMA que entra, y lo es en 244 anchos seguidos', () => {
    // Barrido y no un caso: lo que se verifica es la propiedad de los dos pasos juntos
    // —`cols` es el máximo que entra— y es la que un `floor` sin epsilon rompe en los
    // anchos donde `vw / cell` cae exactamente en un entero y la coma flotante lo deja en
    // `20,999999997`. Un caso solo no encuentra cuáles son.
    for (let vw = 300; vw <= 2000; vw += 7) {
      const { dims, cell } = grillaPara(vw, 800);
      expect(dims.w * cell, `${vw}`).toBeLessThanOrEqual(vw + ROCE);
      expect((dims.w + 1) * cell, `${vw}`).toBeGreaterThan(vw);
    }
  });
});

describe('031 AC3 — la baldosa se sigue viendo como siempre', () => {
  it('AC-FIT-003 — la celda se queda cerca del objetivo en todos los viewports', () => {
    for (const [vw, vh] of VIEWPORTS) {
      const { cell } = grillaPara(vw, vh);
      expect(cell, `${vw}x${vh}`).toBeGreaterThanOrEqual(64);
      expect(cell, `${vw}x${vh}`).toBeLessThanOrEqual(CELL_PX_OBJETIVO * 1.02);
    }
  });

  it('AC-FIT-015 — a la celda objetivo las dos razones tipográficas dan los px exactos de siempre', () => {
    // Es lo que hace que este spec no tenga que re-medir el aire alrededor del texto: a
    // `CELL_PX_OBJETIVO` la nota vale 19 px y el `#N` 13, que son los dos números que el
    // repo midió con un `Range` y que `Board.tsx` tenía escritos como clases de Tailwind.
    expect(CELL_PX_OBJETIVO * NOTA_RAZON).toBeCloseTo(19, 10);
    expect(CELL_PX_OBJETIVO * PASO_RAZON).toBeCloseTo(13, 10);
  });

  it('AC-FIT-007 — nunca devuelve menos que `GRID_MIN`, ni con un viewport de un píxel', () => {
    // El piso no es defensivo: abajo de 5 × 5 hay pentominós que no entran en ninguna
    // posición, y un tablero donde la `I` no se puede colocar no es un tablero chico sino
    // uno roto. Un viewport de 1 × 1 no existe en un navegador, pero sí en un test que
    // monta el hook sobre un nodo todavía sin medir.
    for (const [vw, vh] of [[1, 1], [0, 0], [100, 3000]]) {
      const { dims } = grillaPara(vw, vh);
      expect(dims.w, `${vw}x${vh}`).toBeGreaterThanOrEqual(GRID_MIN.w);
      expect(dims.h, `${vw}x${vh}`).toBeGreaterThanOrEqual(GRID_MIN.h);
    }
  });
});
