/**
 * Test helpers that render audio in a deterministic way.
 *
 * OfflineAudioContext renders to an AudioBuffer in memory, faster than real time, with
 * the same output in each run. So a test can assert on frequency, envelope and instants,
 * and nobody has to listen.
 *
 * It comes from node-web-audio-api and not from the browser: jsdom does not implement
 * Web Audio.
 */
import { OfflineAudioContext } from 'node-web-audio-api';

export const SR = 44100;

export function offline(seconds: number, sampleRate = SR) {
  return new OfflineAudioContext(1, Math.floor(seconds * sampleRate), sampleRate) as unknown as OfflineAudioContext & BaseAudioContext;
}

/** The absolute peak in a window centered on `t` seconds. */
export function peakNear(d: Float32Array, t: number, halfWin = 220, sampleRate = SR): number {
  const c = Math.floor(t * sampleRate);
  let p = 0;
  for (let i = Math.max(0, c - halfWin); i < Math.min(d.length, c + halfWin); i++) {
    p = Math.max(p, Math.abs(d[i]));
  }
  return p;
}

/**
 * The frequency in [from, to] seconds, estimated from the zero crossings.
 *
 * The crossings are interpolated linearly, and the measure goes from the FIRST crossing
 * to the LAST one, not between the limits of the window. To count the crossings and
 * divide by the length of the window quantizes the result: in 0.1 s the error is ~5 Hz,
 * enough to read 261.6 Hz as 263.2. Two consecutive crossings are half a period apart,
 * so N crossings in T seconds give (N-1)/(2T).
 */
export function zeroCrossHz(d: Float32Array, from: number, to: number, sampleRate = SR): number {
  const s = Math.floor(from * sampleRate);
  const e = Math.min(Math.floor(to * sampleRate), d.length - 1);
  let first = -1, last = -1, n = 0;

  for (let i = s; i < e; i++) {
    if ((d[i] >= 0) === (d[i + 1] >= 0)) continue;
    // the fraction of a sample where the line between d[i] and d[i+1] crosses zero
    const frac = d[i] / (d[i] - d[i + 1]);
    const t = (i + frac) / sampleRate;
    if (first < 0) first = t;
    last = t;
    n++;
  }
  if (n < 2 || last <= first) return 0;
  return (n - 1) / (2 * (last - first));
}

/** The instant of the first audible sample. -1 if the buffer is silence. */
export function firstAudible(d: Float32Array, threshold = 1e-6, sampleRate = SR): number {
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > threshold) return i / sampleRate;
  return -1;
}

/**
 * Detects onsets with an envelope follower and a hysteresis of two thresholds.
 *
 * A threshold on the raw sample does NOT work: each zero crossing of the wave looks like
 * silence and fires a new onset. Measured: 21 false onsets for 3 notes.
 *
 * The resolution is the width of the window (5 ms by default). The tolerance of +-6 ms
 * of AC-PLY-010 comes from it.
 */
export function detectOnsets(
  d: Float32Array,
  { window = 0.005, on = 0.05, off = 0.01, sampleRate = SR } = {},
): number[] {
  const W = Math.floor(window * sampleRate);
  const onsets: number[] = [];
  let armed = true;
  for (let w = 0; w * W < d.length; w++) {
    let peak = 0;
    for (let i = w * W; i < Math.min((w + 1) * W, d.length); i++) peak = Math.max(peak, Math.abs(d[i]));
    if (armed && peak > on) { onsets.push((w * W) / sampleRate); armed = false; }
    else if (!armed && peak < off) armed = true;
  }
  return onsets;
}
