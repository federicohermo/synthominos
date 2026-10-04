import { midiToHz } from './voice.ts';

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
 * Un ciclo listo para sonar: lo unico que el motor necesita saber, y nada mas.
 *
 * El modelo es un RECORRIDO: un circuito cerrado visita las piezas, y
 * las celdas que cruza entre una y otra suenan al pasar. En el dominio un cruce lleva
 * su celda ademas de su instante, porque alli el recorrido ES el modelo.
 *
 * Aca la celda no viaja: el motor sabe sonar alturas y no sabe que es un tablero. Lo
 * que cruza es el numero MIDI, y no alcanza con contar los cruces: el recorrido puede
 * pisar una celda OCUPADA y ese cruce suena la nota de la celda, asi que `clicks` lleva
 * su `note` en MIDI.
 *
 * Por eso esta forma es la del circuito MENOS `pieceId` y MENOS `cell`:
 * `playback/engine-bridge.ts` es el unico puente entre las dos y entrega la secuencia
 * dejando caer esos campos. Es una PURA con test: escrita adentro del shell estaba
 * dos veces y no se podia exportar ni verificar. Es una
 * PROYECCION, no una traduccion —los `offset`, los `notes` y la `note`
 * del cruce viajan tal cual, en MIDI y sin recalcularse—, y eso solo se sostiene
 * mientras las dos formas sigan siendo estructuralmente compatibles.
 */
export interface Sequence {
  /**
   * Cada parada del recorrido: en que intervalo entra y que notas dispara.
   *
   * Sin `pieceId`: el motor no tiene a quien devolverselo. Quien necesita saber que
   * pieza sono es la UI, y la UI mira la secuencia del dominio, no esta.
   */
  steps: { offset: number; notes: number[] }[];
  /**
   * Los cruces del recorrido entre una pieza y la siguiente. Sin `cell` — ver arriba.
   *
   * `note` presente = la celda cruzada esta OCUPADA y el cruce suena su altura como
   * floritura; ausente = celda vacia y suena el click mudo de siempre. Va en MIDI, la
   * misma unidad que `steps.notes`, y quien lo convierte a Hz es `collectHits`.
   */
  clicks: { offset: number; note?: number }[];
  /**
   * Cuanto mide el ciclo completo, en INTERVALOS — la misma unidad que los `offset`.
   *
   * En intervalos y no en segundos porque el intervalo es la unidad ritmica del
   * instrumento (`intervalDuration(bpm) = barDuration(bpm) / 16`):
   * asi el recorrido mantiene su forma a cualquier tempo en vez de quedar atado al
   * bpm con el que se armo. Medido: con 8 piezas el ciclo mide ~55 intervalos, que a
   * 110 bpm son 7,5 s.
   */
  length: number;
}

export interface ClockState {
  /** instante del compas 0 en el reloj del contexto */
  origin: number;
  /**
   * Hasta donde ya se emitieron onsets.
   *
   * Sin esto cada onset se emitiria cuatro veces: los ticks son de 25 ms y el
   * horizonte de 100 ms, asi que las ventanas consecutivas se solapan.
   */
  scheduledUntil: number;
}

/**
 * Que clase de evento es un `Hit`.
 *
 * Derivado de `HIT` y no un `enum`: `erasableSyntaxOnly` rechaza los enums, y es la
 * misma opcion que permite cargar estos modulos con node sin compilar. Al derivarlo,
 * agregar una clase de evento es tocar un solo lugar.
 */
export type HitKind = (typeof HIT)[keyof typeof HIT];

