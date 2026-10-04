/**
 * Aritmetica de la cabeza lectora: en que intervalo del ciclo esta parada.
 *
 * Vive aparte de `engine.ts` por el mismo motivo por el que `spectrum.ts` vive aparte
 * del AnalyserNode: leer el reloj exige el singleton del AudioContext, que en los
 * tests no existe, asi que lo unico afirmable —la cuenta— se separa del nodo que no
 * se puede correr. Aca la entrada son cuatro numeros y la salida es determinista.
 *
 * Modulo puro: sin Web Audio, sin DOM, sin React.
 */

/**
 * Indice ENTERO del intervalo que la cabeza pisa, dentro de `[0, cycleIntervals)`.
 *
 * Entero y no flotante (D6): la cabeza salta de celda en celda porque el recorrido
 * esta cuantizado a la grilla de intervalos y el sonido tambien. Interpolar dibujaria
 * una posicion que el modelo no tiene.
 *
 * `now` se espera YA compensado por la latencia de salida: lo que se agenda en
 * `ctx.currentTime` se escucha mas tarde, y esa resta es del llamador porque depende
 * del contexto —que este modulo no puede ver— y no de la aritmetica.
 *
 * Devuelve `null` y nunca `NaN` en los tres degradados alcanzables:
 *
 * - `cycleIntervals <= 0` es el tablero vacio, y se llega apretando play. `x % 0` en
 *   JS es `NaN`, que aguas abajo se dibuja como una celda fantasma en vez de fallar.
 * - `intervalSeconds <= 0` no pasa hoy —sale de `intervalDuration(bpm)`— pero dividir
 *   por el tiene el mismo final.
 * - un argumento no finito envenena la cuenta entera; se corta antes.
 *
 * `now < origin` NO es un degradado: la progresion esta definida para todo `k`, asi que
 * la respuesta es la cola del ciclo. Por eso el modulo es euclideo: el `%` de JS
 * conserva el signo del dividendo y devolveria -1.
 *
 * Que sea la respuesta CORRECTA no la vuelve la respuesta UTIL, y esa distincion costo
 * un bug: `playheadOffset()` corta antes de llegar aca cuando `now < origin`, porque en
 * esa ventana —los 50 ms de `CLOCK_START_DELAY`, o los hasta 82 ms entre un swap de
 * ciclo y el borde— la secuencia activa todavia no empezo a sonar y la cola del ciclo
 * nuevo es una celda que nadie esta escuchando. El detalle vive en el docblock de
 * `playheadOffset`; aca la funcion se queda total, que es lo que la hace afirmable.
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

  // El ciclo se trunca a entero antes de usarlo como modulo: `Sequence.length` ya
  // viene en intervalos enteros, pero un fraccionario devolveria un offset fuera de
  // la grilla de celdas y la cabeza quedaria entre dos.
  const ciclo = Math.floor(cycleIntervals);
  if (ciclo <= 0) return null;

  const transcurridos = Math.floor((now - origin) / intervalSeconds);
  return ((transcurridos % ciclo) + ciclo) % ciclo;
}
