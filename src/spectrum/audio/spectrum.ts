/**
 * Mapeo de bins de la FFT a geometria de barras.
 *
 * Vive aparte del AnalyserNode a proposito: el nodo NO se puede testear con un
 * OfflineAudioContext —el render offline no tiene cuadros y getByteFrequencyData
 * devuelve el estado del ultimo bloque procesado—, asi que toda la logica que se
 * puede afirmar se mudo aca, donde la entrada es un Uint8Array a mano y la salida
 * es determinista. El nodo queda reducido a una fuente de datos sin test propio.
 *
 * Modulo puro: sin Web Audio, sin DOM, sin React.
 */

/**
 * Agrupa los bins de la FFT en `barCount` barras con espaciado logaritmico y
 * devuelve alturas normalizadas 0-1.
 *
 * Logaritmico y no lineal porque los bins estan espaciados linealmente en
 * frecuencia pero la percepcion no: con reparto lineal las primeras barras se
 * comen toda la informacion musical util y el resto del canvas queda vacio.
 *
 * Pico por banda y no promedio: promediar una banda ancha aplana los transitorios,
 * que es justo lo que hay que ver en un instrumento percusivo. El pico conserva el
 * ataque.
 */
export function binsToBars(bins: Uint8Array, barCount: number): Float32Array {
  const n = Math.max(0, Math.floor(barCount));
  const out = new Float32Array(n);
  if (n === 0 || bins.length === 0) return out;

  for (let b = 0; b < n; b++) {
    const from = Math.min(bandEdge(bins.length, n, b), bins.length - 1);
    // Piso de `from + 1`: garantiza que ninguna banda quede vacia cuando barCount
    // supera la cantidad de bins. Sin el, los bordes de las bandas graves caen
    // todos en el mismo indice y esas barras salen en 0 sin importar la senal.
    // El precio es que dos barras vecinas pueden compartir un bin; a esa escala
    // el reparto ya perdio resolucion de todas formas.
    const to = Math.max(from + 1, Math.min(bandEdge(bins.length, n, b + 1), bins.length));

    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, bins[i]);
    out[b] = peak / 255;
  }
  return out;
}

/**
 * Borde inferior de la banda `b` sobre el indice de bin, con reparto logaritmico.
 *
 * Se eleva `binCount + 1` y se resta 1 para que la funcion sea exacta en los dos
 * extremos: b = 0 da 0 y b = barCount da binCount. Con `binCount ** (b/barCount)`
 * a secas el ultimo borde cae en binCount - 1 y el bin mas agudo nunca se lee.
 */
function bandEdge(binCount: number, barCount: number, b: number): number {
  return Math.floor((binCount + 1) ** (b / barCount)) - 1;
}
