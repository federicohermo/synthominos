import type { Cell } from './transform.types.ts';
import type { PieceKey } from './pieces.types.ts';

/**
 * Las cuatro rotaciones que recorre `checkNotes` y `checkArrayOrder`.
 *
 * Se escriben y no se derivan de un `ROTATION_COUNT`: no hay tal constante en el repo, y
 * el numero 4 no es un parametro sino la aritmetica del cuarto de vuelta —`rotate90`
 * aplicada cuatro veces es la identidad—. Lo que si es un parametro son los REGIMENES, y
 * por eso esos salen de `Object.values(REGIMEN)` en el modulo: agregar un tercero tiene
 * que meterlo solo en el invariante, y agregar una quinta rotacion no existe.
 *
 * Los indices, y no los grados: es lo que reciben `rotateN` y `notesForRotation`.
 */
export const ROTATIONS = [0, 1, 2, 3];

/**
 * Los 12 pentominos por su letra, escritos DESDE LA DEFINICION ESTANDAR y no derivados
 * de `SHAPES`.
 *
 * Que sea una referencia EXTERNA es la unica razon por la que sirve: `checkLetters` la
 * compara contra `SHAPES`, y una tabla derivada de `SHAPES` se verificaria contra si
 * misma. Es la diferencia entre atrapar el bug de la `Z` —que era la `N` reflejada y
 * vivio desde el primer commit— y no verlo, que es lo que les paso a los cinco chequeos
 * anteriores a `checkDistinct`.
 *
 * Salen del nomenclador de Golomb/Conway, el que nombra cada pentomino por la letra a la
 * que se parece. Se copian **dibujadas** para que auditarlas no exija correr nada: cada
 * celda es `[x, y]` con `y` creciendo hacia ABAJO, o sea leyendo el dibujo de arriba
 * hacia abajo.
 *
 * ```text
 *   F      I      L      N      P      T      U      V      W      X      Y      Z
 *  .FF     I      L.     .N     PP    TTT    U.U    V..    W..    .X.    .Y     ZZ.
 *  FF.     I      L.     .N     PP    .T.    UUU    V..    WW.    XXX    YY     .Z.
 *  .F.     I      L.     NN     P.    .T.           VVV    .WW    .X.    .Y     .ZZ
 *          I      LL     N.                                              .Y
 *          I
 * ```
 *
 * La QUIRALIDAD no hace falta fijarla, y por eso no se documenta cual de los dos
 * enantiomeros es cada uno: la comparacion es por clave canonica, que colapsa las 8
 * orientaciones, asi que la `L` y la `J` —o la `N` y la `S`, o la `F` y su espejo—
 * tienen la misma clave. Es lo correcto y no una concesion: la app genera en vivo las
 * otras 7 orientaciones de cada pieza, asi que `SHAPES` guarda un representante y no una
 * forma privilegiada.
 */
export const PENTOMINOS_CANONICOS: Record<PieceKey, Cell[]> = {
  F: [[1,0],[2,0],[0,1],[1,1],[1,2]],
  I: [[0,0],[0,1],[0,2],[0,3],[0,4]],
  L: [[0,0],[0,1],[0,2],[0,3],[1,3]],
  N: [[1,0],[1,1],[0,2],[1,2],[0,3]],
  P: [[0,0],[1,0],[0,1],[1,1],[0,2]],
  T: [[0,0],[1,0],[2,0],[1,1],[1,2]],
  U: [[0,0],[2,0],[0,1],[1,1],[2,1]],
  V: [[0,0],[0,1],[0,2],[1,2],[2,2]],
  W: [[0,0],[0,1],[1,1],[1,2],[2,2]],
  X: [[1,0],[0,1],[1,1],[2,1],[1,2]],
  Y: [[1,0],[0,1],[1,1],[1,2],[1,3]],
  Z: [[0,0],[1,0],[1,1],[1,2],[2,2]],
};
