/**
 * Las 12 piezas del juego, por su letra.
 *
 * Declarado explicito y no derivado de `keyof typeof BASE_MAP`: asi el tipo de las
 * piezas sale de la geometria y no de la tabla musical, y agregar una pieza sin
 * darle tonica pasa a ser error de compilacion.
 *
 * La letra describe la FORMA, no el sonido: la pieza `F` suena con tonica C.
 */
export type PieceKey = 'F' | 'I' | 'L' | 'N' | 'P' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
