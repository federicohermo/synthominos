import type { Sequence } from '../../circuit/domain/sequence.types.ts';
import type { PlacedPiece } from '../../board-editing/domain/board.types.ts';
import type { Cell } from '../../pieces/domain/transform.types.ts';
import type { Marca, CeldaPorEstrenar } from './route.types.ts';
import { MARCA } from './route.constants.ts';
import { cellsByPlayOrder } from '../../circuit/domain/sequence.ts';
import { cycleGeneration } from '../audio/engine.ts';

/**
 * El par activa/pendiente del recorrido CON celdas, para que la cabeza dibuje lo que
 * suena y no lo que va a sonar.
 *
 * El motor ya tiene su propio par, pero su `Sequence` no lleva `pieceId` ni `cell`: el
 * click no tiene altura y para sonar alcanza con contarlo, y ademas el override de
 * eslint le prohibe a `audio/` ver `Cell`, tambien como `import type`. La unica
 * secuencia con celdas es la del dominio, y la UI la deriva de `placed`, que es el
 * tablero DE AHORA — o sea la pendiente. Sin este modulo la cabeza recorreria el
 * circuito encolado mientras suena el viejo, justo durante los hasta 7,5 s de espera
 * que este spec existe para hacer visibles.
 *
 * Vive en `ui/` y no en `audio/` por esa misma frontera: habla `Cell`. Es el
 * mismo cruce que `proyectarAlMotor` (`playback/ui/engine-bridge.ts`) ya hace al proyectar la
 * secuencia para `setSequence`.
 *
 * Singleton de modulo y NO estado de React a proposito: lo lee un loop de
 * requestAnimationFrame, igual que `readSpectrum()`. Meterlo en estado seria un render
 * por cuadro para un dato que el loop consume y descarta.
 *
 * Lo que se guarda no es la `Sequence` cruda sino su TABLA POR OFFSET, armada una vez
 * al encolar. Dos motivos, y ninguno es de estilo:
 *
 * - `Step` no lleva las celdas de sus cinco notas, asi que ir de un offset a una celda
 *   exige cruzar la secuencia con `placed` via `cellsByPlayOrder`. Hacerlo en el loop
 *   seria repetir 60 veces por segundo un join que no cambia entre cuadro y cuadro.
 * - El cruce tiene que quedar CONGELADO junto con la ruta. `placed` es el tablero de
 *   ahora: si el loop lo mirara en vivo, una pieza quitada durante el ciclo se apagaria
 *   antes de dejar de sonar, que es el mismo desfasaje que AC9 existe para evitar.
 */

/** Una celda de pieza dentro del ciclo: donde esta y en que intervalo suena. */
interface CeldaDePieza {
  cell: Cell;
  offset: number;
}

/** Una ruta ya lista para dibujar: que celda pisa cada offset, y quienes suenan en ella. */
interface Ruta {
  marcas: (Marca | null)[];
  ids: string[];
  /** Las cinco celdas de cada pieza con el intervalo en que suena cada una. */
  porPieza: Map<string, CeldaDePieza[]>;
}

const RUTA_VACIA: Ruta = { marcas: [], ids: [], porPieza: new Map() };

let activa: Ruta = RUTA_VACIA;
let pendiente: Ruta | null = null;

/**
 * La ultima generacion de ciclo observada.
 *
 * Se compara contra `cycleGeneration()` porque el motor es el unico que sabe el instante
 * exacto del swap: lo decide `collectWindow` medio intervalo antes del borde, y ninguna
 * cuenta sobre `placed` lo ve venir.
 */
let generacion = 0;

/**
 * Las piezas que entraron al ciclo en el ultimo swap y todavia no se estrenaron celda por
 * celda.
 *
 * Se reemplaza entero en cada swap; recordar cuales YA se estrenaron es del loop de
 * dibujo, que es quien lo observa cuadro a cuadro.
 */
let estrenando: string[] = [];

let veloActual: CeldaPorEstrenar[] = [];

/**
 * Encola el recorrido nuevo.
 *
 * La llama el mismo efecto de `use-engine.ts` que ya hace `setSequence`: las dos colas se
 * encolan juntas, o la cabeza y el sonido quedarian mirando ciclos distintos.
 *
 * Solo se guarda el ultimo, igual que en el motor: lo que se encola es el recorrido
 * COMPLETO, asi que dos cambios antes del cierre valen por uno.
 */
export function encolar(s: Sequence, placed: readonly PlacedPiece[]): void {
  pendiente = construir(s, placed);
  recomputarVelo();
}

