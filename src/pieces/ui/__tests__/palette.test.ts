import { describe, it, expect } from 'vitest';
import { PIECE_COLOR, CONTRAST_LC, LC_EXCEPCIONES } from '../palette.constants.ts';
import { BASE_MAP } from '../../../musical-model/domain/music.constants.ts';
import type { PieceKey } from '../../domain/pieces.types.ts';

/**
 * AC7: el texto de cada celda contrasta con el color de su pieza.
 *
 * Es el primer test de `components/` y es PURO: constantes y aritmetica, sin DOM y
 * sin React. Corre en el `environment: 'node'` que ya usa el resto del repo.
 *
 * La formula esta reimplementada aca a proposito. Si `palette.constants.ts`
 * exportara un `contraste()` y el test lo llamara, el test verificaria que la tabla
 * es consistente consigo misma; recalculando desde `bg` verifica lo unico que
 * importa: que `fg` siga siendo el mejor de negro/blanco DESPUES de que alguien
 * retoque un `bg` y se olvide del `fg`.
 *
 * ## Por que APCA y no WCAG 2.1
 *
 * La version anterior de este test usaba la razon de contraste de WCAG 2.1 con piso
 * 4.5:1, y elegia mal: sobre los fondos saturados de tono medio (`I`, `P`, `T`, `U`,
 * `X`) declaraba ganador al negro con numeros que APCA pone bien debajo del piso de
 * legibilidad. El detalle del cambio, con las mediciones, esta en el doc de
 * `palette.constants.ts`. APCA es el algoritmo candidato de WCAG 3 y modela la
 * polaridad —texto claro sobre fondo oscuro no es simetrico de su inverso—, que es
 * justo lo que 2.1 no hace y lo que este caso necesitaba.
 */

const PIECES = Object.keys(BASE_MAP) as PieceKey[];

const NEGRO = '#000000';
const BLANCO = '#FFFFFF';

/**
 * Luminancia APCA: potencia 2.4 simple sobre el canal sRGB, sin el tramo lineal
 * bajo de WCAG 2.1. No es un descuido de portabilidad, es el modelo de APCA.
 */
function luminanciaY(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const canal = (desplazamiento: number) => Math.pow(((n >> desplazamiento) & 255) / 255, 2.4);
  return 0.2126729 * canal(16) + 0.7151522 * canal(8) + 0.0721750 * canal(0);
}

/** Ablande de negros: sin esto los fondos muy oscuros dan Lc inflado. */
function ablandar(y: number): number {
  return y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y;
}

/**
 * Contraste APCA (Lc) entre texto y fondo, en valor absoluto.
 *
 * Los exponentes van de a pares y cambian segun la polaridad: 0.56/0.57 para texto
 * oscuro sobre fondo claro, 0.65/0.62 para texto claro sobre fondo oscuro. Esa
 * asimetria es la diferencia de fondo con WCAG 2.1, que usa un cociente y por lo
 * tanto da lo mismo en los dos sentidos.
 */
function lc(texto: string, fondo: string): number {
  const yTexto = ablandar(luminanciaY(texto));
  const yFondo = ablandar(luminanciaY(fondo));
  const s = yFondo > yTexto
    ? (Math.pow(yFondo, 0.56) - Math.pow(yTexto, 0.57)) * 1.14
    : (Math.pow(yFondo, 0.65) - Math.pow(yTexto, 0.62)) * 1.14;
  if (Math.abs(s) < 0.1) return 0;
  return Math.abs(s > 0 ? s - 0.027 : s + 0.027) * 100;
}

