import type { PieceKey } from '../pieces/pieces.types.ts';

/** Las 12 clases de altura, en orden. El indice ES la clase de altura. */
export const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;

export const PENT_MAJOR: number[] = [0,2,4,7,9];
export const PENT_MINOR: number[] = [0,3,5,7,10];
export const PENT_BLUES5: number[] = [0,3,5,6,7];

/**
 * Los dos regimenes de rotacion: QUE cambia la rotacion.
 *
 * - `escala` — el de siempre: elige entre las cuatro formulas de arriba, o sea que
 *   rotar cambia QUE NOTAS suena la pieza y no toca el orden.
 * - `orden` — la pentatonica mayor SIEMPRE, corrida `rot` posiciones: rotar cambia
 *   POR DONDE ARRANCA el arpegio y no toca el material.
 *
 * Existen los dos a la vez porque la pregunta —cual de las dos reglas vuelve al
 * instrumento mas expresivo— no se contesta en el papel: el spec construye la
 * comparacion para poder decidirla escuchando, y sacar el que pierda es borrar una
 * rama de `notesForRotation`.
 *
 * La formula fija de `orden` es la pentatonica mayor y no otra, y eso es lo que hace
 * la comparacion AUDITABLE (D2): es la formula de la rotacion 0 en `escala`, asi que
 * a 0° los dos regimenes suenan identicos y divergen a medida que se rota. Con
 * cualquier otra formula fija los dos sistemas no se tocarian en ningun punto y
 * comparar seria comparar dos instrumentos distintos.
 *
 * Const-object y no `enum`: `erasableSyntaxOnly` los rechaza, y es la misma opcion que
 * permite que node cargue `src/<capability>/domain/` sin compilar —de lo que viven el MCP server y
 * las mediciones del research—. El union type derivado vive en `types/music.types.ts`.
 */
export const REGIMEN = { escala: 'escala', orden: 'orden' } as const;

/**
 * El regimen con el que abre la app (AC11): `escala`, o sea que sin tocar nada el
 * instrumento suena como sonaba.
 *
 * Es el default del ESTADO de `App.tsx` y nunca un default de parametro: las funciones
 * del dominio piden el regimen sin valor por omision a proposito, para que un llamador
 * que se lo olvide falle en el typecheck en vez de recibir el regimen viejo en silencio
 * —son 36 de las 48 combinaciones las que difieren—. Mismo criterio que `dur` y `rel`
 * en `scheduleVoice`.
 */
export const DEFAULT_REGIMEN = REGIMEN.escala;

/**
 * Notas que dispara una pieza: las cuatro formulas son pentatonicas.
 *
 * Coincide con `CELLS_PER_PIECE` y **tiene que coincidir**, no es una coincidencia: son 5
 * notas porque la escala es pentatonica y 5 celdas porque la pieza es un pentomino, y
 * `degreeByCellIndex` empareja las dos listas para que cada celda tenga su nota.
 *
 * Una formula de 4 notas dejaria una celda sin nota —`ascendente[4]` seria
 * `undefined`, y `midiName` de eso no explota: devuelve `undefinedNaN` y lo
 * pinta en la celda— y una de 6 dejaria una nota que ninguna celda dispara.
 *
 * Lo verifica `checkNotes()` de `invariants.ts`, que es donde tiene que estar:
 * escrito solo aca es una afirmacion, no una red.
 */
export const NOTES_PER_PIECE = 5;

/**
 * Pieza → clase de altura de su tonica (F→C, I→C#, … Z→B).
 *
 * Tipado `Record<PieceKey, number>` y no `as const`: agregar una pieza sin darle
 * tonica pasa a ser error de compilacion.
 *
 * Cuidado con la colision de nombres: la PIEZA `F` suena con tonica C; la nota F
 * le corresponde a la pieza `T`.
 */
export const BASE_MAP: Record<PieceKey, number> = {
  F:0, I:1, L:2, N:3, P:4, T:5, U:6, V:7, W:8, X:9, Y:10, Z:11,
};

/** Octava en la que se construye el arpegio de una pieza. */
export const DEFAULT_OCTAVE = 4;

/**
 * Tolerancia de las dos comparaciones de `degreeByCellIndex`.
 *
 * Son estas dos: "esta celda cae sobre el centroide" —una distancia contra el
 * epsilon— y "estas dos celdas tienen el mismo angulo" —el tamano de la cubeta
 * a la que se redondea el angulo antes de ordenar—.
 *
 * Va contra un epsilon y no contra `0` porque el centroide es un promedio de
 * quintos: `2/5 + 2/5 + 1/5` no siempre da exactamente `1`, y una celda que
 * geometricamente ESTA en el centro puede quedar a 1e-16 de el.
 *
 * Lo usa tambien `transform.test.ts` para afirmar cuales celdas caen sobre el
 * centroide: es la misma pregunta, asi que es el mismo numero y no una copia.
 */
export const DEGREE_EPSILON = 1e-9;
