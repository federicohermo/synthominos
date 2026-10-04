import type { Cell } from '../../pieces/domain/transform.types.ts';
import type { PieceKey } from '../../pieces/domain/pieces.types.ts';

/**
 * Una pieza ya colocada en el tablero, con sus celdas en coordenadas de tablero.
 *
 * NO lleva las notas. Las llevaba —`notes: number[]`, poblado al colocar— y era un dato
 * DERIVABLE guardado en el estado: `arpeggioFor(piece, rotation, mirror, regimen)` da exactamente
 * lo mismo, asi que el campo solo agregaba la posibilidad de que se contradijeran. Nada
 * impedia construir una pieza con `rotation: 1` y las notas de la rotacion 0, y ahi el
 * tablero —que ya derivaba, ver `Board.tsx`— y el motor —que leia el campo— decian cosas
 * distintas.
 *
 * `cells` en cambio NO es derivable de las demas: depende de donde se hizo click, que es
 * informacion que solo existe en el gesto.
 */
export interface PlacedPiece {
  id: string;
  piece: PieceKey;
  rotation: number;
  mirror: boolean;
  cells: Cell[];
  /**
   * La pieza ocupa su lugar y su tiempo en el circuito pero NO suena sus notas.
   *
   * Donde habria ido su arpegio van cinco clicks, uno por celda, en los mismos offsets.
   * El orden de visita, los offsets del resto y el largo del ciclo no cambian.
   *
   * Va acá por el mismo argumento que `cells` y no por el que retiró a `notes`: **no es
   * derivable**. No sale de la pieza, ni de la rotacion, ni de las celdas — sale de un
   * gesto, que es informacion que solo existe en el click.
   *
   * **Obligatorio y no `muted?: boolean`.** Opcional daria dos formas de decir "no
   * muteada" —`false` y ausente— y este repo ya pago ese error una vez: en `Click.note`
   * la AUSENCIA del campo significa algo distinto de un `undefined` explicito, y hay un
   * ternario puesto a proposito en `proyectarAlMotor` (`playback/ui/engine-bridge.ts`) para no
   * producir el tercer estado — y que tiene test. Acá no hay nada que la
   * ausencia pueda significar, asi que no se le da la
   * oportunidad.
   */
  muted: boolean;
}

/**
 * Cuánto mide el tablero, en celdas.
 *
 * **Es un parámetro y no una constante.** El tablero medía `GRID_W × GRID_H` = 10 × 6 y las
 * funciones del dominio lo leían de `constants/board.constants.ts`; hoy mide lo que entra
 * en la pantalla —26 × 15 en un escritorio de 1920 × 1080— y quien lo sabe es la capa que
 * ve el viewport, que es `ui/`. El dominio no puede leerlo de ningún lado: se lo
 * tienen que decir.
 *
 * Lo reciben las tres funciones que miran el tablero como un todo —`isValid`,
 * `routeBetween` y `buildSequence`— y de ahí baja solo. `music.ts`, `transform.ts` e
 * `invariants.ts` no lo necesitan: una pieza y su arpegio no dependen de dónde termina el
 * tablero.
 *
 * `readonly` en los dos campos por la regla de siempre: nunca mutar lo que ya se entregó a
 * React, y esto viaja como prop.
 */
export interface Dims {
  readonly w: number;
  readonly h: number;
}
