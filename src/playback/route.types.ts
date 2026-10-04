import type { Cell } from '../pieces/transform.types.ts';
import type { MARCA } from './route.constants.ts';

/** Los tres sonidos que puede pisar la cabeza: ver `MARCA` en `route.constants.ts`. */
export type MarcaKind = (typeof MARCA)[keyof typeof MARCA];

/**
 * Que pisa la cabeza lectora en un intervalo del ciclo: una celda, y CUAL de los tres
 * sonidos posibles suena ahi.
 *
 * Es la traduccion de `Sequence` que el dibujo necesita y que el dominio no tiene por
 * que dar: `Step` lleva `pieceId`, `offset` y `notes` pero NO las celdas de sus cinco
 * notas, y `Click` lleva su celda pero por separado. Unir las dos cosas indexadas por
 * offset es trabajo de la UI, no del modelo.
 *
 * Esto llego a ser un booleano (`nota`): dos casos con marca, y el
 * tercero —"no hay nada en este intervalo"— se expresaba con la ausencia de la marca,
 * asi que un booleano alcanzaba. El cruce agrega un caso ADENTRO de lo que antes
 * era "hay marca y suena": `routeBetween` puede cruzar una celda OCUPADA sin que sea
 * el turno de esa pieza, y ese cruce suena una floritura (`Click.note`) que no es ni
 * la nota propia de una pieza ni el click mudo de siempre. Tres casos con marca mas la
 * ausencia, y un booleano no distingue los tres — de ahi el const-object.
 */
export interface Marca {
  cell: Cell;
  /** Nota de pieza, cruce con floritura o click mudo: los tres se ven distinto. */
  kind: MarcaKind;
}

/**
 * Una celda que todavia no se estreno: esta colocada pero no sono nunca dentro del
 * ciclo, asi que se dibuja atenuada hasta que la cabeza la toca por primera vez.
 *
 * `offset` es el intervalo en que se estrena, o `null` si la pieza ni siquiera entro al
 * ciclo que esta sonando —quedo encolada esperando el cierre—: ahi no hay instante que
 * esperar todavia, solo el swap.
 *
 * Lleva `id` de pieza y no solo la celda porque el estreno se recuerda: sin el, quitar
 * una pieza y colocar otra en la misma celda haria que la nueva naciera ya estrenada.
 * Los ids son monotonos (`String(++idRef.current)` en `App`), asi que nunca se reciclan.
 */
export interface CeldaPorEstrenar {
  id: string;
  cell: Cell;
  offset: number | null;
}
