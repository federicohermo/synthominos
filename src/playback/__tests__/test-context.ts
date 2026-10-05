import { OfflineAudioContext } from 'node-web-audio-api';

export const SR = 44100;

export function offline(seconds: number, sampleRate = SR) {
  return new OfflineAudioContext(1, Math.floor(seconds * sampleRate), sampleRate) as unknown as OfflineAudioContext & BaseAudioContext;
}

export function peakNear(d: Float32Array, t: number, halfWin = 220, sampleRate = SR): number {
  const c = Math.floor(t * sampleRate);
  let p = 0;
  for (let i = Math.max(0, c - halfWin); i < Math.min(d.length, c + halfWin); i++) {
    p = Math.max(p, Math.abs(d[i]));
  }
  return p;
}

/** First crossing to last: a count over the window quantizes by ~5 Hz in 0.1 s. */
export function zeroCrossHz(d: Float32Array, from: number, to: number, sampleRate = SR): number {
  const s = Math.floor(from * sampleRate);
  const e = Math.min(Math.floor(to * sampleRate), d.length - 1);
  let first = -1, last = -1, n = 0;

  for (let i = s; i < e; i++) {
    if ((d[i] >= 0) === (d[i + 1] >= 0)) continue;
    const frac = d[i] / (d[i] - d[i + 1]);
    const t = (i + frac) / sampleRate;
    if (first < 0) first = t;
    last = t;
    n++;
  }
  if (n < 2 || last <= first) return 0;
  return (n - 1) / (2 * (last - first));
}

export function firstAudible(d: Float32Array, threshold = 1e-6, sampleRate = SR): number {
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > threshold) return i / sampleRate;
  return -1;
}

// A threshold on the raw sample fires at each zero crossing of the wave, so this follows the
// envelope, with hysteresis. Its resolution is the window: 5 ms by default.
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