/**
 * Devuelve la cola de dibujo a cero. La llama el Reset del shell —via
 * `reiniciarRecorrido()` de `use-engine.ts`— y NADIE mas.
 *
 * Existe porque este modulo avanza solo cuando `cycleGeneration()` sube, y ese contador
 * lo mueve `tick()`, o sea el reloj. Con el transporte parado `activa` y `estrenando`
 * quedan congelados, pero `encolar` igual recomputa el velo leyendolos: el resultado era
 * el velo de piezas que se fueron, dibujado sobre un tablero vacio, y se autocuraba recien
 * al volver a apretar Play.
 *
 * La asimetria que arregla estaba escrita de un solo lado. `App.tsx` ya declara que
 * «Reset frena el transporte ADEMAS de vaciar el tablero […] Reset es una orden
 * explicita de volver a cero, no una edicion del tablero, asi que es el unico lugar
 * donde saltearse D5 es lo correcto» — y ese parrafo hablaba solo del motor. Esta es la
 * SEGUNDA cola, y le vale igual: las dos se reinician por el mismo camino o vuelve la
 * asimetria.
 *
 * Por eso NO alcanza con que `encolar` limpie sola cuando la secuencia viene vacia: eso
 * convertiria «el tablero quedo vacio» en «volve a cero», y son cosas distintas. Quitar
 * la ultima pieza con el transporte corriendo tiene que seguir respetando D5 del 009 y
 * dejar que el ciclo cierre; el reinicio es una ORDEN, no una consecuencia.
 *
 * `generacion` es lo unico que NO vuelve a su valor inicial: se sincroniza con el motor.
 * `cycleGen` no se resetea nunca —su propio docblock dice que hacerlo «haria creer a la
 * UI que hubo un swap que no hubo»— asi que ponerla en cero reintroduce esa mentira
 * desde este lado, y ademas con la pendiente que `encolar` deja inmediatamente despues
 * el proximo cuadro haria un swap FUERA del borde del ciclo.
 */
export function reiniciar(): void {
  activa = RUTA_VACIA;
  pendiente = null;
  estrenando = [];
  generacion = cycleGeneration();
  // Por `recomputarVelo` y no por `veloActual = []` para que el velo tenga un solo lugar
  // donde se calcula: con las tres de arriba ya en cero, sale vacio y con identidad
  // nueva, que es la senal que el loop de dibujo mira para rearmar.
  recomputarVelo();
}

/**
 * El recorrido que esta sonando ahora mismo, como tabla indexada por offset.
 *
 * La llama el loop de dibujo, y el swap ocurre ACA: en el mismo cuadro en que el motor lo
 * reporta, no cuando React se entere.
 *
 * Que el loop corra tambien en pausa —igual que el de `Spectrum`— no es un problema
 * sino lo que hace que el swap se observe en el cuadro exacto.
 */
export function rutaActiva(): readonly (Marca | null)[] {
  const g = cycleGeneration();
  if (g === generacion) return activa.marcas;

  // La generacion se sincroniza SIEMPRE, haya pendiente o no: si el motor conto un swap
  // que aca no tenia contraparte, quedarse atras haria que el proximo encolar entre en
  // vigencia al cuadro siguiente en vez de esperar su borde.
  generacion = g;
  if (pendiente === null) return activa.marcas;

  // Las que no estaban sonando estrenan en este ciclo, y estrenan CELDA POR CELDA: es
  // lo unico que hace visible en que momento exacto a la pieza le toca su turno.
  const sonaban = new Set(activa.ids);
  estrenando = pendiente.ids.filter((id) => !sonaban.has(id));

  activa = pendiente;
  pendiente = null;
  recomputarVelo();
  return activa.marcas;
}

/**
 * Las celdas colocadas que todavia no sonaron nunca, para dibujarlas atenuadas (AC5).
 *
 * Son dos poblaciones distintas y por eso `offset` puede ser `null`:
 *
 * - Las de una pieza que YA entro al ciclo y todavia no llego su turno: tienen offset,
 *   y se estrenan cuando la cabeza las pisa. Esto es lo que hace legible que el orden
 *   de reproduccion no es el de colocacion — la pieza no se enciende cuando arranca el
 *   ciclo sino cuando le toca.
 * - Las de una pieza encolada, que ni siquiera entro: no hay instante que esperar
 *   todavia, solo el cierre del ciclo. Offset `null`.
 *
 * La IDENTIDAD del array es la senal de cambio: mientras sea el mismo array, el loop no
 * tiene nada que rearmar. Cambia al encolar y al hacer swap, o sea rarisimo comparado
 * con los 60 cuadros por segundo que lo leen.
 */
export function velo(): readonly CeldaPorEstrenar[] {
  return veloActual;
}

