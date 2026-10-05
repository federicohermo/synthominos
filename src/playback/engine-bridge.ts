import type { Sequence as SchedulerSequence } from './scheduler.ts';
import type { Sequence } from '../circuit/sequence.ts';

/**
 * The two pure functions of the bridge to the engine: to project the sequence, and to
 * toggle the transport and ask it what happened.
 *
 * It is the only module that knows the two `Sequence` types: that of the circuit, with
 * cells, and that of the engine, which speaks MIDI. `route-source.ts` steps across the
 * same border for the playhead.
 *
 * No React and no import of the engine: so its test runs in the `node` project, like
 * those of the other pure modules of the UI. The wiring to React and to
 * `playback/engine.ts` belongs to `use-engine.ts`, which makes no decision.
 *
 * The two `Sequence` names collide, so one travels with an alias, and the alias is on
 * the side of the engine. Measured in this folder: `route-source.ts` already imports
 * that of the circuit and nobody imports that of the engine, 1 against 0. Also,
 * `SequenceDelMotor` names the destination and not the origin.
 */

/**
 * The bridge to the engine, seen from the side of the UI: the shape that `setSequence`
 * expects and the ROLE that the transport has for the pure function that toggles it.
 *
 * The two names are those of the role and not of the API of `playback/engine.ts`, on
 * purpose: `MotorDeTransporte` does not say `startClock`/`stopClock`/`clockRunning`
 * because the type describes what the pure function NEEDS (to start, to stop, and to
 * ask what really happened), not what the engine exports. The test shows the
 * difference: a fake engine is one line, because the type has three functions and no
 * dependency. With the names of the engine API, the signature of the pure function
 * would be tied to the singleton of the `AudioContext` for no reason.
 *
 * The mapping to the three real functions is in one place, `playback/use-engine.ts`,
 * the only module that imports the **transport API** of the engine.
 * `playhead-loop.ts`, `spectrum-loop.ts` and `route-source.ts` import
 * `playback/engine.ts` too, but the three ask for reads and none starts, stops or
 * schedules anything.
 */

/** The `Sequence` that the engine expects: that of the circuit LESS `pieceId` and `cell`. */
export type SequenceDelMotor = SchedulerSequence;

/**
 * The transport, as three functions with no state of their own.
 *
 * `corriendo` is not redundant with what was asked: `arrancar` is a silent no-op when
 * the engine has no `AudioContext`, and `.agents/rules/audio.md` makes every caller
 * check it. So the role carries the query inside and does not leave it outside as a
 * courtesy.
 */
export interface MotorDeTransporte {
  arrancar: () => void;
  frenar: () => void;
  corriendo: () => boolean;
}

/**
 * The `Sequence` of the circuit, as the engine expects it.
 *
 * This is a PROJECTION, not a translation. `offset`, `notes` and the MIDI `note` of the
 * crossing travel as they are. What is dropped is `pieceId`, because the engine has
 * nobody to give it back to, and `cell` in the clicks: the engine speaks MIDI and does
 * not know `Cell`. The `note` does cross, because it is a MIDI number and the engine
 * speaks MIDI: the circuit can enter an occupied cell and that crossing sounds its
 * pitch, so a count of the clicks is not enough. The conversion to Hz belongs to the
 * engine (`collectHits` does it, as with `steps.notes`): a translation here would be
 * just what this function does not do.
 *
 * Written once: the reconciliation effect and the unmount effect of `use-engine.ts`
 * both call it. With one pure function, "do not diverge" is not a promise: the other
 * way is impossible to write.
 */
export function proyectarAlMotor(s: Sequence): SequenceDelMotor {
  return {
    steps: s.steps.map(({ offset, notes }) => ({ offset, notes })),
    // The ternary and not `({ offset, note })`: with the short form the click comes out
    // with the key `note` PRESENT and `undefined`, and the absence of the field is just
    // what says "empty cell" (see the docblock of `Click`). Nobody would notice today,
    // because `collectHits` compares `=== undefined`, but it is the third state that
    // the type exists to exclude.
    clicks: s.clicks.map((c) => c.note === undefined ? { offset: c.offset } : { offset: c.offset, note: c.note }),
    length: s.length,
  };
}

/**
 * Toggles the transport and returns whether it runs: what the ENGINE says, not what
 * was asked.
 *
 * The `return motor.corriendo()` and not `return !playing` is the whole function: the
 * engine knows if it started, because `arrancar` is a silent no-op when the
 * `AudioContext` does not exist. Without this check the play button would offer pause
 * with the clock stopped. It is the soft failure that `.agents/rules/audio.md` makes
 * every caller check.
 *
 * The engine comes as a PARAMETER and not as an import, the opposite of
 * `route-source.ts`, which imports `engine.ts` and whose test mocks it. The two ways
 * work. This one is chosen because the value to test is the DISCREPANCY between what
 * was asked and what happened, and with a fake engine that discrepancy is one line
 * (`corriendo: () => false`) and not a mock to build. It also keeps this file from
 * importing the singleton of the `AudioContext` to read a boolean, the same reason
 * that the docblock of `route-source.test.ts` gives.
 */
export function alternarTransporte(playing: boolean, motor: MotorDeTransporte): boolean {
  if (playing) motor.frenar(); else motor.arrancar();
  return motor.corriendo();
}
