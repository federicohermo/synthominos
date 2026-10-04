import type { Sequence, ClockState } from './scheduler.types.ts';
import { midiToHz, scheduleVoice, scheduleClick } from './voice.ts';
import { collectWindow, intervalDuration } from './scheduler.ts';
import { offsetAt } from './playhead.ts';
import {
  NOTE_INTERVALS, RELEASE_INTERVALS, GRACE_INTERVALS, GRACE_VELOCITY,
} from './voice.constants.ts';
import { LOOKAHEAD, TICK_MS, HIT } from './scheduler.constants.ts';
import {
  MASTER_GAIN, DEFAULT_BPM, PLAY_DELAY, CLOCK_START_DELAY,
  FFT_SIZE, SMOOTHING,
} from './engine.constants.ts';

/**
 * Capa de aplicacion del audio: los singletons y la API que consume la UI.
 *
 * Es la unica de las tres capas que toca el `AudioContext` global. `voice.ts` y
 * `scheduler.ts` lo reciben por parametro y no importan este modulo, asi que la
 * separacion que antes sostenia un comentario ahora la sostiene el grafo de
 * imports — y es lo que permite renderizarlas con un OfflineAudioContext.
 *
 * NO es un barrel: no re-exporta voice ni scheduler en bloque.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;

/**
 * Si construir el grafo ya fallo. Es estado y no configuracion: nace en false y lo
 * sube el `catch` de `audio()`. Por que latchea, en el docblock de abajo.
 */
let fallado = false;

/**
 * El AudioContext del modulo: hay uno por pestana y no uno por instancia del
 * componente.
 *
 * Se crea perezosamente porque los navegadores exigen un gesto del usuario para
 * arrancar el audio.
 *
 * Devuelve null si el navegador no soporta Web Audio: la app queda usable pero
 * muda, y cada llamador tiene que chequearlo.
 *
 * ## Un fallo PARCIAL no puede dejar el contexto en pie
 *
 * `ctx` se asigna ANTES de crear el gain y el analizador, asi que cualquier cosa que
 * tire despues de `new AudioContext()` sale por el `catch` devolviendo null pero deja
 * el contexto asignado. Sin bajarlo, la llamada siguiente entra por `if (ctx) return
 * ctx` y contesta un contexto con `master` en null. Desde ahi: `startClock` no salia
 * por su guarda —`audio()` devolvio algo—, arrancaba el `setInterval`, `clockRunning()`
 * pasaba a `true`, `alternarTransporte` le creia y el boton decia «Pausa»... mientras
 * cada vuelta del reloj se plantaba antes de agendar y no sonaba una nota. Es
 * exactamente la falla suave que esta capa obliga a chequear en todo llamador, entrando
 * por la unica puerta que el llamador no puede ver: pregunta si el motor arranco, y el
 * motor le contesta que si.
 *
 * Por eso el `catch` baja las tres referencias juntas. El contexto a medio construir
 * NO se cierra: `close()` devuelve una promesa y obligaria a colgarle un rechazo vacio
 * que no corre nunca —una funcion sin cubrir contra el umbral 100, y el repo no tiene
 * con que silenciarla—. Queda vivo y sin referencias, igual que antes de este spec.
 *
 * ## La marca LATCHEA, y ese es el precio
 *
 * Sin ella cada llamada reintenta el constructor y vuelve a avisar por consola: un
 * click, un warning. Con ella la app queda muda hasta recargar aunque la causa fuera
 * transitoria. Se acepta por dos motivos: el reintento tampoco la desmutea —lo unico
 * que agrega hoy es ese warning por click— y un estado que se recupera solo es un
 * estado que nadie puede reproducir.
 */
export function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (fallado) return null;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;

    // El analizador va ENTRE el master y el destino, no colgado de una rama
    // paralela: asi ve exactamente la mezcla que sale por los parlantes. Es
    // transparente al audio —no altera la senal que lo atraviesa—, de modo que
    // insertarlo no cambia como suena nada.
    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  } catch (e) {
    // Las tres juntas: un `ctx` vivo con `master` en null es el estado degradado que
    // el docblock describe, y el unico que la UI no puede distinguir de uno sano.
    ctx = null;
    master = null;
    analyser = null;
    fallado = true;
    console.warn('Web Audio no disponible', e);
    return null;
  }
  return ctx;
}