describe('PIECE_COLOR', () => {
  it('tiene una entrada por pieza, con hex de 6 digitos', () => {
    expect(Object.keys(PIECE_COLOR).sort()).toEqual([...PIECES].sort());
    for (const p of PIECES) {
      expect(PIECE_COLOR[p].bg).toMatch(/^#[0-9A-F]{6}$/);
      expect([NEGRO, BLANCO]).toContain(PIECE_COLOR[p].fg);
    }
  });

  it('el fg de cada pieza es el mejor de negro/blanco contra su bg', () => {
    // Este es el test que mantiene `bg` y `fg` sincronizados, y el unico que aplica
    // a las 12 sin excepcion: aun donde ningun `fg` llega al piso, elegir el peor
    // de los dos sigue siendo un error.
    for (const p of PIECES) {
      const { bg, fg } = PIECE_COLOR[p];
      const mejor = lc(NEGRO, bg) >= lc(BLANCO, bg) ? NEGRO : BLANCO;
      expect(fg, `${p} (${bg}) deberia usar ${mejor}`).toBe(mejor);
    }
  });

  it('las 10 no exceptuadas llegan al piso de Lc con su fg', () => {
    for (const p of PIECES) {
      if ((LC_EXCEPCIONES as readonly string[]).includes(p)) continue;
      const { bg, fg } = PIECE_COLOR[p];
      expect(lc(fg, bg), `${p} (${bg})`).toBeGreaterThanOrEqual(CONTRAST_LC);
    }
  });

  it('las exceptuadas siguen sin llegar al piso con NINGUN fg', () => {
    // La excepcion se justifica sola o no se justifica. Si alguien aclara el `bg` de
    // `L` o `Y` lo suficiente, este test falla y obliga a sacarla de la lista en vez
    // de dejar una excepcion sin motivo — que es como las excepciones se
    // vuelven permanentes.
    for (const p of LC_EXCEPCIONES) {
      const { bg } = PIECE_COLOR[p];
      const mejorPosible = Math.max(lc(NEGRO, bg), lc(BLANCO, bg));
      expect(mejorPosible, `${p} (${bg}) ya llega a ${CONTRAST_LC}`).toBeLessThan(CONTRAST_LC);
    }
  });

  it('las piezas de texto blanco son exactamente I, L, P, T, U, W y X', () => {
    // No es cosmetico: si otro bg cambia hasta pedir el otro color de texto, el
    // cambio deja de ser "un color distinto" y pasa a mover el equilibrio de la
    // lamina entera. Fijar la lista hace que eso se note en la revision.
    const blancas = PIECES.filter(p => PIECE_COLOR[p].fg === BLANCO).sort();
    expect(blancas).toEqual(['I', 'L', 'P', 'T', 'U', 'W', 'X']);
  });

  it('los 12 fondos son distintos entre si', () => {
    // Dos piezas con el mismo fondo dejarian de ser distinguibles en el tablero,
    // que es justo lo unico que el color esta ahi para hacer.
    const bgs = PIECES.map(p => PIECE_COLOR[p].bg);
    expect(new Set(bgs).size).toBe(PIECES.length);
  });
});

/**
 * El borde de la miniatura de la paleta.
 *
 * ## Por que aca vuelve WCAG 2.1, despues de todo lo de arriba
 *
 * No es una recaida: es otro criterio para otra cosa. Lo de arriba elige el color
 * del TEXTO que va sobre un color de pieza, y para eso APCA predice mejor — ese es
 * el argumento y sigue en pie. Una celda pintada de la miniatura, en
 * cambio, es un OBJETO GRAFICO: no lleva texto, y lo unico que se le pide es
 * distinguirse del fondo sobre el que se apoya. Eso lo cubre WCAG 1.4.11, cuyo piso
 * es la razon 3:1 de 2.1. Confundir los dos criterios es mirar la tabla equivocada.
 *
 * ## Que fija este test
 *
 * Los numeros que el `.tsx` y `DESIGN.md` citan para justificar que el borde se
 * INVIERTE con el estado del boton. El hecho que lo hace necesario es que los
 * conjuntos de piezas que fallan en cada estado son DISJUNTOS: ningun color de borde
 * fijo cubre los dos, y sin este test eso vive solo en tres comentarios que nada
 * sincroniza.
 *
 * LIMITE conocido: los tres hex de abajo son los valores que Tailwind le da a las
 * clases que `PiecePalette.tsx` escribe, y estan copiados. Si ese archivo cambia
 * `bg-slate-900` por otra clase, este test sigue en verde midiendo el fondo viejo.
 * No hay forma de leerlos desde aca sin sacar los fondos del idioma de Tailwind.
 */
const BOTON_REPOSO = '#f1f5f9';   // `bg-slate-100`, el boton sin seleccionar
const BOTON_ACTIVO = '#0f172a';   // `bg-slate-900`, el boton seleccionado
const BORDE_CLARO = '#94a3b8';    // `border-slate-400`, el borde sobre el activo
const BORDE_OSCURO = '#0f172a';   // `border-slate-900`, el borde sobre el reposo

const PISO_GRAFICO = 3;

/** Razon de contraste de WCAG 2.1: cociente de luminancias relativas, con el tramo lineal bajo. */
function razon(a: string, b: string): number {
  const relativa = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const canal = (d: number) => {
      const c = ((n >> d) & 255) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(16) + 0.7152 * canal(8) + 0.0722 * canal(0);
  };
  const [alta, baja] = [relativa(a), relativa(b)].sort((x, y) => y - x);
  return (alta + 0.05) / (baja + 0.05);
}

describe('el borde de la miniatura de la paleta', () => {
  const bajoElPiso = (fondo: string) =>
    PIECES.filter(p => razon(PIECE_COLOR[p].bg, fondo) < PISO_GRAFICO).sort();

  it('sin el borde, siete piezas no se ven sobre el boton en reposo', () => {
    // La peor es `V` (#FFFF00) con 1,02: el amarillo sobre el gris claro es
    // practicamente el mismo color. Es el motivo por el que el punto de color
    // llevaba borde desde el 007, y el que la miniatura hereda.
    expect(bajoElPiso(BOTON_REPOSO)).toEqual(['F', 'L', 'N', 'V', 'X', 'Y', 'Z']);
    expect(razon(PIECE_COLOR.V.bg, BOTON_REPOSO)).toBeCloseTo(1.02, 2);
  });

  it('sobre el boton seleccionado la que falla es otra, y es una sola', () => {
    // `W` (#0000FF) contra el casi negro. Las otras once son claras o saturadas y
    // ganan contraste al invertirse el fondo — que es justo por lo que este caso
    // se paso por alto al implementar: el estado de reposo se ve perfecto.
    expect(bajoElPiso(BOTON_ACTIVO)).toEqual(['W']);
    expect(razon(PIECE_COLOR.W.bg, BOTON_ACTIVO)).toBeCloseTo(2.08, 2);
  });

  it('los dos conjuntos son DISJUNTOS, que es lo que obliga a invertir el borde', () => {
    // Esta es la afirmacion que sostiene la decision entera. Si alguna vez dejaran
    // de serlo —una pieza que falle en los dos estados— la salida no seria
    // invertir el borde sino mover el color de esa pieza.
    const enReposo = new Set(bajoElPiso(BOTON_REPOSO));
    const enActivo = bajoElPiso(BOTON_ACTIVO);
    expect(enActivo.filter(p => enReposo.has(p))).toEqual([]);
  });

  it('cada borde llega al piso contra el fondo donde SE USA', () => {
    expect(razon(BORDE_OSCURO, BOTON_REPOSO)).toBeGreaterThanOrEqual(PISO_GRAFICO);
    expect(razon(BORDE_CLARO, BOTON_ACTIVO)).toBeGreaterThanOrEqual(PISO_GRAFICO);
  });

  it('y ninguno de los dos serviria para los DOS fondos', () => {
    // El bug que este ajuste corrige, escrito como test: `slate-900` sobre el boton
    // seleccionado da exactamente 1,00 porque es el mismo color que su fondo — el
    // borde no se ve mal, no existe. Y el candidato obvio para reemplazarlo en los
    // dos lados, `slate-400` (el que llevaba el punto de color, y el que AC7 mandaba
    // heredar), tampoco llega sobre el claro.
    expect(razon(BORDE_OSCURO, BOTON_ACTIVO)).toBeCloseTo(1.0, 2);
    expect(razon(BORDE_CLARO, BOTON_REPOSO)).toBeLessThan(PISO_GRAFICO);
  });
});
