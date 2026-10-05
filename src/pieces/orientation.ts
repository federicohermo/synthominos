import { SHAPES } from './pieces.ts';
import type { PieceKey } from './pieces.ts';

/**
 * The four quarter turns, as a union and not as `number`.
 *
 * A const object and a derived union: the form this repo uses for every closed set.
 * **Never an `enum`**: `erasableSyntaxOnly` in the tsconfig rejects it, and that same
 * option lets node load `src/` with no build.
 *
 * ## What it closes and what it does not
 *
 * The debt of the unbounded rotation stays open: a `number` that is compared with
 * `0|1|2|3` in seven places. This type **does not close it. It makes it smaller**, and
 * the difference matters to the next reader.
 *
 * The open part is the domain: `rotateN`, `arpeggioFor` and `PlacedPiece.rotation` take a
 * `number`. That `number` crosses the package edge to `mcp-server/`, which imports 31
 * symbols of the domain, so to bound it is a refactor of its own.
 *
 * The closed part is the **way in**: the rotation enters the model from `Orientacion`.
 * With the source bounded, the domain cannot get a value outside `0..3` from here. The
 * concrete case is measured: with one index too many, `base[j + rot]` gave `undefined`,
 * `midiName` did not throw, and the cell of the board showed `undefinedNaN`.
 */
export type Rotacion = (typeof ROTACION)[keyof typeof ROTACION];

/** The orientation of a piece: its rotation, and whether it is reflected. */
export interface Orientacion {
  rotation: Rotacion;
  mirror: boolean;
}

/**
 * The remembered orientation of each of the twelve pieces.
 *
 * ## Why it is NOT in `transform.ts`
 *
 * It is not part of the model. It is **state of the shell**, and the model has its own
 * representation of the same thing. A placed piece keeps its rotation and its reflection
 * in `PlacedPiece`, where they must be: a placed piece does not change when the piece in
 * hand turns. This memory is of the piece **to be placed**: a preference of the player
 * and not a fact of the board.
 *
 * The two types carry the same two fields. To unify them is a refactor of the domain
 * that crosses the package edge, with zero benefit in behavior.
 */
export type MemoriaDeOrientacion = Record<PieceKey, Orientacion>;

/**
 * The four quarter turns. The union `Rotacion` is derived from here.
 *
 * A const object and not an `enum`: `erasableSyntaxOnly` in the tsconfig rejects an enum.
 * The exact precedents are `ACCION` in `input.ts` and `MARCA` in `route-source.ts`.
 *
 * The keys name the angle. The values are the indices that `rotateN` counts, in the order
 * that `rotateN` sets: one quarter turn counterclockwise on screen for each unit.
 */
export const ROTACION = { cero: 0, noventa: 1, ciento_ochenta: 2, doscientos_setenta: 3 } as const;

/**
 * The initial orientation of a piece: rotation 0°, not reflected.
 *
 * It has two uses and one definition: the twelve pieces open with it, and the `0°` button
 * returns a piece to it. Written twice, it would be a pair of values that must agree,
 * with nothing to keep them equal.
 */
export const ORIENTACION_INICIAL: Orientacion = { rotation: ROTACION.cero, mirror: false };

/**
 * The twelve slots, each at the initial orientation.
 *
 * **It is derived from `SHAPES` and not written by hand with the twelve letters.** That
 * is the difference between a table and a copy. A piece added to the model gets its slot
 * with no action from a person. More important: a piece in `SHAPES` and not here would
 * leave an `undefined` that the type promises does not exist. The two other cases of this
 * pattern in the repo are the `.map` of the twelve buttons of `OrientationPanel.tsx` and
 * `PIECES` in `pieces/invariants.ts`.
 *
 * The narrowing is the one the repo uses, `Object.keys(SHAPES) as PieceKey[]`, and not a
 * new one. The standard lib types `Object.keys` as `string[]` because an object of
 * TypeScript can have more keys than its type declares, which cannot occur with an
 * `as const` object.
 *
 * It is a value and not a function that makes it, although `App.tsx` uses it as the
 * initial state of a `useState` and that looks like aliasing. The three writers of the
 * memory build a **new** `Record` with a functional setter, because `.agents/rules/ui.md`
 * forbids the mutation of what React already holds. With that rule, the shared reference
 * cannot get dirty.
 */
export const ORIENTACIONES_INICIALES: MemoriaDeOrientacion = Object.fromEntries(
  (Object.keys(SHAPES) as PieceKey[]).map(p => [p, ORIENTACION_INICIAL]),
) as MemoriaDeOrientacion;
