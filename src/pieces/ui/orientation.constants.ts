import { SHAPES } from '../domain/pieces.constants.ts';
import type { PieceKey } from '../domain/pieces.types.ts';
import type { Orientacion, MemoriaDeOrientacion } from './orientation.types.ts';

/**
 * Los cuatro cuartos de vuelta. El union `Rotacion` se deriva de acá.
 *
 * Const-object y no `enum`: el `erasableSyntaxOnly` del tsconfig los rechaza. El
 * precedente exacto es `ACCION` en `input.constants.ts` y `MARCA` en `route.constants.ts`.
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
 * tienen que coincidir y nada sincroniza, que es el motivo medido por el que este repo no
 * declara constantes adentro de los módulos.
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
 * `pieces/domain/invariants.ts`.
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
 * puede ensuciarse — y `constants/` es una carpeta que sólo tiene datos.
 */
export const ORIENTACIONES_INICIALES: MemoriaDeOrientacion = Object.fromEntries(
  (Object.keys(SHAPES) as PieceKey[]).map(p => [p, ORIENTACION_INICIAL]),
) as MemoriaDeOrientacion;
