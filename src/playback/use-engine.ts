import { useEffect } from 'react';
import {
  setSequence,
  setBpm,
  setClicksAudible,
  startClock,
  stopClock,
  clockRunning,
} from './engine.ts';
import { buildSequence } from '../circuit/sequence.ts';
import { DEFAULT_REGIMEN } from '../musical-model/music.ts';
import { GRID_DEFAULT } from '../board-editing/placement.ts';
import type { Sequence } from '../circuit/sequence.ts';
import type { PlacedPiece } from '../board-editing/placement.ts';
import type { MotorDeTransporte } from './engine-bridge.ts';
import { proyectarAlMotor } from './engine-bridge.ts';
import { encolar, reiniciar } from './route-source.ts';

/**
 * The four reconciliation effects that keep the engine on the same board as the
 * screen: tempo, clicks, the sequence against the board, and the cleanup on unmount.
 *
 * Each one carries an argument that is already measured: the swap at the cycle
 * boundary, the synchronous cleanup under StrictMode, why the unmount uses
 * `DEFAULT_REGIMEN`. To derive them again is the easiest way to lose them.
 *
 * `secuencia` comes as a PARAMETER and this hook does not derive it again. That
 * guarantees that `encolar` and `setSequence` see the SAME instance: if the hook called
 * `buildSequence` by itself, the drawing and the sound could look at different circuits
 * and nothing would fail. The shell derives the rule; the hook gets the result.
 *
 * It is a `.ts` and not a `.tsx`, so `react-refresh/only-export-components` does not
 * look at it: the same reason that lets `input.ts` and `route-source.ts` export what
 * they want.
 */

/**
 * The real transport, wired to the role that `alternarTransporte` expects.
 *
 * It is not a fixed value: it is the wiring of three functions imported from
 * `playback/engine.ts`.
 *
 * It lives here and not in `engine-bridge.ts` because this is the only module that
 * imports the transport API of the real engine: the pure function gets it as a
 * parameter just so that it does not have to.
 */
export const MOTOR: MotorDeTransporte = {
  arrancar: startClock,
  frenar: stopClock,
  corriendo: clockRunning,
};

/**
 * Stops the transport and does not toggle it, for the Reset of the shell.
 *
 * It is the only call to the engine that is neither reconciliation nor transport: the
 * explicit order to return to zero. It is exported from here so that the shell reaches
 * the transport of the engine through one module.
 */
export function frenarTransporte(): void { stopClock(); }

/**
 * The other half of Reset: to return the DRAW queue to zero.
 *
 * It is here next to `frenarTransporte()` for the same reason: Reset must speak to the
 * two queues, and this is the only module through which the shell speaks to the two. If
 * `App.tsx` imported `route-source.ts` for this line, the second queue would reset by a
 * path different from that of the first. That asymmetry leaves the veil drawn over an
 * empty board.
 *
 * Why the reset exists, and why `encolar` does not do it alone when it sees an empty
 * sequence, is in the docblock of `reiniciar()` in `route-source.ts`.
 */
export function reiniciarRecorrido(): void { reiniciar(); }

interface Reconciliacion {
  /**
   * The sequence that the shell already derived. It is not derived again here: see the
   * docblock of the module.
   */
  secuencia: Sequence;
  placed: readonly PlacedPiece[];
  tempo: number;
  clicks: boolean;
}

export function useMotorSincronizado({ secuencia, placed, tempo, clicks }: Reconciliacion): void {
  useEffect(()=>{ setBpm(tempo); }, [tempo]);
  useEffect(()=>{ setClicksAudible(clicks); }, [clicks]);

  // Reconciles the sequence of the engine against the board. `playing` is not a
  // dependency, on purpose: the sequence is a function of the board, not of the
  // transport, and `togglePlay` of the shell stops or starts the sound, through
  // `stopClock`/`startClock`. One call to `setSequence` is enough: a placement or a
  // removal with the transport stopped leaves the sequence ready for the start.
  //
  // `setSequence` does not interrupt the cycle in progress: the new sequence starts at
  // the cycle boundary, so a new order of the board can take up to a full cycle to be
  // heard, 7.5 s with 8 pieces at 110 bpm. It is the price of a circuit that can change
  // its whole order and not jump in the middle of a phrase.
  //
  // The `Sequence` of `buildSequence` is not the one the engine expects: the projection
  // lives in `engine-bridge.ts` and its docblock says what is dropped and why. Here it
  // is only called, so this effect and that of the unmount cannot diverge.
  //
  // The cells are not lost: they stay in the sequence of the circuit, and so this
  // effect feeds TWO queues with the same `secuencia`. To read them from `placed` is
  // not enough: `placed` is the CURRENT board, the QUEUED sequence, and the playhead
  // must draw the one that sounds. `playback/route-source.ts` keeps the pair, and makes
  // its swap when the engine reports its own.
  //
  // The two queues are fed from here and with the SAME instance on purpose: if each one
  // called its own `buildSequence`, the drawing and the sound could look at different
  // circuits and nothing would fail.
  useEffect(()=>{
    encolar(secuencia, placed);
    setSequence(proyectarAlMotor(secuencia));
    // `placed` is in the dependencies although `secuencia` already derives from it, and
    // it adds no run: the shell derives `secuencia` with a `useMemo` over these pieces,
    // the regime and the dimensions of the grid, so each time `placed` changes,
    // `secuencia` changes too. The implication goes ONE way only (`secuencia` can
    // change alone, if the regime or the grid changed) and that is enough, because the
    // thing to exclude is one run too many and not one too few.
    //
    // It also avoids a disable of the exhaustive-deps rule, which would hide the day
    // somebody decouples the two.
  }, [secuencia, placed]);

  // On unmount, stop the clock and empty the sequence of the engine. The cleanup is
  // synchronous: if it were asynchronous, in StrictMode it could run after the effect
  // above scheduled again, and it would overwrite the new sequence with an empty one.
  // `buildSequence([], …)` is projected, and the empty literal is not written by hand,
  // so that the shape of a value of the circuit does not enter the UI.
  //
  // `DEFAULT_REGIMEN` and `GRID_DEFAULT` and not what is in the state, and this is the
  // only call of the file where fixed values are correct: with the board empty
  // `buildSequence` returns at `n === 0` with the empty sequence and looks at neither
  // the regime nor the dimensions, so the two choices are inert. The value of the state
  // would enter the dependencies of an effect that exists ONLY for the unmount, and
  // then the cleanup would run on each regime change: it would stop the clock and empty
  // the sequence, and a regime change must not do that.
  useEffect(()=> ()=>{
    stopClock();
    setSequence(proyectarAlMotor(buildSequence([], DEFAULT_REGIMEN, GRID_DEFAULT)));
  }, []);
}
