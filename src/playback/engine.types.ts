/**
 * El puente con el motor, visto desde el lado de la UI: la forma que espera
 * `setSequence` y el ROL que el transporte cumple para la pura que lo alterna.
 *
 * Los dos nombres son del rol y no de la API de `playback/engine.ts`, y eso es
 * deliberado: `MotorDeTransporte` no dice `startClock`/`stopClock`/`clockRunning`
 * porque el tipo describe lo que la pura NECESITA —arrancar, frenar, y preguntar
 * qué pasó de verdad—, no lo que el motor exporta. La diferencia se cobra en el
 * test: un motor falso se escribe en una línea porque el tipo tiene tres
 * funciones y ninguna dependencia, y renombrarlo a la API del motor ataría la
 * firma de la pura al singleton del `AudioContext` sin necesidad.
 *
 * El mapeo a las tres funciones reales se hace en un solo lugar, que es
 * `playback/use-engine.ts` — el único módulo de la capa que importa la **API de transporte** del
 * motor. `Playhead.tsx`, `Spectrum.tsx` y `route-source.ts` también importan `playback/engine.ts`, pero
 * los tres piden lecturas y ninguno arranca, frena ni agenda nada.
 */

/** La `Sequence` que el motor espera: la del dominio MENOS `pieceId` y MENOS `cell`. */
export type { Sequence as SequenceDelMotor } from './scheduler.types.ts';

/**
 * El transporte, como tres funciones sin estado propio.
 *
 * `corriendo` no es redundante con lo que se le pidió: `arrancar` es un no-op
 * silencioso cuando el motor no tiene `AudioContext`, y
 * `.claude/rules/audio.md` obliga a todo llamador a chequearlo. Por eso el rol
 * lleva la consulta adentro en vez de dejarla afuera como cortesía.
 */
export interface MotorDeTransporte {
  arrancar: () => void;
  frenar: () => void;
  corriendo: () => boolean;
}