/**
 * Buffer de lectura del espectro. Ver la advertencia en readSpectrum().
 *
 * El `<ArrayBuffer>` va escrito y NO se puede simplificar a `Uint8Array` pelado, aunque
 * el `pnpm typecheck` de hoy lo acepte. Desde TypeScript 5.7 los arrays tipados son
 * genericos en su buffer, y `Uint8Array` a secas significa `Uint8Array<ArrayBufferLike>`,
 * que incluye `SharedArrayBuffer`. El `lib.dom.d.ts` de la 5.8.3 —la version fijada en el
 * repo— todavia declara `getByteFrequencyData(array: Uint8Array)`, asi que compila; las
 * versiones siguientes lo estrecharon a `Uint8Array<ArrayBuffer>` y ahi el pelado pasa a
 * ser un TS2345. Medido: con la 5.8.3 verde y con la 7.0.2 error en esta misma linea, o
 * sea que el editor ya lo marca hoy con el repo en verde.
 *
 * Escribirlo no es defensivo: `new Uint8Array(n)` SIEMPRE aloca un `ArrayBuffer`, asi que
 * este es el tipo real del valor y el pelado era el que decia de mas. Es tambien la unica
 * salida que respeta el "cero `any`, cero `@ts-ignore`" del repo.
 *
 * `binsToBars` sigue recibiendo el `Uint8Array` ancho a proposito: solo lee, asi que no
 * tiene por que rechazar un buffer compartido. El estrechamiento es del que llama a la
 * API del navegador, no del que consume los numeros.
 */
let freqBuf: Uint8Array<ArrayBuffer> | null = null;

/**
 * Magnitudes de frecuencia del ultimo bloque procesado, 0-255 por bin.
 *
 * Devuelve null cuando todavia no hay senal que mirar: sin contexto (nadie hizo
 * click aun) o con el contexto suspendido. Es informacion util para el llamador
 * —un array de ceros y "no hay audio" se dibujan distinto— y ademas evita crear
 * el AudioContext desde el loop de dibujo, que correria sin gesto del usuario.
 *
 * CUIDADO: el Uint8Array es reusado entre llamadas para no asignar 60 veces por
 * segundo. Quien lo guarde va a ver como le cambia por debajo. El consumidor
 * previsto es un loop de dibujo, que lo lee y lo descarta en el mismo cuadro; si
 * hace falta conservarlo, copiarlo con slice().
 */
export function readSpectrum(): Uint8Array<ArrayBuffer> | null {
  if (!analyser || !ctx || ctx.state !== 'running') return null;
  if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
    freqBuf = new Uint8Array(analyser.frequencyBinCount);
  }
  analyser.getByteFrequencyData(freqBuf);
  return freqBuf;
}

/**
 * Dispara un arpegio contra el singleton, ya mismo.
 *
 * NO es el unico camino de nota a sonido: tick() llama a scheduleVoice() directo,
 * porque collectHits ya devolvio los instantes expandidos y volver a pasar por aca
 * significaria recalcular el espaciado que el scheduler ya aplico.
 *
 * Siguen siendo dos caminos, pero ahora comparten tambien el RITMO, no solo el
 * timbre: el paso del arpegio, la duracion de la nota y su release salen de
 * intervalDuration con el bpm de este modulo, aca y en tick(). Antes tambien coincidian, pero por
 * copiar el mismo numero fijo en segundos —uno leia la constante y el otro la
 * recibia dentro del Job—, y ese numero ignoraba el tempo: eran dos lugares que
 * alguien tenia que mantener iguales. Hoy es una regla sola y sigue al bpm.
 *
 * Lo que sigue SIN unificar es COMO se expande el arpegio: un cambio en la linea
 * de abajo no llega al loop, igual que un cambio en collectHits no llega aca.
 * Cambiar el timbre en DEFAULT_VOICE si alcanza para los dos.
 */
