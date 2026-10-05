/** 128 bins. The settings are here: a node test reads them and must not load `engine.ts`. */
export const FFT_SIZE = 256;

export const SMOOTHING = 0.8;

export function binsToBars(bins: Uint8Array, barCount: number): Float32Array {
  const n = Math.max(0, Math.floor(barCount));
  const out = new Float32Array(n);
  if (n === 0 || bins.length === 0) return out;

  for (let b = 0; b < n; b++) {
    const from = Math.min(bandEdge(bins.length, n, b), bins.length - 1);
    const to = Math.max(from + 1, Math.min(bandEdge(bins.length, n, b + 1), bins.length));

    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, bins[i]);
    out[b] = peak / 255;
  }
  return out;
}

/** `binCount + 1` and `- 1`: a bare `binCount ** (b / barCount)` never reads the highest bin. */
function bandEdge(binCount: number, barCount: number, b: number): number {
  return Math.floor((binCount + 1) ** (b / barCount)) - 1;
}
