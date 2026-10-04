import type { Sequence, ClockState, Hit } from './scheduler.types.ts';
import { midiToHz } from './voice.ts';
import { BEATS_PER_BAR, SUBDIVISIONS_PER_BEAT, HIT } from './scheduler.constants.ts';
import { CLOCK_START_DELAY } from './engine.constants.ts';

/**
 * Scheduler con lookahead: decide QUE suena y CUANDO, sin producir sonido.
 *
 * Igual que `voice.ts`, no conoce el singleton del `AudioContext`: recibe los
 * tiempos por parametro. Es lo que permite llamarlo con instantes arbitrarios y
 * comparar contra lo esperado, sin depender de tiempo real.
 *
 * **El reloj es un origen, no un cursor.** `ClockState` son dos escalares y los
 * onsets del ciclo —`origin + (k * ciclo + offset) * intervalo`— se resuelven en
 * forma cerrada. Lo unico que cambio al pasar de compas a recorrido es el periodo:
 * antes el compas y la fase de la pieza, ahora el ciclo y el offset del paso. Escrito
 * como fraccion del ciclo, `phase = offset / length`, es la MISMA progresion, y por
 * eso `firstOnsetAfter` no se toco.
 *
 * **CUIDADO con las dos unidades.** `Sequence` habla en INTERVALOS (`offset` y
 * `length` son enteros de celda) y `ClockState` y `Hit.at` en SEGUNDOS del reloj
 * del contexto. La conversion es `intervalDuration(bpm)` y ningun tipo la fuerza:
 * un `length` sumado a un instante typechequea igual y suena cualquier cosa.
 */

/**
 * Duracion de un compas, en segundos. El 60 es la conversion de minutos a segundos.
 *
 * Exportada porque es una regla, no un detalle: cualquiera que quiera saber
 * cuanto dura `n` compases a un tempo dado la necesita, y volver a escribirla es
 * tener dos definiciones del compas.
 */
export const barDuration = (bpm: number): number => (60 / bpm) * BEATS_PER_BAR;

/**
 * Duracion de un intervalo —la unidad ritmica del instrumento— en segundos.
 *
 * Definida SOBRE barDuration y no con su propia formula: asi hay un solo lugar
 * donde el compas se convierte en segundos, y el intervalo no puede desfasarse
 * del compas al que subdivide.
 *
 * Exportada por el mismo motivo que barDuration: es una regla, no un detalle.
 * Antes el espaciado del arpegio era una constante en segundos (0.15) que no
 * miraba el tempo: el arpegio de 5 notas duraba 4 * 0.15 = 0.6 s a cualquier bpm,
 * o sea un 25% del compas a 100 bpm pero un 40% a 160, donde la linea base
 * mostro que las piezas ya se pisan. Derivado del compas mide siempre
 * `compas / 4` —1.000 s a 60 bpm, 0.375 s a 160— y deja de depender del tempo.
 * A 100 bpm da 0.15 s exactos, que es el valor de antes: ahi no cambia nada.
 */
export const intervalDuration = (bpm: number): number =>
  barDuration(bpm) / (BEATS_PER_BAR * SUBDIVISIONS_PER_BEAT);

/**
 * Primer onset de una progresion periodica estrictamente posterior a `after`.
 *
 * **El cuerpo no cambio ni un byte al pasar de compas a recorrido**, y por eso el parametro
 * sigue llamandose `bar`: lo que cambio es QUE se le pasa. Antes el periodo era el
 * compas y `phase` la columna del ancla sobre el ancho del tablero; ahora el periodo
 * es el CICLO del recorrido y `phase` es `offset / sequence.length`. Escrito como
 * fraccion del periodo es la misma progresion, que es exactamente el argumento por
 * el que esta funcion sobrevivio al cambio de modelo entera.
 *
 * `floor(x) + 1` y no `ceil(x)`: se quiere el primer k con onset > after, no >=.
 * Con `ceil`, un onset que cae exacto en el borde de una ventana se emitiria dos
 * veces — al cerrar una ventana y al abrir la siguiente.
 *
 * `k` puede salir negativo si `after` cae antes del origen, y esta bien: la
 * progresion esta definida para todo k. Solo pasa en la primera ventana despues
 * de startClock, con fases cercanas a 1, y a lo sumo emite la cola del ciclo -1
 * en los 50 ms previos al primer onset. Nunca produce un onset anterior a
 * `after`, que es la propiedad que importa.
 */
function firstOnsetAfter(after: number, origin: number, bar: number, phase: number): number {
  const k = Math.floor((after - origin) / bar - phase) + 1;
  return origin + (k + phase) * bar;
}

