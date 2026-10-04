import type { Cell } from '../../pieces/domain/transform.types.ts';

/**
 * Una pieza dentro del circuito: cuando arranca su arpegio y que cinco notas toca.
 *
 * `offset` va en INTERVALOS, no en segundos: la unidad es la celda recorrida (spec
 * 008) y el dominio no conoce el tempo. Convertir a tiempo es del motor, y que la
 * cuenta viva en enteros es lo que hace que el mismo tablero suene siempre igual —
 * no hay acumulacion de error de punto flotante que dependa del orden de la suma.
 *
 * `pieceId` y no la `PlacedPiece` entera para que el motor pueda reconciliar dos
 * secuencias sin conocer la geometria: es la unica parte de la pieza que la capa de
 * audio necesita, y llevarse el resto la ataria al dominio.
 *
 * `notes` ya viene en ORDEN DE REPRODUCCION: si la pieza se coloco reflejada, el
 * retrogrado ya lo aplico `arpeggioFor` —la unica derivacion de pieza a arpegio del
 * dominio—, asi que `buildSequence` lo toma tal cual y no vuelve a invertir nada.
 */
export interface Step {
  pieceId: string;
  offset: number;
  notes: number[];
}

/**
 * Una celda cruzada por el recorrido: donde suena, cuando, y con que altura si la
 * celda estaba ocupada.
 *
 * La `cell` no es decorativa aunque el motor solo necesite el `offset`. Es lo que
 * permite que la garantia de "dos clicks no caen nunca en el mismo instante" se
 * verifique en el dominio, que es donde se puede distinguir un click de otro: si
 * dos coincidieran, el motor los agendaria a los dos y las amplitudes se sumarian,
 * que es exactamente lo que D4 pide evitar. Tambien es lo que deja que la celda que
 * se ilumina y la que suena salgan del MISMO dato (D8).
 *
 * `note` es el MIDI de la celda pisada cuando el recorrido no pudo esquivar una
 * pieza, y no esta cuando la celda estaba vacia. Es opcional y NO una
 * union discriminada, y aca esa es la forma correcta justamente por la `cell`: la
 * altura es un DERIVADO de ella —`noteAtCell` del ocupante, o nada si no hay
 * ocupante—, asi que "sin `note`" significa exactamente "esa celda estaba vacia" y
 * ninguna construccion puede producir la combinacion equivocada. En `audio/` la
 * decision es la contraria y va union discriminada: alla la celda no viaja, y sin
 * ella nada atajaria un click con altura que no deberia tenerla.
 */
export interface Click {
  offset: number;
  cell: Cell;
  note?: number;
}

/**
 * Una pieza dentro del circuito, suene o no: cuando le toca.
 *
 * Es lo que `steps` no puede contestar, porque una pieza MUTEADA no emite `Step`. El
 * muteo no la saca del recorrido —sigue ocupando su lugar y
 * su tiempo, y el circuito la sigue visitando—, asi que leer el orden de visita de
 * `steps` pasaria por alto justamente a las piezas que no suenan. Sin muteo las dos
 * listas son la misma, que es por lo que este campo no siempre existio.
 *
 * `offset` esta acá y en `Step` para las piezas que suenan, y no pueden discrepar: las
 * dos salen de la MISMA variable del mismo bucle de `buildSequence`, en la misma
 * iteracion. Es duplicacion de escritura, no de derivacion.
 */
export interface Visita {
  pieceId: string;
  offset: number;
}

/**
 * El circuito entero, listo para agendar: los arpegios, los clicks, el orden de visita
 * y el largo del ciclo.
 *
 * `length` es el ciclo COMPLETO —incluye el salto de la ultima pieza de vuelta a la
 * primera—, asi que no es el offset del ultimo paso sino donde el recorrido vuelve
 * a empezar. Sin ese salto el loop se cerraria antes de tiempo y la costura se
 * escucharia.
 *
 * `order` lleva TODAS las piezas y `steps` solo las que suenan: una
 * pieza muteada esta en el primero y no en el segundo. Con el tablero sin mutear nada
 * son la misma lista en el mismo orden, que es lo que hace que `order` se pueda comparar
 * campo por campo entre las dos versiones de un tablero.
 */
export interface Sequence {
  steps: Step[];
  clicks: Click[];
  order: Visita[];
  length: number;
}
