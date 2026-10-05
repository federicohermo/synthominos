/**
 * Utilidades de test para renderizar audio de forma deterministica.
 *
 * OfflineAudioContext renderiza a un AudioBuffer en memoria, mas rapido que
 * tiempo real, con salida identica en cada corrida. Es lo que permite afirmar
 * sobre frecuencia, envolvente e instantes en vez de escuchar.
 *
 * Viene de node-web-audio-api y no del navegador: jsdom no implementa Web Audio.
 */
import { OfflineAudioContext } from 'node-web-audio-api';

export const SR = 44100;

export function offline(seconds: number, sampleRate = SR) {
  return new OfflineAudioContext(1, Math.floor(seconds * sampleRate), sampleRate) as unknown as OfflineAudioContext & BaseAudioContext;
}

/** Pico absoluto en una ventana centrada en `t` segundos. */
export function peakNear(d: Float32Array, t: number, halfWin = 220, sampleRate = SR): number {
  const c = Math.floor(t * sampleRate);
  let p = 0;
  for (let i = Math.max(0, c - halfWin); i < Math.min(d.length, c + halfWin); i++) {
    p = Math.max(p, Math.abs(d[i]));
  }
  return p;
}

/**
 * Frecuencia estimada por cruces por cero en [from, to] segundos.
 *
 * Los cruces se interpolan linealmente y se mide entre el PRIMERO y el ULTIMO,
 * no contra los bordes de la ventana. Contar cruces y dividir por la duracion de
 * la ventana introduce cuantizacion: en 0.1 s el error es de ~5 Hz, suficiente
 * para que 261.6 Hz se lea como 263.2. Entre cruces consecutivos hay medio
 * periodo, asi que N cruces en T segundos dan (N-1)/(2T).
 */
export function zeroCrossHz(d: Float32Array, from: number, to: number, sampleRate = SR): number {
  const s = Math.floor(from * sampleRate);
  const e = Math.min(Math.floor(to * sampleRate), d.length - 1);
  let first = -1, last = -1, n = 0;

  for (let i = s; i < e; i++) {
    if ((d[i] >= 0) === (d[i + 1] >= 0)) continue;
    // fraccion de muestra donde la recta entre d[i] y d[i+1] cruza el cero
    const frac = d[i] / (d[i] - d[i + 1]);
    const t = (i + frac) / sampleRate;
    if (first < 0) first = t;
    last = t;
    n++;
  }
  if (n < 2 || last <= first) return 0;
  return (n - 1) / (2 * (last - first));
}

/** Instante de la primera muestra audible. -1 si el buffer es silencio. */
export function firstAudible(d: Float32Array, threshold = 1e-6, sampleRate = SR): number {
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > threshold) return i / sampleRate;
  return -1;
}

/**
 * Detecta onsets con seguidor de envolvente e histeresis de dos umbrales.
 *
 * Un umbral sobre la muestra cruda NO sirve: cada cruce por cero de la onda
 * parece silencio y dispara un onset nuevo. Medido durante el review del spec:
 * 21 falsos onsets para 3 notas.
 *
 * La resolucion resultante es el ancho de ventana (5 ms por defecto), de donde
 * sale la tolerancia de +-6 ms del AC5.
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
