/**
 * The mapping from the bins of the analysis to the geometry of the bars.
 *
 * It is apart from the AnalyserNode on purpose: the node CANNOT be tested with an
 * OfflineAudioContext. The offline render has no frames, and getByteFrequencyData returns
 * the state of the last processed block. So all the logic that a test can assert is here,
 * where the input is a Uint8Array made by hand and the output is deterministic. The node is
 * only a source of data, with no test of its own.
 *
 * A pure module: no Web Audio, no DOM, no React.
 */

/**
 * The settings of the AnalyserNode that `playback/engine.ts` creates for the spectrum.
 *
 * They live here and not in the engine because a node test reads them, and the node project
 * must not load `engine.ts`: see `docs/guides/conventions.md`.
 */
/** 128 bins (fftSize / 2). Enough to visualize, not enough to tune. */
export const FFT_SIZE = 256;

/** Time smoothing between readings: without it the animation shakes, with too much it lags. */
export const SMOOTHING = 0.8;

/**
 * Groups the bins into `barCount` bars with logarithmic band edges and returns heights
 * normalized from 0 to 1.
 *
 * Logarithmic and not linear because the bins are linear in frequency and perception is
 * not: with a linear split the first bars take all the useful musical information and the
 * rest of the canvas stays empty.
 *
 * The peak of the band and not the mean: the mean of a wide band flattens the transients,
 * which are exactly what must show in a percussive instrument. The peak keeps the attack.
 */
export function binsToBars(bins: Uint8Array, barCount: number): Float32Array {
  const n = Math.max(0, Math.floor(barCount));
  const out = new Float32Array(n);
  if (n === 0 || bins.length === 0) return out;

  for (let b = 0; b < n; b++) {
    const from = Math.min(bandEdge(bins.length, n, b), bins.length - 1);
    // The floor of `from + 1` guarantees that no band is empty when barCount is larger than
    // the number of bins. Without it, the edges of the low bands all fall on the same index
    // and those bars give 0 whatever the signal. The price is that two neighbouring bars
    // can share a bin. At that scale the split has lost its resolution in any case.
    const to = Math.max(from + 1, Math.min(bandEdge(bins.length, n, b + 1), bins.length));

    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, bins[i]);
    out[b] = peak / 255;
  }
  return out;
}

/**
 * The lower edge of band `b` as a bin index, with a logarithmic split.
 *
 * It raises `binCount + 1` and subtracts 1 so that the function is exact at the two ends:
 * b = 0 gives 0 and b = barCount gives binCount. With a bare `binCount ** (b/barCount)` the
 * last edge falls on binCount - 1 and the highest bin is never read.
 */
function bandEdge(binCount: number, barCount: number, b: number): number {
  return Math.floor((binCount + 1) ** (b / barCount)) - 1;
}