export function playNotes(notes: number[]): void {
  const c = audio();
  // ## Por que la guarda se queda con las dos mitades
  //
  // La segunda no es alcanzable desde afuera: el `catch` de `audio()` baja `ctx` y
  // `master` juntos, asi que un contexto vivo implica un master
  // vivo. Se queda igual porque es lo que impide que un fallo FUTURO —una linea nueva
  // entre la asignacion de `ctx` y la del master, o un camino que todavia no existe—
  // llegue a `scheduleVoice` con destino nulo, y porque el estrechamiento del `const`
  // de abajo sale de ella.
  //
  // Va con este comentario y no sin el porque «rama inalcanzable» es justo lo que el
  // repo pide borrar: esta es la excepcion argumentada. Y se la puede dejar escrita
  // porque el coverage no la marca: el `return` SI se ejecuta —por la primera mitad,
  // con Web Audio ausente— y la segunda se evalua en cada arpegio. En `tick()` no
  // pasaba eso y por eso ahi la guarda se mudo; el argumento esta en su docblock.
  if (!c || !master) return;
  // `bus` en vez de un `!` sobre `master`: el `forEach` de abajo es un closure y ahi
  // TypeScript pierde el estrechamiento, porque `master` es un `let` de modulo y
  // cualquier llamada intermedia podria reasignarlo. La const lo congela, y el repo
  // prohibe la asercion no nula por el mismo motivo que el `any`.
  const bus = master;
  const start = c.currentTime + PLAY_DELAY;
  const interval = intervalDuration(bpm);
  const dur = NOTE_INTERVALS * interval;
  const rel = RELEASE_INTERVALS * interval;
  notes.forEach((m, i) => scheduleVoice(c, bus, midiToHz(m), start + i * interval, dur, rel));
}

/** Dispara ya, reanudando el contexto. Debe llamarse desde un gesto del usuario. */
export function playNow(notes: number[]): void {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  playNotes(notes);
}

// —— reloj ——

/**
 * El recorrido que esta sonando y el que va a sonar cuando este cierre su ciclo.
 *
 * Dos y no una: colocar o quitar una pieza no interrumpe lo que suena (D5). El
 * cambio de una por otra lo hace `collectWindow`, al cerrar el ciclo.
 */
let active: Sequence = { steps: [], clicks: [], length: 0 };
let pending: Sequence | null = null;
const clock: ClockState = { origin: 0, scheduledUntil: 0 };
let timer: number | null = null;
let bpm = DEFAULT_BPM;

export const setBpm = (v: number): void => { bpm = v; };

/**
 * Si los clicks MUDOS del recorrido suenan. Es MEZCLA, no modelo.
 *
 * Vive aca y no en la secuencia por eso: apagarlos no cambia el recorrido —los clicks
 * siguen en la `Sequence` y `collectHits` los sigue emitiendo—, solo deja de
 * cablearlos a sonido en `tick()`. Filtrar antes obligaria a reconstruir la
 * secuencia para algo que no es una decision del tablero, y ademas haria que el
 * ciclo pareciera distinto segun el volumen.
 *
 * Es un parametro suelto a proposito: si molesta, se baja o se apaga sin tocar el
 * modelo. Salio de escuchar — los clicks de un salto largo se acumulan y tapan la frase.
 *
 * **Solo los mudos.** El cruce por celda ocupada suena la nota de esa
 * celda, y eso es MODELO: es la pieza pisada contestando, no un adorno de mezcla. Por
 * eso `tick()` lo despacha por su propia rama del `kind` y este interruptor no lo toca
 * — apagarlo dejaria el recorrido diciendo que cruzo por el vacio donde cruzo por una
 * pieza. Es tambien la razon por la que `HIT` tiene tres claves y no dos con un campo
 * opcional: sin discriminante, esta funcion no tendria a quien apagar.
 *
 * **Arranca en `false`**, y este es el segundo lugar donde vive ese
 * default: el otro es el `useState` de `App.tsx`, que `useMotorSincronizado`
 * (`playback/ui/use-engine.ts`) baja al motor en su efecto de montaje.
 * Que se pisen no vuelve inofensivo dejarlos en desacuerdo — es el mismo valor
 * declarado dos veces, exactamente lo que `App.tsx` evita tomando el tempo de
 * `DEFAULT_BPM`. El argumento del cambio esta escrito donde el usuario lo ve, que es
 * `App.tsx`.
 */
let clicksAudible = false;
export const setClicksAudible = (v: boolean): void => { clicksAudible = v; };

