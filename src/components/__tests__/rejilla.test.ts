import { describe, it, expect } from 'vitest';
import { anchoDeRejilla, columnasRectangulares, COLUMNAS_DEL_DOCK } from '../rejilla.ts';
import { CASILLA_PX, REJILLA_ANCHO_TECHO_PX, REJILLA_GAP_PX } from '../constants/layout.constants.ts';

/** Lo que ocupan `c` columnas de casilla, por la misma cuenta que usa el módulo. */
const anchoDe = (c: number) => anchoDeRejilla(c, CASILLA_PX, REJILLA_GAP_PX);

/**
 * AC1 sin navegador: que la respuesta divida a doce siempre.
 *
 * La medición del DOM —que las doce casillas caigan de verdad en `c × f` filas y columnas—
 * es de `OrientationPanel.browser.test.tsx`. Acá se agota la regla, que es donde vive el
 * bug: `auto-fill` contesta la mayor cantidad que entre, divida o no.
 */
describe('052 AC1 — las doce forman un rectángulo lleno', () => {
  it('cada cantidad de columnas entra en cuanto su ancho alcanza', () => {
    // Los anchos del research §6, recalculados con la casilla nueva. Se pide el ancho
    // EXACTO que cada cantidad necesita, que es donde el `<=` de la fórmula se decide.
    const esperado: [cols: number, ancho: number][] = [
      [2, 100], [3, 152], [4, 204], [6, 308],
    ];
    for (const [cols, ancho] of esperado) {
      expect(anchoDe(cols), `${cols} columnas`).toBe(ancho);
      expect(columnasRectangulares(12, ancho, CASILLA_PX, REJILLA_GAP_PX), `${ancho} px`).toBe(cols);
      // Y con un píxel menos no entra: es lo que fija que la comparación sea `<=` y no
      // `<`, o el default de 4 columnas con techo 220 caería en 3.
      //
      // Sobre la MENOR candidata no se pregunta, y no es una excepción cómoda: ahí abajo no
      // hay ninguna divisora propia que devolver, así que el piso contesta 2 igual. Es la
      // misma respuesta que el caso «un techo que no da ni para dos columnas» de más abajo,
      // y pedirle que baje sería pedirle que devuelva el 1 que este módulo existe para no
      // devolver.
      if (cols > 2) {
        expect(columnasRectangulares(12, ancho - 1, CASILLA_PX, REJILLA_GAP_PX), `${ancho - 1} px`)
          .toBeLessThan(cols);
      }
    }
  });

  it('la respuesta siempre divide a doce, y nunca es 1 ni 12', () => {
    // El barrido entero del rango de anchos posibles, de a un píxel: es lo que vuelve
    // imposible que un ancho intermedio devuelva 5, 7 u 11.
    for (let ancho = 0; ancho <= 700; ancho++) {
      const c = columnasRectangulares(12, ancho, CASILLA_PX, REJILLA_GAP_PX);
      expect(12 % c, `${ancho} px dio ${c}`).toBe(0);
      expect([2, 3, 4, 6], `${ancho} px`).toContain(c);
    }
  });

  it('un ancho que admite 5 columnas sigue dando 4 — el caso que mata a auto-fill', () => {
    // La falsabilidad que AC1 escribe. 5 columnas piden 256 px y entran; `auto-fill`
    // devolvería 5 y dejaría 3 huecos en la última fila. Este es el test que da rojo si
    // alguien vuelve a delegarle la cuenta al navegador.
    const ancho = anchoDe(5);
    expect(ancho).toBe(256);
    expect(columnasRectangulares(12, ancho, CASILLA_PX, REJILLA_GAP_PX)).toBe(4);
  });

  it('el techo del repo cae en 4 columnas, que es el default medido', () => {
    expect(columnasRectangulares(12, REJILLA_ANCHO_TECHO_PX, CASILLA_PX, REJILLA_GAP_PX)).toBe(4);
    // Y es la que el dock dibuja: la constante que leen el panel y la posición inicial.
    expect(COLUMNAS_DEL_DOCK).toBe(4);
    // Y la palanca funciona: subir el techo a lo que piden 6 columnas da un dock de 6 × 2
    // sin tocar el componente.
    expect(columnasRectangulares(12, anchoDe(6), CASILLA_PX, REJILLA_GAP_PX)).toBe(6);
  });

  it('un techo que no da ni para dos columnas cae en la MENOR, no en el bug', () => {
    // El piso. Devolver 1 acá sería contestar con la columna única de 875 px que este spec
    // vino a sacar: no aparecería porque alguien la eligiera sino porque el ancho no
    // alcanzaba, que es la misma cadena que produjo el desborde de 1192 px.
    expect(columnasRectangulares(12, 0, CASILLA_PX, REJILLA_GAP_PX)).toBe(2);
    expect(columnasRectangulares(12, 99, CASILLA_PX, REJILLA_GAP_PX)).toBe(2);
  });

  it('un n sin divisoras propias es el único que devuelve 1', () => {
    // La rama del primo, y no es defensiva: sin este caso quedaría sin cubrir con el
    // umbral en 100. Siete iconos no tienen rectángulo no degenerado, y contestar 1 ahí es
    // la única respuesta honesta.
    expect(columnasRectangulares(7, 9999, CASILLA_PX, REJILLA_GAP_PX)).toBe(1);
    expect(columnasRectangulares(3, 9999, CASILLA_PX, REJILLA_GAP_PX)).toBe(1);
  });

  it('la última fila queda llena, que es la propiedad entera', () => {
    // La reformulación del AC en su forma directa: `c × f = n` exacto, sin huecos.
    for (const ancho of [0, 100, 152, 204, 256, 308, 620]) {
      const c = columnasRectangulares(12, ancho, CASILLA_PX, REJILLA_GAP_PX);
      const filas = 12 / c;
      expect(Number.isInteger(filas), `${ancho} px → ${c} columnas`).toBe(true);
      expect(c * filas).toBe(12);
    }
  });
});
