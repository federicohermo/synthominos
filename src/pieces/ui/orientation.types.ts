import type { ROTACION } from './orientation.constants.ts';
import type { PieceKey } from '../domain/pieces.types.ts';

/**
 * Los cuatro cuartos de vuelta, como union y no como `number`.
 *
 * Const-object + union derivado, que es la forma que este repo usa para todo conjunto
 * cerrado: **nunca un `enum`**, que el `erasableSyntaxOnly` del tsconfig rechaza —y que es
 * la misma opción que permite que node cargue `src/<capability>/domain/` sin compilar—.
 *
 * ## Qué cierra y qué no
 *
 * Queda abierta la deuda de «la rotación sin acotar»: un `number` que se compara contra
 * `0|1|2|3` en siete lugares. Este tipo **no la cierra, la achica**, y la diferencia
 * importa para el que la lea después.
 *
 * Lo que queda abierto es el tramo de `domain/`: `rotateN`, `arpeggioFor` y
 * `PlacedPiece.rotation` siguen tomando `number`, y ése es el que cruza el borde de
 * paquete hacia `mcp-server/` —que importa 31 símbolos del dominio—, así que acotarlo es
 * un refactor con su propio spec.
 *
 * Lo que sí cierra es la **vía**: la rotación entra al modelo desde `Orientacion`, así que
 * con la fuente acotada `domain/` no puede recibir un valor fuera de `0..3` por acá. El
 * escenario concreto está medido: con un índice de más, `base[j + rot]` daba
 * `undefined`, `midiName` no explotaba y la celda del tablero pintaba `undefinedNaN`.
 */
export type Rotacion = (typeof ROTACION)[keyof typeof ROTACION];

/** Cómo está puesta una pieza: cuánto girada y si está espejada. */
export interface Orientacion {
  rotation: Rotacion;
  mirror: boolean;
}

/**
 * La orientación de cada una de las doce piezas.
 *
 * ## Por qué NO vive en un archivo de tipos de `domain/`
 *
 * Porque no es del modelo: es **estado del shell**, y el modelo ya tiene su propia
 * representación de lo mismo. Una pieza colocada guarda su rotación y su reflexión en
 * `PlacedPiece`, que es donde tienen que estar —lo que se colocó no cambia porque después
 * gires la pieza que tenés en la mano—. Esta memoria es de la pieza **por colocar**, o sea
 * una preferencia de quien toca y no un hecho del tablero.
 *
 * Que los dos tipos lleven los mismos dos campos es real y está anotado en
 * unificarlos es un refactor de `domain/` que cruza el borde de paquete
 * con beneficio cero de comportamiento.
 */
export type MemoriaDeOrientacion = Record<PieceKey, Orientacion>;
