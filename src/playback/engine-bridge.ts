import type { Sequence as SchedulerSequence } from './scheduler.ts';
import type { Sequence } from '../circuit/sequence.ts';

/**
 * Las dos puras del puente con el motor: proyectar la secuencia, y alternar el
 * transporte preguntándole qué pasó.
 *
 * Vive en `ui/` y no en `domain/` ni en `audio/` porque es el único lugar
 * del repo que puede importar los dos `Sequence`: el override de eslint le prohíbe
 * a cada una de esas dos capas ver a la otra, también como `import type`. Es el
 * mismo argumento por el que `route-source.ts` vive acá.
 *
 * Sin React y sin importar el motor: por eso su test corre en
 * `environment: 'node'` como los otros cinco de esta capa. El cableado con React y
 * con `playback/engine.ts` es de `use-engine.ts`, que no toma ninguna decisión.
 *
 * Los dos `Sequence` chocan de nombre, así que uno viaja con alias, y el alias va
 * del lado del motor. Medido en esta capa: el del dominio ya lo importa
 * `route-source.ts` y el del motor no lo importa nadie —1 contra 0—, y encima
 * `SequenceDelMotor` nombra el destino en vez del origen.
 */

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
export type SequenceDelMotor = SchedulerSequence;

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

/**
 * La `Sequence` del dominio, como la espera el motor.
 *
 * Acá se PROYECTA, no se traduce (D7, D8, AC12). `offset`, `notes` y la
 * `note` MIDI del cruce viajan tal cual; lo que se cae es `pieceId` —el motor no
 * tiene a quién devolvérselo— y `cell` en los clicks: el motor no puede ver `Cell`,
 * que vive en `domain/` y el override de eslint sobre `audio/**` lo prohíbe importar
 * incluso como `import type`. La `note` sí cruza, porque es un número MIDI y el motor
 * habla MIDI: el recorrido puede pisar una celda ocupada y ese
 * cruce suena su altura, así que no alcanza con contar los clicks.
 * Convertirla a Hz es del motor —lo hace `collectHits`, igual que con `steps.notes`—:
 * acá se proyecta, y traducir sería justo lo que esta función no hace.
 *
 * Escrita una sola vez y no dos, que es lo que este spec vino a arreglar: hasta acá
 * el bloque estaba en el efecto de reconciliación Y en el de desmontaje, con un
 * comentario que ya admitía que escribirla distinto invitaría a divergir. Con una
 * pura, «no divergir» deja de ser una promesa y pasa a ser imposible de escribir.
 */
export function proyectarAlMotor(s: Sequence): SequenceDelMotor {
  return {
    steps: s.steps.map(({ offset, notes }) => ({ offset, notes })),
    // El ternario y no `({ offset, note })`: con la forma corta el click mudo sale con
    // la clave `note` PRESENTE y en `undefined`, y la ausencia del campo es justo lo
    // que dice "celda vacía" (ver el docblock de `Click`). Hoy nadie lo notaría
    // —`collectHits` compara `=== undefined`— pero es el tercer estado que el tipo
    // existe para no tener.
    clicks: s.clicks.map((c) => c.note === undefined ? { offset: c.offset } : { offset: c.offset, note: c.note }),
    length: s.length,
  };
}

/**
 * Alterna el transporte y devuelve si quedó corriendo — lo que el MOTOR dice, no lo
 * que se le pidió.
 *
 * El `return motor.corriendo()` y no `return !playing` es la función entera: el motor
 * es quien sabe si arrancó, porque `arrancar` es un no-op silencioso cuando el
 * `AudioContext` no existe, y sin este chequeo el botón diría "Pausa" con el reloj
 * parado. Es la falla suave que `.claude/rules/audio.md` obliga a chequear en todo
 * llamador.
 *
 * El motor entra por PARÁMETRO y no por import, que es lo contrario de lo que hace
 * `route-source.ts` —importa `engine.ts` y su test lo mockea—. Las dos vías
 * funcionan; ésta se elige porque el valor que hay que testear es la DISCREPANCIA
 * entre lo que se pidió y lo que pasó, y con un motor falso esa discrepancia se
 * escribe en una línea (`corriendo: () => false`) en vez de armarse desde un mock.
 * Además evita que este archivo importe el singleton del `AudioContext` para leer un
 * booleano, que es el mismo motivo que el docblock de `route-source.test.ts` escribe.
 */
export function alternarTransporte(playing: boolean, motor: MotorDeTransporte): boolean {
  if (playing) motor.frenar(); else motor.arrancar();
  return motor.corriendo();
}
