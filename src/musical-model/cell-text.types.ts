/**
 * Lo que una celda MUESTRA: su nota y su paso.
 *
 * Cruza el limite entre `cell-text.ts`, que lo deriva, y `Board.tsx`, que lo pinta — por
 * eso vive aca y no adentro del modulo, igual que `Marca` para la cabeza lectora.
 */
export interface CellText {
  /**
   * El PASO: en que lugar del orden de reproduccion suena la celda (`0..4`). Es el
   * `#N` de la esquina, y la reflexion lo mueve.
   */
  step: number;
  /**
   * El nombre de la nota que suena en la celda (`"C4"`, `"D#5"`, …). Sale del GRADO
   * contra el arpegio ascendente, y la reflexion NO lo mueve.
   */
  note: string;
}