/**
 * Encola el recorrido nuevo. NO toca lo que esta sonando: entra en vigencia recien
 * al cerrar el ciclo activo.
 *
 * Esperar al cierre es lo que permite que el circuito se reordene entero sin que el
 * patron salte a mitad de frase (D5).
 *
 * El precio esta medido y es la decision mas cara del modelo de recorrido: con 8 piezas a 110
 * bpm el ciclo dura 7,5 s, asi que una pieza recien colocada puede tardar eso en
 * escucharse dentro del loop. Lo que si suena al instante es su arpegio, por el otro
 * camino a sonido (`playNotes`).
 *
 * Solo se guarda la ultima: dos cambios antes del cierre valen por uno, porque lo que
 * se encola es el recorrido COMPLETO y no un delta.
 */
export function setSequence(next: Sequence): void { pending = next; }

/**
 * La secuencia ACTIVA —la que esta sonando— en numeros, expuesta para verificacion
 * manual desde la consola.
 *
 * Informa la activa y no la pendiente: preguntarle al motor que agendo y que le
 * contesten lo que todavia no agendo seria peor que no tener la funcion. Reemplaza a
 * `jobCount()`, que era la forma de mirar el motor sin oirlo y que este spec borro
 * junto con los jobs.
 */
// `clicks` y `crosses` por separado: el campo `clicks` de la
// `Sequence` mezcla las dos cosas, pero el motor las distingue —una se apaga con
// `setClicksAudible` y la otra no—, y esta funcion existe para mirar el motor sin
// oirlo. Un solo numero obligaria a oir cual es cual, que es lo que no se puede.
export const sequenceInfo = (): { steps: number; clicks: number; crosses: number; length: number } => ({
  steps: active.steps.length,
  clicks: active.clicks.filter((c) => c.note === undefined).length,
  crosses: active.clicks.filter((c) => c.note !== undefined).length,
  length: active.length,
});

export const clockRunning = (): boolean => timer !== null;

/**
 * Cuantas veces el motor puso en vigencia una secuencia nueva desde que carga el modulo.
 *
 * Es lo unico que sabe el INSTANTE exacto en que el ciclo nuevo empezo a sonar. La UI
 * tiene el par activa/pendiente del dominio (`playback/ui/route-source.ts`) pero no puede
 * derivar el borde: el swap lo decide `collectWindow` dentro del lookahead, medio
 * intervalo antes del cierre, y ninguna cuenta sobre `placed` lo ve venir.
 *
 * Arranca en 0 y NO se resetea en stopClock/startClock: pausar no cambia que ciclo esta
 * en vigencia, asi que resetear haria creer a la UI que hubo un swap que no hubo.
 */
let cycleGen = 0;
export const cycleGeneration = (): number => cycleGen;

/**
 * En que intervalo del ciclo esta la cabeza lectora, o null si no hay nada que marcar.
 *
 * Devuelve null en pausa, sin contexto, con el contexto que no esta corriendo, con la
 * secuencia activa vacia y ANTES de que la activa empiece a sonar (ver abajo). Es
 * informacion y no una falla, igual que `readSpectrum()` en reposo: "no hay cabeza" y
 * "la cabeza esta en 0" se dibujan distinto.
 *
 * Lee `ctx` y no `audio()` por el mismo motivo que readSpectrum: el llamador previsto es
 * un loop de dibujo y crear el AudioContext desde ahi seria hacerlo sin gesto del usuario.
 *
 * Mira la secuencia ACTIVA, no la pendiente: la cabeza tiene que recorrer lo que suena.
 * Que la UI dibuje el circuito correcto abajo es problema de `playback/ui/route-source.ts`.
 *
 * ## `now < origin` es "todavia no empezo", y ahi no hay nada que dibujar
 *
 * `collectWindow` pone la pendiente en vigencia DENTRO del lookahead y deja `origin` en
 * el borde, que en ese momento es futuro: medido, hasta 82 ms a 110 bpm, mas la latencia
 * de salida. Durante esa ventana la secuencia activa ya es la nueva pero lo que se
 * escucha sigue siendo la cola de la vieja, que quedo agendada hasta medio intervalo
 * antes del borde. Lo mismo pasa en el primer arranque, con los 50 ms de
 * `CLOCK_START_DELAY`.
 *
 * Sin este corte, `offsetAt` contesta —correctamente, como funcion total— la COLA del
 * ciclo nuevo, o sea `ciclo - 1`. Y ese numero, que es el MAXIMO posible, destapaba de
 * un saque las cinco celdas del velo de `Playhead.tsx`: el estreno celda por celda no se
 * veia nunca, ni al colocar con el ciclo andando ni al apretar play. Es el bug que el
 * test «el swap deja `origin` en el FUTURO» de `scheduler.test.ts` deja clavado.
 *
 * El precio es que la cabeza se apaga esa ventana en cada swap. Es lo correcto: la ruta
 * vieja termino y la nueva todavia no empezo, asi que cualquier celda que se dibujara
 * ahi seria mentira.
 */
