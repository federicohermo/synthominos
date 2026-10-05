import type { Sequence as SchedulerSequence } from './scheduler.ts';
import type { Sequence } from '../circuit/sequence.ts';

export type SequenceDelMotor = SchedulerSequence;

/** `arrancar` does nothing when the engine has no `AudioContext`: ask `corriendo` after it. */
export interface MotorDeTransporte {
  arrancar: () => void;
  frenar: () => void;
  corriendo: () => boolean;
}

export function proyectarAlMotor(s: Sequence): SequenceDelMotor {
  return {
    steps: s.steps.map(({ offset, notes }) => ({ offset, notes })),
    // Not `({ offset, note })`: an absent `note` means an empty cell, and a key that is
    // present and `undefined` is a third state.
    clicks: s.clicks.map((c) => c.note === undefined ? { offset: c.offset } : { offset: c.offset, note: c.note }),
    length: s.length,
  };
}

export function alternarTransporte(playing: boolean, motor: MotorDeTransporte): boolean {
  if (playing) motor.frenar(); else motor.arrancar();
  return motor.corriendo();
}