/**
 * Decide QUE suena y CUANDO, sin producir sonido.
 *
 * Separarlo de scheduleVoice es lo que hace testeable al scheduler: se lo puede llamar
 * con tiempos arbitrarios y comparar contra lo esperado, sin depender de tiempo real.
 *
 * Los onsets de un paso son la progresion `origin + (k + offset / length) * ciclo`.
 * Resolver el primer `k` en forma cerrada, en vez de avanzar un cursor, es lo que
 * permite que cada paso tenga su propio lugar en el recorrido sin emitir un ciclo
 * entero de una: **nunca se compromete mas de `horizon` de audio**, asi que quitar
 * una pieza la calla casi al instante. Importa mas que antes: el ciclo dejo de
 * durar un compas y con 8 piezas mide 7,5 s a 110 bpm.
 *
 * Los cruces recorren la misma grilla que los pasos y salen del mismo calculo; lo
 * unico que los distingue es que no tienen notas que expandir, asi que aportan un
 * solo hit por onset. Son de dos clases —celda vacia o celda
 * ocupada— y esta funcion es quien decide cual: la de mas abajo (`collectWindow`)
 * solo empalma ciclos, y `engine.ts` solo despacha lo que sale de aca.
 *
 * Muta `state.scheduledUntil`.
 */
export function collectHits(
  fromTime: number,
  horizon: number,
  bpm: number,
  sequence: Sequence,
  state: ClockState,
): Hit[] {
  const until = fromTime + horizon;
  const out: Hit[] = [];

  // Arrancar desde scheduledUntil evita re-emitir lo que ya salio en la ventana
  // anterior; arrancar desde fromTime cuando el reloj se adelanto DESCARTA los
  // ciclos perdidos por el estrangulamiento de la pestana en vez de intentar
  // recuperarlos. Es lo que reemplaza a una guarda de recuperacion explicita:
  // no hay bucle que acotar, porque el primer k sale en forma cerrada
  // y saltear 10 ciclos cuesta lo mismo que saltear 1.
  const from = Math.max(state.scheduledUntil, fromTime);
  // Sin este corte, una ventana mas chica que la anterior haria RETROCEDER
  // scheduledUntil y lo ya emitido volveria a salir. Tambien es lo que hace
  // inofensivo un horizonte negativo, que es como collectWindow acota el ciclo
  // viejo cuando el borde ya quedo atras.
  if (from >= until) return out;

  // Guarda de ciclo vacio: el periodo es `length * intervalo`, o sea 0, y
  // firstOnsetAfter divide por el. Es el estado real de "quite la ultima pieza",
  // no un caso teorico. Con `<= 0` y no `=== 0` porque un periodo negativo no
  // divide por cero pero hace que `at += ciclo` retroceda: el bucle no termina.
  // El reloj igual avanza — la guarda es contra la division, no una razon para
  // congelarlo.
  if (sequence.length <= 0) {
    state.scheduledUntil = until;
    return out;
  }

  // Depende solo del bpm de esta llamada, asi que sale una vez y no por nota:
  // adentro del forEach serian 5 divisiones por paso y por ciclo de la ventana.
  const interval = intervalDuration(bpm);
  const cycle = sequence.length * interval;

  for (const step of sequence.steps) {
    // `at += cycle` acumula error de punto flotante, y lo que lo vuelve inofensivo
    // es que cada llamada recalcula el primer onset desde origin: no hay deriva
    // ENTRE llamadas, que es donde si importaria. Ademas, como lo llama tick() el
    // bucle da a lo sumo una vuelta —horizonte de 0.1 s contra el ciclo medido mas
    // corto, 2,5 s con dos piezas—, pero eso es una propiedad de ESE llamador y no
    // de la funcion: con un horizonte de varios ciclos da varias vueltas, y los
    // tests la usan asi a proposito.
    for (let at = firstOnsetAfter(from, state.origin, cycle, step.offset / sequence.length); at <= until; at += cycle) {
      step.notes.forEach((m, i) => out.push({ kind: HIT.note, hz: midiToHz(m), at: at + i * interval }));
    }
  }

  for (const click of sequence.clicks) {
    // Fuera del bucle por lo mismo que `interval`: la clase del cruce y su altura no
    // dependen de en que ciclo cae, y el bucle puede dar varias vueltas con un
    // horizonte de varios ciclos. `null` y no `undefined` para que la rama que elige
    // el `kind` sea una comparacion y no una lectura de un campo que puede faltar.
    const hz = click.note === undefined ? null : midiToHz(click.note);
    for (let at = firstOnsetAfter(from, state.origin, cycle, click.offset / sequence.length); at <= until; at += cycle) {
      // Aca nace la tercera clase de evento. El cruce por celda
      // OCUPADA suena la nota de esa celda y el motor tiene que poder distinguirlo del
      // click mudo: `tick()` los agenda con constantes distintas y `setClicksAudible`
      // apaga solo al segundo (D6).
      out.push(hz === null ? { kind: HIT.click, at } : { kind: HIT.cross, hz, at });
    }
  }

  state.scheduledUntil = until;
  return out;
}