function recomputarVelo(): void {
  const out: CeldaPorEstrenar[] = [];

  for (const id of estrenando) {
    for (const c of activa.porPieza.get(id) ?? []) out.push({ id, cell: c.cell, offset: c.offset });
  }

  if (pendiente !== null) {
    const sonando = new Set(activa.ids);
    for (const id of pendiente.ids) {
      if (sonando.has(id)) continue;
      for (const c of pendiente.porPieza.get(id) ?? []) out.push({ id, cell: c.cell, offset: null });
    }
  }

  veloActual = out;
}

/**
 * Cruza la secuencia con el tablero y devuelve la tabla indexada por offset.
 *
 * Las celdas de las notas salen de `cellsByPlayOrder` —la pura del dominio, que ya trae
 * el retrogrado aplicado— y las de los clicks de `Click.cell`, que el 009 materializo
 * junto con la distancia. NINGUNA se calcula aca: entre las dos celdas mas lejanas del
 * tablero hay 792 caminos minimos, o sea 792 formas de dibujar un recorrido que no es el
 * que suena, y por eso D5 le prohibe a la vista elegir el suyo.
 *
 * `occupantAt` queda deliberadamente afuera aunque parezca el camino corto, y NO por
 * costo —medido: 4,1 us un tablero entero con 12 piezas, ver su docblock—, sino porque
 * contesta sobre `placed`, que es el tablero de AHORA. El dato que el loop necesita es
 * el de la ruta que esta sonando, y ese ya esta en la secuencia congelada.
 */
function construir(s: Sequence, placed: readonly PlacedPiece[]): Ruta {
  const marcas: (Marca | null)[] = new Array<Marca | null>(Math.max(0, s.length)).fill(null);
  const porPieza = new Map<string, CeldaDePieza[]>();
  const porId = new Map(placed.map((p) => [p.id, p]));

  for (const step of s.steps) {
    const pieza = porId.get(step.pieceId);
    // No puede pasar: el shell deriva la secuencia de las MISMAS piezas que le pasa acá
    // —las que entran en la grilla de ahora, ver `visibles` en `App.tsx`— con un `useMemo`,
    // y las entrega juntas al hook en el mismo efecto. Si igual pasara, ese paso queda sin
    // marcas y la cabeza lo cruza a oscuras en vez de dibujar una celda inventada — el
    // silencio es preferible a la mentira, porque una celda equivocada se lee como que el
    // modelo esta mal.
    if (!pieza) continue;
    const celdas = cellsByPlayOrder(pieza);
    const deLaPieza: CeldaDePieza[] = [];
    for (let j = 0; j < celdas.length; j++) {
      marcas[step.offset + j] = { cell: celdas[j], kind: MARCA.nota };
      deLaPieza.push({ cell: celdas[j], offset: step.offset + j });
    }
    porPieza.set(step.pieceId, deLaPieza);
  }

  // Los clicks despues de las notas y no antes: sus offsets no se pisan —lo garantiza el
  // test del 009— asi que el orden no cambia nada hoy, pero si alguna vez se pisaran, que
  // gane la nota es lo correcto: es lo que se escucha con altura.
  //
  // `Click.note` distingue el cruce sobre celda ocupada del click mudo de
  // siempre: `routeBetween` no sabe que hay debajo del camino que traza (D5 — la vista
  // no elige su propio recorrido), asi que el mismo offset puede caer sobre una celda
  // vacia o sobre una pieza que no le toca sonar todavia. Cuando cae sobre una pieza,
  // esa celda SUENA su nota como floritura, y eso tiene que verse distinto del click.
  for (const c of s.clicks) {
    marcas[c.offset] = { cell: c.cell, kind: c.note !== undefined ? MARCA.cruce : MARCA.click };
  }

  // `ids` y `porPieza` salen de `s.steps` y NO de `s.order`, asi que una pieza MUTEADA
  // no entra a ninguno de los dos: no tiene velo de estreno. Es una decision
  // y no un accidente de donde estaba escrito el `for` — el velo dice "esto todavia no
  // sono", y una pieza muteada no va a sonar nunca, asi que atenuarla hasta que le
  // "toque" prometeria algo que no va a pasar. Ademas la opacidad ya esta ocupada
  // diciendo eso, y el canal del muteo es otro: la baldosa blanca de `Board.tsx`.
  //
  // Lo que si la cubre son las MARCAS: sus cinco celdas entran por el `for` de los
  // clicks de arriba, asi que la cabeza lectora la sigue recorriendo celda por celda
  // —esta ocupando ese tiempo— pero con `MARCA.click` en vez de `MARCA.nota`, o sea con
  // el borde del click. Tambien es deliberado: lo que suena ahi ES un click.
  return { marcas, ids: s.steps.map((st) => st.pieceId), porPieza };
}
