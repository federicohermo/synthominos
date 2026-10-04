import type { PieceKey } from '../../pieces/domain/pieces.types.ts';
import type { RegimenDeRotacion } from '../../musical-model/domain/music.types.ts';
import type { MemoriaDeOrientacion } from '../../pieces/ui/orientation.types.ts';

/**
 * Los dos objetos de props de la tarjeta de piezas, que llegaron a ser
 * dieciséis props planas sobre `PiecePalette`.
 *
 * Adentro hay dos paneles distintos —la orientación de la pieza en la mano y el
 * transporte del instrumento— y con las props sueltas la firma no decía qué agrupaba con
 * qué: enumeraba en vez de documentar.
 *
 * Los tres criterios de reparto, que no son obvios y por eso van escritos:
 *
 * - `regimen` va con la ORIENTACIÓN aunque sea global como el tempo, porque gobierna QUÉ
 *   HACE la rotación: con `escala` cambia la fórmula de escala y con `orden`
 *   cambia por dónde arranca el arpegio, así que sin él la orientación no dice qué suena.
 * - `noteSet` va del mismo lado por lo mismo: es el arpegio de la pieza en la mano EN ESA
 *   orientación, y su `useMemo` en el shell ya depende de los cuatro campos de acá.
 * - `onReset` va con el TRANSPORTE y no con la orientación porque `resetBoard` frena el
 *   reloj además de vaciar el tablero, que es la mitad que su propio comentario declara
 *   «no cosmética».
 */

/** La pieza en la mano: cuál es, cómo está puesta, y qué hace girarla. */
export interface PropsDeOrientacion {
  selected: PieceKey;
  /**
   * Las DOCE orientaciones y no la de la seleccionada.
   *
   * Baja entera porque la grilla de miniaturas necesita las doce: cada botón se dibuja en
   * **su** orientación recordada, que es de lo que trata ese spec. Y los lectores que sólo
   * quieren la de la pieza en la mano —la línea de texto del 019, el arpegio— la derivan
   * con `orientaciones[selected]` en vez de recibirla como un par de props sueltas: dos
   * props para la misma verdad son dos formas de que discrepen.
   *
   * `Board` es la excepción y sigue recibiendo el par suelto por su prop propia: es el
   * único consumidor que no necesita las doce.
   */
  orientaciones: MemoriaDeOrientacion;
  /**
   * Que hace la rotacion.
   *
   * Hasta el 019 completaba la frase de su propia fila —«Rotacion … cambia escala /
   * orden»—; al borrarse los cuatro botones de grados la frase se quedo sin sujeto y el
   * regimen paso a ser la fila.
   */
  regimen: RegimenDeRotacion;
  noteSet: readonly number[];
  onSelect: (piece: PieceKey) => void;
  onRegimen: (regimen: RegimenDeRotacion) => void;
  /**
   * El botón `0°`: devuelve la pieza en la mano —y sólo esa— a 0° sin reflejar.
   *
   * No lleva la pieza como argumento: el shell ya sabe cuál está en la mano, y pasársela
   * desde el panel sería que el componente decida sobre qué escribe. `PiecePalette` es
   * presentacional (`.claude/rules/ui.md`): recibe callbacks y no toca estado.
   */
  onResetOrientacion: () => void;
}

/** El transporte del instrumento: tempo, play/pausa, los clicks del recorrido y el reset. */
export interface PropsDeTransporte {
  tempo: number;
  playing: boolean;
  clicks: boolean;
  onTempo: (bpm: number) => void;
  onTogglePlay: () => void;
  onToggleClicks: () => void;
  onReset: () => void;
}
