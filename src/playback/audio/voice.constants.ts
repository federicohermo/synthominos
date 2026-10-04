import type { VoiceOpts } from './voice.types.ts';

/**
 * El timbre por defecto. Cambiarlo alcanza para los DOS caminos a sonido —el
 * arpegio al colocar y el loop—, porque los dos terminan en `scheduleVoice`.
 *
 * NO trae el release, y no puede traerlo: el release se cuenta en intervalos
 * (`RELEASE_INTERVALS`) y viaja como parametro, por la misma razon por la que `dur`
 * no tiene default. Un valor absoluto aca —los 0,12 s que seria natural poner— lo
 * dejaria fuera de las unidades musicales: son 0,48 intervalos a 60 bpm pero 1,28 a
 * 160, o sea que el solape del arpegio creceria con el tempo en vez de quedarse quieto.
 *
 * Lo que queda aca es lo que NO depende del tempo: attack y decay son el
 * transitorio del instrumento —su identidad perceptual es la brevedad absoluta,
 * igual que la de `CLICK_SECONDS`— y sustain es un nivel, no un tiempo.
 */
export const DEFAULT_VOICE: Required<VoiceOpts> = {
  attack: 0.005,
  decay: 0.06,
  sustain: 0.5,
  type: 'triangle',
};

/**
 * Cuanto dura una nota, en INTERVALOS. Sin contar el release, que se suma despues.
 *
 * En intervalos y no en segundos porque una duracion fija no sobrevive al cambio
 * de tempo: la nota mantiene su relacion con el pulso a cualquier bpm, mientras
 * que un valor en segundos se estira o se pisa con la nota siguiente segun el
 * tempo. Quien la use la multiplica por `intervalDuration(bpm)`.
 *
 * UNO y no dos: con dos, la nota dura exactamente el doble de lo que tarda en
 * llegar la siguiente, asi que el arpegio suena con 2,88 voces encimadas de forma
 * permanente —medido a 110 bpm, contando
 * `(NOTE_INTERVALS * intervalo + release) / intervalo`—. Con uno la nota termina
 * justo cuando entra la que sigue y lo unico que se solapa es la cola del release:
 * 1,88 voces, contra las 3,13 de la duracion fija que habia antes. El arpegio se
 * escucha como cinco notas y no como un acorde desplegado.
 *
 * A 100 bpm da 1 * 0.15 = 0.150 s, contra los 0.350 s de aquella duracion fija.
 *
 * El release tambien esta en intervalos (`RELEASE_INTERVALS`), asi que las 1,88 voces
 * son las mismas a cualquier tempo. Cuando eran 0,12 s absolutos el solape crecia con
 * el bpm.
 */
export const NOTE_INTERVALS = 1;

/**
 * Cuanto dura la caida de la nota despues de `dur`, en INTERVALOS.
 *
 * Es el par de `NOTE_INTERVALS` y existe por el mismo motivo: en segundos no
 * sobrevive al cambio de tempo. Era `DEFAULT_VOICE.release = 0.12` fijo, y con eso
 * el arpegio se espesaba al acelerar — las voces simultaneas son
 * `(NOTE_INTERVALS * intervalo + release) / intervalo`, o sea `1 + release/intervalo`:
 * con el release en segundos ese cociente crece con el bpm, y a 160 bpm daba 2,28
 * contra las 1,88 de 110. Es el mismo defecto que ya se habia corregido para el
 * espaciado y para la duracion, sobreviviendo en el ultimo numero que nadie habia
 * mirado.
 *
 * **0,88 y no un valor redondo**: es exactamente `0.12 / intervalDuration(110)`, o sea
 * el release que ya sonaba al tempo por defecto (`15 / 110 = 0,13636 s` de intervalo).
 * A 110 bpm la envolvente queda IDENTICA a la de antes de este cambio, y a cualquier
 * otro tempo el solape se queda en las 1,88 voces medidas en vez de moverse. Elegir un
 * numero mas lindo habria cambiado como suena el instrumento al tempo en el que se
 * afino, que es lo unico que este cambio no queria tocar.
 *
 * Quien lo usa lo multiplica por `intervalDuration(bpm)` y se lo pasa a
 * `scheduleVoice`, que sigue sin saber de tempo.
 */