/**
 * Un evento a sonar: que suena y en que instante del reloj del contexto.
 *
 * Union discriminada y NO un solo objeto con `hz?: number`. El campo opcional dejaria
 * pasar en silencio un click con altura —y una nota sin ella—, convirtiendo un error
 * de construccion en un `undefined` que nadie mira. Es el mismo argumento por el que
 * `phase` era obligatoria y sin default en el `Job` que este spec borro: el bug no es
 * de tipos, es que el tipo no obliga a decidir.
 *
 * Con la union, `kind` obliga a elegir y el compilador reclama el `hz` en la rama que
 * lo lleva.
 *
 * La TERCERA rama vuelve a poner a prueba el mismo argumento:
 * el cruce por celda ocupada lleva altura, y la salida corta habria sido un
 * `hz?: number` sobre la rama del click. Es la misma trampa de antes y ademas una
 * peor, porque `tick()` DESPACHA por `kind`: `setClicksAudible` tiene que apagar el
 * click mudo y dejar sonar el cruce con altura (D6), y con un campo opcional esa
 * decision seria un `hz === undefined` que el compilador no obliga a mirar.
 *
 * `cross` y `note` tienen la misma forma a proposito y no se colapsan en una: lo que
 * las distingue no es que datos llevan sino como suenan —el cruce va mas corto y mas
 * suave (`GRACE_INTERVALS`, `GRACE_VELOCITY`)—, y eso lo decide `tick()` mirando el
 * `kind`.
 */
export type Hit =
  | { kind: typeof HIT.note; hz: number; at: number }
  | { kind: typeof HIT.cross; hz: number; at: number }
  | { kind: typeof HIT.click; at: number };

/** Cuanto futuro se agenda en cada vuelta del temporizador, en segundos. */
export const LOOKAHEAD = 0.1;

/** Cada cuanto despierta el temporizador, en ms. No dispara notas: decide cuando mirar. */
export const TICK_MS = 25;

/**
 * Pulsos por compas. El instrumento esta en 4/4.
 *
 * No confundir con el ancho del tablero, que ademas no es un numero fijo: aquel dice
 * cuantas celdas hay y este en cuantos pulsos se divide el compas. Se pudieron
 * confundir mientras el eje X del tablero ERA el tiempo; hoy el tablero es un
 * recorrido y el motor no lo mira.
 */
export const BEATS_PER_BAR = 4;

/**
 * En cuantas partes se divide el pulso. Con 4, la unidad es la semicorchea.
 *
 * Es la grilla mas fina del instrumento: todo lo que se mide en tiempo —el paso
 * del arpegio y la duracion de una nota— se cuenta en intervalos, no en segundos.
 * Que sea una constante y no un numero suelto es lo que permite cambiar la
 * subdivision en un solo lugar sin que el arpegio y la nota se desincronicen.
 */
export const SUBDIVISIONS_PER_BEAT = 4;

/**
 * Las TRES clases de evento sonoro del recorrido: nota de pieza, click de celda vacia
 * y cruce por celda ocupada.
 *
 * La nota la dispara una pieza; el click lo produce una celda vacia que el circuito
 * cruza al ir de una pieza a la siguiente; y el cruce por una celda OCUPADA suena la
 * nota de esa celda como floritura.
 *
 * Tres claves y no dos con un campo opcional: el argumento largo
 * esta en el docblock de `Hit`, y ademas `cross` y `click` se despachan distinto en
 * `tick()` — `setClicksAudible` apaga solo al segundo, y sin discriminante no
 * tendria a quien apagar.
 *
 * Const-object con union derivada (`HitKind`) y no un `enum`: `erasableSyntaxOnly`
 * los rechaza, y es la misma opcion que permite cargar estos modulos con node sin
 * compilar. Los valores son strings iguales a sus claves para que un `Hit` sea
 * legible tal cual sale en un log o en un test, sin tener que traducir un numero.
 */
export const HIT = { note: 'note', click: 'click', cross: 'cross' } as const;

/**
 * Margen entre arrancar el reloj y el compas 0.
 *
 * Le da al primer tick (25 ms) tiempo de llegar antes del downbeat. Si el
 * temporizador se atrasa mas que esto, el compas 0 se saltea en vez de
 * recuperarse — coherente con el resto del reloj.
 *
 * En SEGUNDOS por lo mismo que `PLAY_DELAY`: se mide contra `TICK_MS`, que es una
 * latencia del temporizador, no contra el pulso.
 */
export const CLOCK_START_DELAY = 0.05;

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