export function playheadOffset(): number | null {
  if (timer === null || !ctx || ctx.state !== 'running') return null;
  if (active.length <= 0) return null;
  const now = ctx.currentTime - outputLatency(ctx);
  if (now < clock.origin) return null;
  return offsetAt(now, clock.origin, intervalDuration(bpm), active.length);
}

/**
 * Cuanto tarda en oirse lo que se agenda en `currentTime`. Sin restarlo, la cabeza va
 * sistematicamente adelantada y en un instrumento eso se percibe como que la imagen miente.
 *
 * La cadena `outputLatency` → `baseLatency` → 0 NO es redundante aunque el tipo diga que
 * si: `lib.dom.d.ts` declara `outputLatency` como `number` no opcional, pero Firefox no lo
 * implementa y ahi la propiedad llega `undefined`. Por eso las dos lecturas se tipan a mano
 * como `number | undefined` en vez de taparse con un `any` o un `@ts-ignore`, que ademas el
 * repo prohibe: el fallback tiene que sobrevivir a que TypeScript lo crea innecesario.
 *
 * No tiene test: los tests corren contra node-web-audio-api, donde estos numeros no
 * describen ninguna salida real. Se verifica en el navegador y a oido.
 */
function outputLatency(c: AudioContext): number {
  const out: number | undefined = c.outputLatency;
  if (typeof out === 'number' && Number.isFinite(out)) return out;
  const base: number | undefined = c.baseLatency;
  if (typeof base === 'number' && Number.isFinite(base)) return base;
  return 0;
}

/**
 * El cableado a sonido de una ventana de lookahead.
 *
 * ## Recibe el destino en vez de leerlo del modulo, y eso NO es cosmetico
 *
 * Empezaba con la misma guarda que `playNotes` —`const c = audio();
 * if (!c || !master) return;`— y ese `return` era alcanzable: con el grafo a medio
 * construir `audio()` contestaba un contexto sin master y el reloj arrancaba igual.
 * Bajar `ctx` junto con `master` en el `catch` mato esa entrada, y con ella la unica
 * forma de ejecutar el `return`: el timer solo existe despues de que `audio()` contesto,
 * y desde entonces el par no se puede volver a partir.
 *
 * La guarda no se borro, se MUDO al unico lugar donde sigue siendo alcanzable —
 * `startClock`, que corre con Web Audio ausente—, y aca la reemplaza la firma. Es mas
 * fuerte que la guarda: no hay que acordarse de chequear, no compila sin el par. Y es
 * la salida que el repo pide para una rama inalcanzable: se vuelve alcanzable o se va,
 * nunca se silencia. Medido: dejarla escrita aca daba un statement y una branch
 * descubiertos contra el umbral 100, en las dos formas —el `return` del `if` negado, y
 * el `else` implicito del `if` en positivo—.
 */
