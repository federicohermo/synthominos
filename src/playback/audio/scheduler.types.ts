import type { HIT } from './scheduler.constants.ts';

/**
 * Un ciclo listo para sonar: lo unico que el motor necesita saber, y nada mas.
 *
 * El modelo es un RECORRIDO: un circuito cerrado visita las piezas, y
 * las celdas que cruza entre una y otra suenan al pasar. En el dominio un cruce lleva
 * su celda ademas de su instante, porque alli el recorrido ES el modelo.
 *
 * Aca la celda igual no viaja, y hay que decir POR QUE, porque de las dos razones que
 * se le pueden poner vale una sola:
 *
 * - **Vale** que no podria verla: `Cell` vive en el dominio y el override
 *   de eslint sobre esta capa prohibe importarlo, tambien como `import type` (usa la
 *   variante de typescript-eslint, que si ve los imports de tipo). Importarlo no
 *   romperia el navegador —los tipos se borran—: rompe `pnpm lint`, que es donde la
 *   separacion de capas se verifica de verdad.
 * - **NO vale** que para sonar alcance con contar. Eso seria cierto solo si todo
 *   cruce fuera un click sin altura, y no lo es: el recorrido puede pisar
 *   una celda OCUPADA y ese cruce suena la nota de la celda, asi
 *   que `clicks` lleva su `note` en MIDI.
 *
 * O sea que el numero MIDI cruza el borde y la coordenada no, y eso no es un
 * accidente: el motor sabe sonar alturas y no sabe que es un tablero.
 *
 * Las dos salidas faciles quedaron descartadas, y conviene que quede escrito por si
 * alguien las vuelve a proponer:
 *
 * - DUPLICAR `Cell` en esta capa deja dos definiciones que alguien tiene que
 *   mantener iguales a mano, que es exactamente lo que la regla de constantes del
 *   repo existe para evitar.
 * - AFLOJAR el override del linter compra comodidad tirando abajo la separacion que
 *   sostiene el grafo de imports.
 *
 * Por eso esta forma es la del dominio MENOS `pieceId` y MENOS `cell`:
 * `playback/ui/engine-bridge.ts` es el unico puente entre las dos capas y entrega la secuencia
 * dejando caer esos campos. Vive en `ui/` porque es la unica capa que puede
 * importar los dos tipos `Sequence` —el override de eslint le prohibe a `domain/` ver
 * `audio/` y viceversa—, y es una PURA con test: escrita adentro del shell estaba
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