export const RELEASE_INTERVALS = 0.88;

/**
 * Cuanto dura un CRUCE por celda ocupada, en INTERVALOS. Su release es el mismo
 * `RELEASE_INTERVALS` de una nota: lo que cambia es el cuerpo, no el timbre.
 *
 * En intervalos y no en segundos como `CLICK_SECONDS`. Lo que sostiene la excepcion del
 * click es la brevedad ABSOLUTA sola: el click SI tiene altura —una campana fija en
 * `CLICK_MIDI`—, asi que el motivo que se suele suponer ("no tiene altura") no aplica y
 * no se puede citar. Lo que separa a los dos sigue en pie igual: el click es una marca y
 * su altura nunca cambia, mientras que la del cruce es la nota de la celda que se piso,
 * o sea MODELO. Por eso su precedente es
 * `NOTE_INTERVALS` y tiene que mantener su relacion con el pulso a cualquier tempo.
 * Quien la multiplica por `intervalDuration(bpm)` es `engine.ts`, que es donde vive el
 * bpm.
 *
 * **Menor que uno**, porque el cruce es una floritura y no puede disputarle el turno
 * a la pieza: con 0,75 el cuerpo se apaga a tres cuartos del camino a la casilla
 * siguiente, y lo que queda sonando en ese ultimo cuarto es solo la cola del release.
 * Contado en voces simultaneas —`(dur + release) / intervalo`, la misma cuenta de
 * `NOTE_INTERVALS`—, un cruce pesa 1,63 contra las 1,88 de una nota.
 *
 * **0,75 y no menos, y ese es un piso MEDIDO, no una preferencia.** `scheduleVoice`
 * agenda `setValueAtTime(vel * sustain, at + dur)` despues de la rampa de decay, que
 * termina en `attack + decay = 0,065 s` ABSOLUTOS (los dos viven en `DEFAULT_VOICE`
 * porque son el transitorio del instrumento y no dependen del tempo). Si `dur` cae
 * antes de ese instante los eventos se procesan igual en orden temporal y la
 * envolvente se da vuelta: en vez de decaer se queda clavada en el pico y despues
 * baja de GOLPE al sustain. Renderizado offline a 160 bpm —el `TEMPO_MAX` del
 * instrumento, donde el intervalo mide 0,0938 s— con dur 0,25 · 0,5 · 0,693: las tres
 * sostienen 0,450 (el pico entero) y saltan a 0,225 en 1 ms, o sea un escalon que se
 * oye como un click justo lo que este cruce no quiere ser. Con 0,75 la envolvente
 * decae limpia y el salto mas grande del cuerpo pasa a ser la propia rampa de ataque.
 * El piso exacto a 160 bpm es 0,693 (`0,065 / 0,0938`) y 0,75 es el valor redondo que
 * lo pasa, con 5 ms de margen. Bajarlo obliga a mirar `DEFAULT_VOICE` y `TEMPO_MAX`
 * en la misma cuenta.
 */
export const GRACE_INTERVALS = 0.75;

/** Amplitud de una nota, 0-1. */
export const DEFAULT_VELOCITY = 0.8;

/**
 * Amplitud de un click, 0-1.
 *
 * Calibrado contra `DEFAULT_VELOCITY` (0,8), que es la de una nota: 0,25 es menos de
 * un tercio, unos -10 dB. Bajo a proposito para que el recorrido acompanie y no
 * compita con las notas (D4).
 *
 * Pero no mas bajo, y eso tambien esta medido: un ciclo de 8 piezas tiene 40 notas y
 * ~15 clicks, o sea que el click es minoria pero no ruido de fondo. Si no se
 * escucha, el recorrido se vuelve inaudible y pierde su razon de ser.
 *
 * Ademas el click dura `CLICK_SECONDS` (50 ms) contra los ~136 ms de una nota a 110
 * bpm, y un transitorio tan corto ya se percibe bastante mas debil que una nota
 * sostenida de la misma amplitud: bajar el numero seria descontar dos veces lo mismo.
 *
 * **Y hay un argumento en contra que el render offline no cierra**: a igual
 * pico, la campana tiene 15% MENOS de RMS que el ruido que reemplazo (0,0141 contra
 * 0,0167) pero vive en la banda de maxima sensibilidad del oido (`CLICK_MIDI`), asi
 * que puede percibirse mas FUERTE aun midiendo menos. Los dos efectos apuntan en
 * direcciones opuestas y ninguna medicion los suma: eso se decide escuchando, y el
 * numero se queda en 0,25 hasta que alguien lo haga.
 */
