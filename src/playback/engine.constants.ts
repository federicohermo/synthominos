/** Ganancia del master. */
export const MASTER_GAIN = 0.3;

/** Tempo inicial. Lo comparten el motor y el estado de la UI: es un solo numero. */
export const DEFAULT_BPM = 110;

/**
 * Margen al disparar ya mismo, para no agendar en el pasado.
 *
 * En SEGUNDOS y no en intervalos, a diferencia de todo lo musical (`NOTE_INTERVALS`,
 * `RELEASE_INTERVALS`, los offsets de la secuencia): esto no es musica sino una latencia
 * de AGENDA — cuanto futuro hace falta para que el evento no llegue tarde. No tiene
 * relacion con el pulso y no debe estirarse con el tempo: a 60 bpm un margen mas grande
 * no serviria de nada y a 160 uno mas chico seguiria sin alcanzar. Es la misma excepcion
 * deliberada que `CLICK_SECONDS`, por otro motivo.
 */
export const PLAY_DELAY = 0.02;

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

/** 128 bins (fftSize / 2). Suficiente para visualizar, insuficiente para afinar. */
export const FFT_SIZE = 256;

/** Promediado temporal entre lecturas: sin el la animacion tiembla; de mas, es melaza. */
export const SMOOTHING = 0.8;
