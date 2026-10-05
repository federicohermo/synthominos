/**
 * The arithmetic of the playhead: the interval of the cycle where it is.
 *
 * It lives apart from `engine.ts` for the same reason that `spectrum-bars.ts` lives
 * apart from the AnalyserNode: to read the clock needs the singleton of the
 * AudioContext, which a node test does not have. So the only thing that can be
 * asserted, the count, is separated from the node that cannot run. Here the input is
 * four numbers and the output is deterministic.
 *
 * A pure module: no Web Audio, no DOM, no React.
 */

/**
 * The WHOLE index of the interval where the playhead is, inside `[0, cycleIntervals)`.
 *
 * Whole and not a float: the playhead jumps from cell to cell because the circuit is
 * quantized to the grid of intervals, and the sound too. An interpolation would draw a
 * position that the model does not have.
 *
 * `now` must ALREADY be compensated for the output latency: what is scheduled at
 * `ctx.currentTime` is heard later, and that subtraction belongs to the caller because
 * it depends on the context, which this module cannot see, and not on the arithmetic.
 *
 * It returns `null` and never `NaN` in the three degraded cases that can be reached:
 *
 * - `cycleIntervals <= 0` is the empty board, and play reaches it. `x % 0` in JS is
 *   `NaN`, which downstream is drawn as a cell that does not exist and does not fail.
 * - `intervalSeconds <= 0` does not happen today, because it comes from
 *   `intervalDuration(bpm)`, but a division by it ends the same way.
 * - a non-finite argument poisons the whole count; it is cut before.
 *
 * `now < origin` is NOT a degraded case: the progression is defined for every `k`, so
 * the answer is the tail of the cycle. That is why the modulo is Euclidean: the `%` of
 * JS keeps the sign of the dividend and would return -1.
 *
 * That it is the CORRECT answer does not make it the USEFUL answer: `playheadOffset()`
 * cuts before it gets here when `now < origin`. In that window, the 50 ms of
 * `CLOCK_START_DELAY` or the up to 82 ms between a swap and the boundary, the sounding
 * sequence has not started to sound, and the tail of the new cycle is a cell that
 * nobody hears. The detail is in the docblock of `playheadOffset`; here the function
 * stays total, which is what makes it assertable.
 */
export function offsetAt(
  now: number,
  origin: number,
  intervalSeconds: number,
  cycleIntervals: number,
): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(origin)) return null;
  if (!Number.isFinite(intervalSeconds) || !Number.isFinite(cycleIntervals)) return null;
  if (intervalSeconds <= 0) return null;

  // The cycle is truncated to a whole number before it is used as the modulus:
  // `Sequence.length` already comes in whole intervals, but a fraction would return an
  // offset outside the grid of cells, and the playhead would be between two.
  const ciclo = Math.floor(cycleIntervals);
  if (ciclo <= 0) return null;

  const transcurridos = Math.floor((now - origin) / intervalSeconds);
  return ((transcurridos % ciclo) + ciclo) % ciclo;
}