export const CLICK_VELOCITY = 0.25;

/**
 * Amplitud de un CRUCE por celda ocupada, 0-1. Entre las otras dos, y no en el medio
 * aritmetico.
 *
 * El cruce es una floritura: tiene que oirse mas presente que un click —lleva altura,
 * y si no se identifica como nota no se entiende que se piso una celda de una pieza—
 * pero mas al fondo que la nota de la pieza cuyo turno es. O sea que
 * el numero esta acotado por los dos que ya existen: `CLICK_VELOCITY` (0,25) y
 * `DEFAULT_VELOCITY` (0,8).
 *
 * **0,45 y no 0,525, que seria el promedio.** La amplitud se percibe en dB y no
 * linealmente, asi que el punto medio real es la media GEOMETRICA: `sqrt(0,25 * 0,8) =
 * 0,447`. Con 0,45 el cruce queda a -5,0 dB de una nota y a +5,1 dB de un click, o sea
 * a la misma distancia de los dos; con el promedio aritmetico quedaria a -3,7 dB de la
 * nota y a +6,4 dB del click, mucho mas cerca de sonar como una nota mas.
 *
 * Cinco dB tampoco es un numero arbitrario: es la diferencia mas chica que se lee
 * claramente como "esto suena mas suave" en vez de como una nota mal tocada, y todavia
 * deja al cruce audible en la mezcla — con 8 piezas un ciclo tiene 40 notas contra un
 * punado de cruces, asi que si se hunde no se escucha nunca.
 *
 * Ademas el cruce dura menos que una nota (`GRACE_INTERVALS`, 0,75 contra 1) y eso ya
 * lo aleja por su cuenta: bajar mas la amplitud seria descontar dos veces lo mismo, el
 * mismo argumento que cierra el docblock de `CLICK_VELOCITY`.
 */
export const GRACE_VELOCITY = 0.45;

/**
 * La ALTURA del click, en MIDI. 96 = `C7` = 2 093,0 Hz.
 *
 * El click es una campana de altura fija y no ruido blanco. Que
 * tenga altura no lo convierte en una linea melodica: lo que dibuja una linea es tener
 * alturas DISTINTAS, y esta nunca cambia. Un metronomo tiene altura y no toca nada.
 *
 * **Fuera del REGISTRO, porque de la escala no se puede salir.** Esto esta MEDIDO y es
 * lo que evita que alguien vuelva a intentar "elegir una nota que no se use": el
 * instrumento usa las 12 clases de altura sobre 12 — son 12 tonicas (`BASE_MAP` le da
 * una clase distinta a cada pieza) por cuatro formulas pentatonicas, asi que el
 * temperamento queda cubierto entero y no hay ni una nota libre. "Fuera de la escala"
 * no existe en este instrumento.
 *
 * Lo que si se puede es salir del registro, que va de `C4` (MIDI 60, 261,6 Hz) a `D#6`
 * (MIDI 87, 1 244,5 Hz). Ese techo ya incluye el corrimiento de octava que
 * `notesForRotation` aplica cuando la suma pasa de `B`, asi que no se puede deducir de
 * `DEFAULT_OCTAVE` a ojo. `C7` queda NUEVE semitonos por encima: ninguna pieza puede
 * llegar a esa altura ni enmascararla.
 *
 * **Y 2 kHz y no mas agudo, porque es donde el oido es mas sensible.** La banda de 2 a
 * 4 kHz es el maximo de la audicion humana, asi que una campana ahi se oye a MENOR
 * amplitud que la misma campana dos octavas arriba — que es exactamente lo que
 * `CLICK_VELOCITY` busca: que el recorrido acompanie sin competir. Subirla a `E7`
 * (MIDI 100) la haria mas "fuera del camino" en el papel y mas estridente en la
 * practica. Los candidatos mas graves se descartaron por el registro: `A6` (MIDI 93)
 * queda a 6 semitonos del techo contra los 9 de `C7`.
 */