function tick(c: AudioContext, bus: GainNode): void {
  // El bpm no cambia dentro de la vuelta, asi que la duracion y el release salen una
  // sola vez y todas las notas de esta ventana quedan medidas contra el mismo tempo.
  const interval = intervalDuration(bpm);
  const dur = NOTE_INTERVALS * interval;
  const rel = RELEASE_INTERVALS * interval;
  // El cruce con altura comparte el release con la nota —lo que lo hace floritura es el
  // cuerpo mas corto y la amplitud mas baja, no otro timbre—, asi que solo su `dur` es
  // propio. Ver GRACE_INTERVALS: por debajo de 0,75 la envolvente se desarma al tempo
  // maximo del instrumento.
  const grace = GRACE_INTERVALS * interval;
  // Toda la decision —incluido el swap al cierre del ciclo— vive en el scheduler,
  // que es testeable; aca queda el cableado a sonido, que sin AudioContext no se
  // puede correr. Ver el docblock de collectWindow.
  const w = collectWindow(c.currentTime, LOOKAHEAD, bpm, active, pending, clock);
  // Identidad de referencia y no comparacion de contenido: `collectWindow` devuelve la
  // MISMA referencia cuando no hubo swap y la de la pendiente cuando si, asi que un
  // `!==` cubre sus DOS ramas —la del borde de ciclo y la de `vigente.length <= 0`— sin
  // que el scheduler tenga que enterarse de que alguien cuenta.
  //
  // Que cuente tambien la segunda importa mas de lo que parece: el primer arranque pasa
  // siempre por ahi —active vacia, reloj recien largado—, y si no subiera, la cabeza no
  // apareceria en el primer ciclo y si en todos los siguientes. Es un sintoma raro de
  // diagnosticar despues.
  if (w.active !== active) cycleGen++;
  active = w.active;
  pending = w.pending;
  // Tres clases y tres ramas. El cruce con altura vuelve a pasar
  // por `scheduleVoice` y no por una funcion nueva: es una nota, con otros dos numeros.
  // Y no lo mira `clicksAudible`, que apaga solo la rama muda.
  //
  // **Y no hay una cuarta rama, ni la va a haber por dos motivos distintos.**
  //
  // No hay acento en el primer click del ciclo: todos son identicos
  // porque el circuito **no tiene un tiempo fuerte**. `buildSequence` fija el arranque
  // en el indice 0 solo para eliminar las rotaciones equivalentes del mismo recorrido,
  // asi que el "1" es un punto de partida convencional y no el comienzo de nada.
  // Acentuarlo le inventaria un principio al circuito, y eso seria una decision del
  // MODELO y no del timbre — el lugar donde se discutiria es `circuit/domain/sequence.ts`.
  //
  // Y una pieza muteada no tiene rama propia: sus celdas emiten el mismo `Click` sin
  // `note` que una celda vacia, asi que pasan por este mismo `clicksAudible`. Con los
  // clicks apagados eso da **silencio total** sobre una pieza muteada, y esa es la
  // respuesta buscada y no un caso sin cubrir: mutear una pieza es sacarla del sonido,
  // y apagar los clicks es sacar del sonido lo que el recorrido dice al pasar por el
  // vacio — las dos cosas apuntan al silencio, asi que el silencio es lo correcto.
  // Separar los dos significados costaria un cuarto `HIT` y un discriminante en
  // `Click`, o sea dos tipos nuevos para distinguir dos maneras de callarse.
  for (const hit of w.hits) {
    if (hit.kind === HIT.note) scheduleVoice(c, bus, hit.hz, hit.at, dur, rel);
    else if (hit.kind === HIT.cross) scheduleVoice(c, bus, hit.hz, hit.at, grace, rel, GRACE_VELOCITY);
    else if (clicksAudible) scheduleClick(c, bus, hit.at);
  }
}

export function startClock(): void {
  if (timer !== null) return;
  const c = audio();
  const bus = master;
  // Las dos mitades, y la segunda es la que este spec trajo hasta aca: es la casa nueva
  // de la guarda que `tick()` tenia adentro. Arrancar el reloj es lo que hace que
  // `clockRunning()` conteste `true` y que el boton diga «Pausa», asi que es EL lugar
  // donde no se puede mentir sobre si el motor esta entero. `audio()` no devuelve
  // un contexto sin master —el `catch` los baja juntos—, pero el que arranca el reloj
  // tiene que verificarlo igual: es la unica funcion cuya respuesta la UI muestra.
  if (!c || !bus) return;
  if (c.state === 'suspended') void c.resume();
  clock.origin = c.currentTime + CLOCK_START_DELAY;
  // Estrictamente ANTES de origin: firstOnsetAfter devuelve el primer onset
  // POSTERIOR a lo ya emitido, asi que con scheduledUntil = origin el primer onset
  // del ciclo 0 se saltearia y el primer sonido llegaria un ciclo tarde — que son
  // 7,5 s con 8 piezas, no un compas. Es la misma trampa que vuelve
  // a aparecer en el swap de collectWindow.
  clock.scheduledUntil = c.currentTime;
  // El par viaja en el closure y no se vuelve a leer del modulo en cada vuelta: ya
  // quedo verificado en la guarda de arriba y no puede cambiar mientras el timer viva. Al
  // pararlo, el closure se va con el.
  timer = window.setInterval(() => tick(c, bus), TICK_MS);
}

export function stopClock(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}