/**
 * Una vuelta entera del temporizador: recolecta la ventana y, si hay una secuencia
 * pendiente, la pone en vigencia al CERRAR el ciclo (D5).
 *
 * Vive aca y no en `engine.ts` por una razon medible: `engine.ts` toca el singleton
 * del `AudioContext`, que en los tests no existe —`audio()` devuelve null y `tick()`
 * se va por la falla suave—, asi que todo lo que se escriba alli solo se puede
 * verificar escuchando. El empalme del swap es la parte mas delicada del modelo y
 * es justo la que hay que poder afirmar con un test. `engine.ts` queda como el
 * cableado: llama a esta funcion y manda los hits a sonar.
 *
 * Devuelve la activa y la pendiente resultantes en vez de mutarlas: quien las tiene
 * es el llamador, y este modulo sigue sin estado propio.
 *
 * Muta `state` (origin y scheduledUntil).
 */
export function collectWindow(
  fromTime: number,
  horizon: number,
  bpm: number,
  active: Sequence,
  pending: Sequence | null,
  state: ClockState,
): { hits: Hit[]; active: Sequence; pending: Sequence | null } {
  const hits: Hit[] = [];
  let vigente = active;
  let enEspera = pending;

  if (enEspera !== null) {
    if (vigente.length <= 0) {
      // Sin ciclo activo no hay borde que esperar: la pendiente entra YA. Sin este
      // caso la primera pieza no sonaria nunca, porque no hay ciclo que cerrar.
      // Los dos escalares salen como en startClock y por el mismo motivo:
      // scheduledUntil estrictamente ANTES de origin, o firstOnsetAfter —que da el
      // primer onset POSTERIOR a lo ya emitido— saltea el onset que cae exacto en
      // origin y el primer sonido se pierde callado, sin ningun error.
      vigente = enEspera;
      enEspera = null;
      state.origin = fromTime + CLOCK_START_DELAY;
      state.scheduledUntil = fromTime;
    } else {
      const interval = intervalDuration(bpm);
      const cycle = vigente.length * interval;
      // Lo ya comprometido: la misma cuenta que hace collectHits, para que el borde
      // caiga despues de todo lo que la secuencia vieja ya agendo.
      const from = Math.max(state.scheduledUntil, fromTime);
      // `floor + 1` y no `ceil`, igual que firstOnsetAfter: el primer cierre
      // ESTRICTAMENTE posterior a lo comprometido. Con floor, saltear 10 ciclos por
      // una pestana oculta cuesta lo mismo que saltear 1, y ademas queda
      // garantizado `borde > from >= fromTime`: el swap se decide ANTES de cruzar el
      // borde, dentro del lookahead, asi que ningun onset del ciclo nuevo se agenda
      // en el pasado ni se pierde por llegar tarde a mirarlo.
      const borde = state.origin + (Math.floor((from - state.origin) / cycle) + 1) * cycle;

      if (borde <= fromTime + horizon) {
        // Medio intervalo antes del borde, y no el borde exacto: los onsets caen en
        // `origin + entero * intervalo`, asi que en ese medio intervalo no hay
        // ninguno —el ciclo viejo no pierde nada— pero el borde queda AFUERA de su
        // ventana. Sin esto la vieja agenda su propio onset de offset 0 en el borde,
        // la nueva agenda el suyo en el mismo instante y suenan los dos: esa es la
        // mitad de "no duplica" de AC13.
        const corte = borde - interval / 2;
        hits.push(...collectHits(fromTime, corte - fromTime, bpm, vigente, state));

        vigente = enEspera;
        enEspera = null;
        state.origin = borde;
        // Y la otra mitad, "no pierde": el swap deja scheduledUntil estrictamente
        // ANTES del nuevo origin, o firstOnsetAfter saltea el onset que cae exacto
        // en el borde y el ciclo nuevo arranca despues de su propio comienzo.
        //
        // Escrito como asignacion y no como `Math.min`: hoy el invariante ya se
        // cumple solo —`borde` se elige posterior a todo lo comprometido, asi que
        // scheduledUntil nunca llega a pasarlo— y quitar esta linea no rompe ningun
        // test, medido. Queda igual porque es la POSTCONDICION de la que depende que
        // no se pierda el primer onset, y no tiene que depender de como se derivo el
        // borde tres lineas mas arriba. Bajarlo tampoco puede duplicar: en
        // (corte, borde) no hay onsets de nadie, ni de la vieja ni de la nueva.
        state.scheduledUntil = corte;
      }
    }
  }

  hits.push(...collectHits(fromTime, horizon, bpm, vigente, state));
  return { hits, active: vigente, pending: enEspera };
}