export const CLICK_MIDI = 96;

/**
 * Cuanto dura un click, en SEGUNDOS.
 *
 * Es la excepcion deliberada a lo que dice `NOTE_INTERVALS`: lo musical se mide en
 * intervalos para que sobreviva al cambio de tempo, pero el click es un transitorio y
 * su identidad perceptual es la brevedad ABSOLUTA, no la proporcion con el pulso. Si
 * se estirara con el tempo duraria 0,367 intervalos, o sea 92 ms a 60 bpm, y empezaria
 * a tener cuerpo. El ancla de esa cuenta es `DEFAULT_BPM` (110 bpm, intervalo de
 * 136,4 ms), que es la misma que usa el resto del docblock: mezclar dos anclas en un
 * parrafo es lo que lo vuelve ilegible.
 *
 * **50 ms, y el numero que decide si dos clicks se pisan no es este sino la caida.**
 * Medido renderizando offline: la campana cae 40 dB a los 29,5 ms.
 *
 * ```
 * bpm            intervalo   el click ocupa   ya cayo 40 dB al
 * 60             250,0 ms    20 %             12 %
 * 110            136,4 ms    37 %             22 %
 * 160 TEMPO_MAX   93,8 ms    53 %             31 %
 * ```
 *
 * En el peor caso —160 bpm, el tope del slider— quedan 64 ms de aire entre la caida y
 * el evento siguiente. Con 80 ms la campana ocuparia el 85 % del intervalo a ese tempo
 * y caeria 40 dB recien a la mitad: dos clicks consecutivos se encimarian de forma
 * audible.
 *
 * **50 y no 20**: 20 ms de senoidal a 2 093 Hz son 42 ciclos, suficientes para que se
 * oiga la altura, pero la caida queda tan abrupta que el evento vuelve a leerse como un
 * golpe. Con 50 ms la campana DECAE, y ahi es donde suena a metronomo.
 */
export const CLICK_SECONDS = 0.05;

/**
 * El valor en el que muere la caida del click. Absoluto, no relativo a la amplitud.
 *
 * Existe porque la caida del click es EXPONENCIAL y `exponentialRampToValueAtTime` no
 * admite llegar a 0 — hay que rampar a un epsilon y cortar con `stop()`. Al reves que
 * en `scheduleVoice`, donde la lineal es obligada justamente porque la envolvente de
 * una nota tiene que cerrar en silencio: aca la caida ES el timbre, y una exponencial
 * a un epsilon es lo que suena a resonancia que se apaga en vez de a golpe.
 *
 * **0,0001 y no un valor mas redondo, porque es el que da la caida medida.** Desde
 * `CLICK_VELOCITY` (0,25) hasta 0,0001 hay 68 dB, repartidos linealmente en dB a lo
 * largo de `CLICK_SECONDS`: por eso los 40 dB caen a los 29,5 ms, que es el numero con
 * el que la tabla de `CLICK_SECONDS` decide que dos clicks no se pisan. Bajarlo hace la
 * campana mas seca y subirlo la deja colgada; cambiarlo obliga a rehacer esa tabla.
 *
 * **Es un piso para el `vel` de `scheduleClick`, no solo un destino.** La rampa es
 * exponencial, asi que solo cae si arranca POR ENCIMA de este valor: con un `vel` menor
 * la misma llamada se vuelve un swell en vez de una campana, y con `vel = 0` tira —una
 * rampa lineal a 0 aguantaria cualquier amplitud y esta no—.
 * Hoy no es alcanzable: el unico llamador de produccion es `engine.ts`, que usa el
 * default `CLICK_VELOCITY` (0,25), 2 500 veces este numero. Queda escrito porque el dia
 * que alguien agregue un llamador con volumen propio —una pieza muteada mas suave, por
 * ejemplo— el limite no se deduce de ninguna firma.
 */
export const CLICK_EPSILON = 0.0001;

/**
 * Colchon entre el final del release y el `stop()` del oscilador, en segundos.
 *
 * Sin el, el oscilador se corta justo cuando la envolvente llega a 0 y la cola
 * queda truncada.
 */
export const RELEASE_TAIL = 0.01;
