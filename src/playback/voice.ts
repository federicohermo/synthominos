import type { VoiceOpts } from './voice.types.ts';
import {
  DEFAULT_VOICE, DEFAULT_VELOCITY, RELEASE_TAIL,
  CLICK_VELOCITY, CLICK_SECONDS, CLICK_MIDI, CLICK_EPSILON,
} from './voice.constants.ts';

/**
 * Sintesis: una voz por nota, oscilador mas envolvente ADSR.
 *
 * Recibe el `BaseAudioContext` por parametro y **no puede** tocar el singleton: el
 * singleton vive en `engine.ts` y este modulo no lo importa. Es lo que permite
 * renderizar la sintesis con un `OfflineAudioContext` en los tests, y ahora lo
 * sostiene el grafo de imports en vez de un comentario.
 */

/** MIDI a Hz. A4 = 69 = 440 Hz. */
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Agenda UNA nota. `at` es tiempo absoluto del reloj del contexto, no un delay.
 *
 * El `setValueAtTime(0, at)` inicial no es redundante: las rampas de Web Audio
 * interpolan desde el ultimo evento agendado, asi que sin ese ancla la rampa
 * arranca en el valor que haya quedado y se oye un click.
 *
 * Las rampas son lineales y no exponenciales porque exponentialRampToValueAtTime
 * no admite llegar a 0 — habria que rampar a un epsilon y cortar.
 *
 * `dur` y `rel` son obligatorios y sin default a proposito, igual que `phase` en
 * `Job`: los dos se cuentan en intervalos, o sea que dependen del tempo y no
 * pueden ser constantes. Un default seria un numero fijo en segundos que miente
 * sobre el bpm vigente, y el llamador que se olvidara el parametro no se
 * enteraria. Los calculos —`NOTE_INTERVALS * intervalDuration(bpm)` y
 * `RELEASE_INTERVALS * intervalDuration(bpm)`— viven donde esta el bpm, que es
 * `engine.ts`, y este modulo sigue sin saber de tempo.
 *
 * `rel` entra como parametro y no dentro de `opts` por eso mismo: `opts` es el
 * TIMBRE —lo que se puede dejar en su default sin mentir— y el release no es una
 * preferencia sino una medida de tiempo, como `dur`.
 */
export function scheduleVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  freq: number,
  at: number,
  dur: number,
  rel: number,
  vel = DEFAULT_VELOCITY,
  opts: VoiceOpts = {},
): void {
  const { attack, decay, sustain, type } = { ...DEFAULT_VOICE, ...opts };
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);

  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(vel, at + attack);
  env.gain.linearRampToValueAtTime(vel * sustain, at + attack + decay);
  env.gain.setValueAtTime(vel * sustain, at + dur);
  env.gain.linearRampToValueAtTime(0, at + dur + rel);

  osc.connect(env);
  env.connect(dest);
  osc.start(at);
  osc.stop(at + dur + rel + RELEASE_TAIL);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/**
 * Agenda UN click: el recorrido cruzando una celda vacia. `at`
 * es tiempo absoluto del reloj del contexto, igual que en scheduleVoice.
 *
 * **Una campana de altura fija, y no ruido.** Esto llego a ser un
 * `AudioBufferSourceNode` lleno de muestras aleatorias, con un argumento que NO se
 * borra porque sigue siendo cierto a medias: un oscilador SIEMPRE tiene altura, y una
 * altura que se mueve hace que el recorrido dibuje una linea melodica que compite con
 * las piezas. Lo que ese argumento no vio es que hay una tercera opcion entre "sin
 * altura" y "una altura que se mueve": **lo que dibuja una linea melodica es tener
 * alturas DISTINTAS**, y esta —`CLICK_MIDI`— nunca cambia. Un metronomo tiene altura y
 * no toca nada; no es una nota, es una marca.
 *
 * El riesgo que quedaba —que se lea como una nota mas del arpegio— se elimina por el
 * REGISTRO y no por la brevedad: `CLICK_MIDI` esta nueve semitonos por encima del techo
 * del instrumento, asi que ninguna pieza puede llegar ahi. El motivo estaba en el
 * ruido, ahora esta en la altura elegida, y esta escrito donde vive el numero.
 *
 * Y era el evento equivocado para dejar en ruido: medido, el centroide espectral del
 * click viejo caia en 11 260 Hz —casi dos octavas por encima del techo del
 * instrumento— y en un tablero de 3 piezas el 44 % de lo que suena en un ciclo son
 * clicks. Casi la mitad del instrumento era siseo.
 *
 * **El `stop()` no es opcional, y es el argumento viejo dado vuelta.** Antes no habia
 * ninguno, con el motivo escrito: el buffer duraba exactamente `CLICK_SECONDS` y se
 * terminaba solo, asi que un `stop()` habria sido un segundo lugar donde vive la
 * duracion. Un `OscillatorNode` no se termina nunca, asi que hace falta para dos cosas:
 * cortar el `CLICK_EPSILON` en el que muere la exponencial —que si no sigue sonando— y
 * disparar el `onended` del que cuelgan los `disconnect()`, sin el cual quedan ~12
 * osciladores vivos por ciclo.
 */
export function scheduleClick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  at: number,
  vel = CLICK_VELOCITY,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(midiToHz(CLICK_MIDI), at);

  // Sin rampa de ataque, al reves que scheduleVoice: alla el escalon se oye como un
  // click y hay que anclarlo en 0; aca el click ES lo que se busca, y una rampa de
  // ataque le sacaria justo el transitorio que lo hace percusivo.
  //
  // Pero la caida SI cambia de forma: exponencial y no lineal, tambien al reves que
  // scheduleVoice. Alla la lineal es obligada porque la envolvente de una nota tiene
  // que cerrar en silencio y la exponencial no admite llegar a 0; aca la caida ES el
  // timbre —es lo que hace campana en vez de golpe— y una exponencial a CLICK_EPSILON
  // es lo que suena a resonancia que se apaga. El precio de esa forma es el stop().
  env.gain.setValueAtTime(vel, at);
  env.gain.exponentialRampToValueAtTime(CLICK_EPSILON, at + CLICK_SECONDS);

  osc.connect(env);
  env.connect(dest);
  osc.start(at);
  osc.stop(at + CLICK_SECONDS);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}
