import type { PieceKey } from './pieces.types.ts';

/**
 * El color de cada pieza: fondo y texto que va encima.
 *
 * Los 12 fondos salen de la lamina de referencia y estan MEDIDOS, no
 * derivados: reproducirlos con una formula (rueda de matiz, HSL equiespaciado) da
 * otros colores y rompe la correspondencia con la lamina.
 *
 * Es UN solo record `Record<PieceKey, ...>` y no dos tablas paralelas, por el mismo
 * motivo por el que `BASE_MAP` esta tipado y no es `as const`: agregar una pieza sin
 * darle color pasa a ser error de compilacion, y `bg` y `fg` no pueden desalinearse
 * por indice porque viajan juntos.
 *
 * `fg` es siempre negro o blanco —el mejor de los dos contra `bg`— y esta guardado
 * en vez de calculado en el render: el calculo de luminancia WCAG no tiene por que
 * correr 60 veces por frame para devolver siempre lo mismo. Lo que impide que se
 * desincronice de `bg` es el test de `__tests__/palette.test.ts`, que recalcula el
 * contraste desde `bg` en vez de confiar en esta tabla.
 *
 * ## El criterio es APCA, no WCAG 2.1
 *
 * El `fg` llego a elegirse con la razon de contraste de WCAG 2.1 (el
 * cociente de luminancias relativas, piso 4.5:1). Ese criterio se cambio despues
 * de MEDIR las 12 con los dos modelos, y el disparador fue mirar el tablero: los
 * fondos saturados de tono medio se veian pidiendo texto blanco mientras la tabla
 * decia negro.
 *
 * La razon de 2.1 pondera el verde al 71,5% y el rojo al 21,3%, y es conocida por
 * predecir mal justo ahi — rojos, magentas y cianes saturados. Los numeros del
 * repo lo muestran sin ambiguedad: sobre `T` (`#FF0000`), 2.1 da negro 5,25 contra
 * blanco 4,00 —"gana negro"— y APCA da negro 37,6 contra blanco 69,6. El piso de
 * APCA para texto de cuerpo es Lc 60: el negro que 2.1 elegia no llegaba.
 *
 * Por eso `fg` es ahora el mejor de negro/blanco SEGUN APCA (algoritmo de WCAG 3),
 * y el numero anotado al lado de cada linea es su Lc. Los `bg` siguen siendo los
 * de la lamina, sin tocar: el cambio de criterio fue lo que permitio NO oscurecer
 * cuatro colores para hacerle lugar al blanco.
 *
 * ## Las dos marginales
 *
 * `L` (55,8) e `Y` (56,9) no alcanzan Lc 60 con ningun color de texto: les falta
 * contraste al `bg`, no al `fg`, asi que ninguna eleccion de `fg` las arregla y
 * subirlas exige mover el color de la lamina. Quedan anotadas y el test las tiene
 * como excepcion explicita, para que sea una deuda visible y no un olvido.
 */
export const PIECE_COLOR: Record<PieceKey, { bg: string; fg: string }> = {
  F: { bg: '#D9E021', fg: '#000000' },   // Lc 83,1 vs negro
  I: { bg: '#ED1E79', fg: '#FFFFFF' },   // Lc 71,9 vs blanco (negro daba 37,6)
  L: { bg: '#29ABE2', fg: '#FFFFFF' },   // Lc 55,8 — marginal, ver arriba
  N: { bg: '#8CC63F', fg: '#000000' },   // Lc 64,3
  P: { bg: '#F15A24', fg: '#FFFFFF' },   // Lc 65,6 vs blanco (negro daba 43,9)
  T: { bg: '#FF0000', fg: '#FFFFFF' },   // Lc 69,6 vs blanco (negro daba 40,0)
  U: { bg: '#009245', fg: '#FFFFFF' },   // Lc 72,5 vs blanco (negro daba 37,1)
  V: { bg: '#FFFF00', fg: '#000000' },   // Lc 101,4
  W: { bg: '#0000FF', fg: '#FFFFFF' },   // Lc 90,7 vs blanco
  X: { bg: '#00A99D', fg: '#FFFFFF' },   // Lc 60,4 vs blanco (negro daba 48,9)
  Y: { bg: '#FF7BAC', fg: '#000000' },   // Lc 56,9 — marginal, ver arriba
  Z: { bg: '#FBB03B', fg: '#000000' },   // Lc 69,4
};

/**
 * Piso de contraste del repo para texto sobre el color de pieza: APCA Lc 60, que es el
 * minimo para texto de cuerpo.
 *
 * Reemplaza al 4.5 de WCAG 2.1 AA por el motivo medido arriba. `L` e `Y` no lo alcanzan y
 * estan exceptuadas en el test.
 */
export const CONTRAST_LC = 60;

/** Piezas cuyo `bg` no llega a `CONTRAST_LC` con ningun `fg`. Es deuda, no diseño. */
export const LC_EXCEPCIONES = ['L', 'Y'] as const;
