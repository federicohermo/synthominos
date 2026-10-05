import { SHAPES } from './pieces.ts';
import type { PieceKey } from './pieces.ts';

/**
 * Los cuatro cuartos de vuelta, como union y no como `number`.
 *
 * Const-object + union derivado, que es la forma que este repo usa para todo conjunto
 * cerrado: **nunca un `enum`**, que el `erasableSyntaxOnly` del tsconfig rechaza —y que es
 * la misma opción que permite que node cargue `src/` sin compilar—.
 *
 * ## Qué cierra y qué no
 *
 * Queda abierta la deuda de «la rotación sin acotar»: un `number` que se compara contra
 * `0|1|2|3` en siete lugares. Este tipo **no la cierra, la achica**, y la diferencia
 * importa para el que la lea después.
 *
 * Lo que queda abierto es el tramo del dominio: `rotateN`, `arpeggioFor` y
 * `PlacedPiece.rotation` siguen tomando `number`, y ése es el que cruza el borde de
 * paquete hacia `mcp-server/` —que importa 31 símbolos del dominio—, así que acotarlo es
 * un refactor con su propio spec.
 *
 * Lo que sí cierra es la **vía**: la rotación entra al modelo desde `Orientacion`, así que
 * con la fuente acotada el dominio no puede recibir un valor fuera de `0..3` por acá. El
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
 * ## Por qué NO vive en el modulo de `transform.ts`
 *
 * Porque no es del modelo: es **estado del shell**, y el modelo ya tiene su propia
 * representación de lo mismo. Una pieza colocada guarda su rotación y su reflexión en
 * `PlacedPiece`, que es donde tienen que estar —lo que se colocó no cambia porque después
 * gires la pieza que tenés en la mano—. Esta memoria es de la pieza **por colocar**, o sea
 * una preferencia de quien toca y no un hecho del tablero.
 *
 * Que los dos tipos lleven los mismos dos campos es real y está anotado en
 * unificarlos es un refactor del dominio que cruza el borde de paquete
 * con beneficio cero de comportamiento.
 */
export type MemoriaDeOrientacion = Record<PieceKey, Orientacion>;

/**
 * Los cuatro cuartos de vuelta. El union `Rotacion` se deriva de acá.
 *
 * Const-object y no `enum`: el `erasableSyntaxOnly` del tsconfig los rechaza. El
 * precedente exacto es `ACCION` en `input.ts` y `MARCA` en `route-source.ts`.
 *
 * Las claves nombran el ángulo y los valores son los índices que `rotateN` cuenta, que es
 * el orden que fija `rotateN`: un cuarto de vuelta en sentido horario por unidad.
 */
export const ROTACION = { cero: 0, noventa: 1, ciento_ochenta: 2, doscientos_setenta: 3 } as const;

/**
 * Cómo arranca una pieza: sin girar y sin espejar.
 *
 * Vale dos veces y por eso está una sola: es el valor con el que nacen las doce (AC6) y es
 * al que vuelve el botón `0°` (AC7). Escribirlo dos veces sería el par de valores que
 * tienen que coincidir y nada sincroniza.
 */
export const ORIENTACION_INICIAL: Orientacion = { rotation: ROTACION.cero, mirror: false };

/**
 * Las doce ranuras, todas en cero.
 *
 * **Derivada de `SHAPES` y no escrita a mano con las doce letras**, que es la diferencia
 * entre una tabla y una copia: agregar una pieza al modelo le da su ranura sin que nadie se
 * acuerde, y —más importante— una pieza que existiera en `SHAPES` y no acá dejaría un
 * `undefined` que el tipo promete que no existe. Los dos testigos del mismo patrón en el
 * repo son el `.map` de los doce botones de `OrientationPanel.tsx` y `PIECES` en
 * `pieces/invariants.ts`.
 *
 * El estrechado es el que el repo ya usa —`Object.keys(SHAPES) as PieceKey[]`— y no uno
 * nuevo: `Object.keys` está tipado como `string[]` en el lib estándar porque un objeto de
 * TypeScript puede tener más claves que las que su tipo declara, cosa que un `as const` no
 * puede pasar.
 *
 * Es un valor y no una función que lo fabrique, aunque `App.tsx` lo use como estado
 * inicial de un `useState` y eso suene a aliasing: los tres escritores de la memoria
 * arman un `Record` **nuevo** con setter funcional, porque `.claude/rules/ui.md` prohíbe
 * mutar lo que ya se entregó a React. Con esa regla puesta, la referencia compartida no
 * puede ensuciarse.
 */
export const ORIENTACIONES_INICIALES: MemoriaDeOrientacion = Object.fromEntries(
  (Object.keys(SHAPES) as PieceKey[]).map(p => [p, ORIENTACION_INICIAL]),
) as MemoriaDeOrientacion;
