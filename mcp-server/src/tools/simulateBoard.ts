import { z } from 'zod';
import { defineTool, json } from './types.ts';
import { PIECE_KEYS } from '../pieces.ts';
import { rotateN, reflect } from '../../../src/pieces/transform.ts';
import { cellsAt, isValid, occupantAt } from '../../../src/board-editing/placement.ts';
import { midiName } from '../../../src/musical-model/music.ts';
import { buildSequence, gates } from '../../../src/circuit/sequence.ts';
import { SHAPES, ANCHOR_INDEX, CELLS_PER_PIECE } from '../../../src/pieces/pieces.constants.ts';
import { GRID_DEFAULT, GRID_MIN, MAX_PIEZAS } from '../../../src/board-editing/board.constants.ts';
import { REGIMEN, DEFAULT_REGIMEN } from '../../../src/musical-model/music.constants.ts';
import type { Cell } from '../../../src/pieces/transform.types.ts';
import type { PlacedPiece, Dims } from '../../../src/board-editing/board.types.ts';
import { collectHits, barDuration, intervalDuration } from '../../../src/playback/scheduler.ts';
import { midiToHz } from '../../../src/playback/voice.ts';
import { LOOKAHEAD, TICK_MS, HIT } from '../../../src/playback/scheduler.constants.ts';
import { DEFAULT_BPM, CLOCK_START_DELAY } from '../../../src/playback/engine.constants.ts';
import type { Sequence, ClockState, Hit } from '../../../src/playback/scheduler.types.ts';

/**
 * Que suena un tablero, sin escucharlo.
 *
 * Recorre las mismas tres etapas que la app y **con las mismas funciones**:
 * colocar (`cellsAt`/`isValid`), armar la secuencia del recorrido (`buildSequence`)
 * y correr el scheduler real. Nada de eso esta reescrito aca: el circuito, los
 * saltos y los offsets salen del dominio, y el server solo compone y formatea.
 *
 * El bucle de ventanas es deliberado: una formula idealizada responderia lo que el
 * scheduler *deberia* hacer, y este bucle responde lo que **hace**, incluido el
 * corte de `scheduledUntil`.
 */

/** Redondeo para agrupar y para reportar: los onsets salen de aritmetica de punto flotante. */
const round4 = (t: number): number => Math.round(t * 1e4) / 1e4;

/** Por donde entra y por donde sale el recorrido de una pieza. */
interface Gates {
  entry: Cell;
  exit: Cell;
}

/** Una celda del camino que esta ocupada, con la nota que suena si se la pisa. */
interface Cruce {
  cell: Cell;
  note: string;
}

const placementSchema = z.object({
  piece: z.enum(PIECE_KEYS),
  rotation: z.number().int().min(0).max(3).default(0),
  mirror: z.boolean().default(false),
  // Una pieza muteada ocupa su lugar y su tiempo en el circuito pero no suena sus
  // notas: donde iba su arpegio van cinco clicks (spec 014). Se acepta aca para que la
  // tool pueda contestar "que cambia si muteo esta" sin que nadie lo derive a mano, y
  // el default es `false` porque es el tablero de siempre.
  muted: z.boolean().default(false),
  at: z.tuple([z.number().int(), z.number().int()])
    .describe(`Celda [x, y] donde cae la CELDA DE AGARRE, no la esquina. El tablero mide ${GRID_DEFAULT.w}x${GRID_DEFAULT.h} salvo que se pase \`dims\`, y la y crece hacia abajo.`),
});

const inputSchema = z.object({
  pieces: z.array(placementSchema).min(1).max(MAX_PIEZAS)
    .describe('Las piezas, en el orden en que se colocarían: cada una choca con las anteriores válidas.'),
  // El tablero no es 10x6 fijo desde el spec 031: en la app lo decide el viewport, y acá
  // hay que poder preguntar por el mismo tablero que se está mirando. El default es el de
  // siempre, así que una consulta que no pase `dims` contesta exactamente lo mismo.
  //
  // El tope de piezas NO sale del área, y por eso `pieces` usa `MAX_PIEZAS` en vez de
  // `GRID_W * GRID_H / CELLS_PER_PIECE`: sobre el tablero de 10x6 los dos números
  // coinciden —60 ÷ 5— y sobre cualquier otro no, porque el que manda es el del circuito,
  // que es exponencial en la cantidad de piezas.
  dims: z.object({
    w: z.number().int().min(GRID_MIN.w).max(64),
    h: z.number().int().min(GRID_MIN.h).max(64),
  }).default(GRID_DEFAULT)
    .describe(`Cuánto mide el tablero, en celdas. Por defecto ${GRID_DEFAULT.w}x${GRID_DEFAULT.h}, que es el de siempre.`),
  bpm: z.number().min(40).max(240).default(DEFAULT_BPM),
  // El tope no es el de `bars` dividido a ojo. Con compases el costo del bucle de
  // ventanas dependia del tempo y del tablero a la vez; con ciclos el peor caso
  // esta acotado por el tablero: 10 piezas dan 8,98 s de ciclo a 110 bpm, o sea
  // ~36 s de simulacion con 4.
  cycles: z.number().int().min(1).max(4).default(2)
    .describe('Cuántas vueltas del circuito simular. El ciclo lo fija el tablero, no el tempo.'),
  regimen: z.enum([REGIMEN.escala, REGIMEN.orden]).default(DEFAULT_REGIMEN)
    .describe(
      'Qué cambia la rotación (spec 017). `escala`: la rotación elige entre cuatro fórmulas, o sea ' +
      'QUÉ NOTAS suena cada pieza. `orden`: pentatónica mayor siempre, corrida `rotation` posiciones, ' +
      'o sea POR DÓNDE ARRANCA su arpegio. Gobierna las notas de cada paso y la altura de los cruces, ' +
      'y no toca el circuito ni las puertas ni los offsets: cambiarlo no reordena el tablero (D1).',
    ),
});

/**
 * Nombre de nota de una frecuencia, o la frecuencia redondeada si no se la conoce.
 *
 * El mapa se arma con las notas de los `Step`, y hoy TODO `Hit` con altura sale de
 * ahi —incluido el cruce del spec 011, cuya altura es la de una celda de una pieza
 * que si tiene su paso—, asi que la segunda mitad no se alcanza desde la tool. Vive
 * como funcion propia y no como un `??` colgado del `map` por eso mismo: la regla de
 * que hacer con un `hz` desconocido es una decision —decirlo en Hz antes que mostrar
 * `undefined`— y una decision que nadie puede ejercer es una que nadie puede revisar.
 * Aca se la nombra, se la documenta y su test la ejerce.
 *
 * Que la busqueda acierte depende de la igualdad EXACTA de floats, y eso vale porque
 * la clave se calcula con la misma `midiToHz` sobre la misma entrada que uso el
 * scheduler. Si algun dia deja de valer, el sintoma es este fallback y no un `NaN`.
 */
export function nombreDeHz(nameByHz: ReadonlyMap<number, string>, hz: number): string {
  return nameByHz.get(hz) ?? `${Math.round(hz)}Hz`;
}

/** Una colocacion ya resuelta: lo que la respuesta reporta de cada jugada. */
interface Resolved {
  id: string;
  cells: Cell[];
  valid: boolean;
  /** No-null exactamente cuando la jugada entro: una pieza que no esta no tiene puertas. */
  gates: Gates | null;
  reason: string | null;
}

/**
 * Las dos puertas de una pieza, con los nombres de la respuesta.
 *
 * Solo renombra: quien decide cual celda es cual es `gates` del dominio, **la misma**
 * que usa `buildSequence` para armar el circuito. La primera version de esta tool la
 * reimplementaba porque no estaba exportada, y eran tres lineas que podian discrepar
 * del recorrido que la tool dice explicar; exportarla fue el cambio de `src/` que
 * la regla del repo pide en vez de la copia.
 */
function gatesOf(p: PlacedPiece): Gates {
  const { entrada, salida } = gates(p);
  return { entry: entrada, exit: salida };
}

/**
 * Los cruces de un tramo: las celdas que el camino pisa y que estan ocupadas, con la
 * nota que suena al pisarlas (T046).
 *
 * **Lee `Click.note` y NO vuelve a derivar la nota desde la celda**, aunque el dominio
 * exponga las dos puras que harian falta (`occupantAt` y `noteAtCell`). Es D3 del spec
 * 011 aplicado a esta capa: el `Click` ya trae la altura que `buildSequence` le puso, y
 * derivarla de nuevo aca serian dos lugares calculando lo mismo sin nada que los obligue
 * a coincidir — justo lo que la tool existe para descartar, porque su unico valor es
 * reportar lo que la app va a sonar y no una segunda opinion sobre eso.
 *
 * Vacio cuando el tramo no pisa ninguna pieza, nunca ausente: la respuesta siempre trae
 * el campo para que un tablero sin cruces no se distinga de uno sin reportar.
 */
function crucesDe(tramo: readonly { cell: Cell; note?: number }[]): Cruce[] {
  return tramo.flatMap((c): Cruce[] => c.note === undefined ? [] : [{ cell: c.cell, note: midiName(c.note) }]);
}

/**
 * Etapa 1 — colocacion, con las reglas del tablero de `board-editing/placement.ts`.
 *
 * El motivo del rechazo sale de las mismas funciones y no de una copia de sus
 * condiciones: `isValid(cells, [])` responde solo por los bordes —el tablero
 * vacio no puede chocar con nada— y `occupantAt` dice contra QUE pieza se choco.
 *
 * Devuelve tambien las `PlacedPiece` validas porque son la entrada exacta de
 * `buildSequence`: rearmarlas afuera a partir de `Resolved` seria construir dos
 * veces lo mismo.
 */
function resolve(entries: z.output<typeof inputSchema>['pieces'], dims: Dims): { resolved: Resolved[]; placed: PlacedPiece[] } {
  const placed: PlacedPiece[] = [];
  const resolved: Resolved[] = [];

  entries.forEach((e, i) => {
    const rotated = rotateN(SHAPES[e.piece], e.rotation);
    const shape = e.mirror ? reflect(rotated) : rotated;
    const cells = cellsAt(shape, ANCHOR_INDEX[e.piece], e.at[0], e.at[1]);

    const id = String(i + 1);
    const valid = isValid(cells, placed, dims);
    let reason: string | null = null;
    if (!valid) {
      if (!isValid(cells, [], dims)) {
        reason = 'fuera-del-tablero';
      } else {
        const choque = cells.map(([x, y]) => occupantAt(placed, x, y)).find(p => p !== null);
        reason = `choque-con-${choque?.id}`;
      }
    }

    // Solo lo valido pasa a ser obstaculo, igual que en la app: una jugada
    // rechazada no deja nada en el tablero.
    let gates: Gates | null = null;
    if (valid) {
      // Sin `notes`: el arpegio no se guarda en la pieza, lo deriva `buildSequence` con
      // la misma `arpeggioFor` que usa la app. Componerlo aca a mano seria otra copia de
      // esa derivacion, y la derivacion tiene un solo dueño.
      const p: PlacedPiece = { id, piece: e.piece, rotation: e.rotation, mirror: e.mirror, cells, muted: e.muted };
      placed.push(p);
      gates = gatesOf(p);
    }
    resolved.push({ id, cells, valid, gates, reason });
  });

  return { resolved, placed };
}

/**
 * Etapa 3 — la linea de tiempo, corriendo el scheduler en ventanas de `TICK_MS`.
 *
 * Arranca el reloj como `startClock`: el origen queda `CLOCK_START_DELAY`
 * adelante y `scheduledUntil` estrictamente antes, que es lo que evita perder el
 * onset del offset 0. Los tiempos se reportan en la misma escala, con el instante
 * 0 en el arranque del reloj.
 *
 * **Una sola secuencia y un solo origen**, asi que el corte es uno solo y no hay
 * que agrupar por onset como cuando cada job traia su propia fase dentro del
 * compas: el limite es el fin del ultimo ciclo pedido.
 *
 * El corte `at < end` no necesita tolerancia. Nada cruza el borde del ciclo: los
 * pasos ocupan `o..o+4`, sus clicks siguen hasta `o+4+(d-1)` y el paso siguiente
 * arranca en `o+4+d`, asi que el ultimo evento de un ciclo cae en el intervalo
 * `length - 1` y sobra un intervalo entero de margen contra el error de punto
 * flotante.
 *
 * El `sort` no es cosmetico: `collectHits` emite primero todos los pasos y despues
 * todos los clicks, cada uno recorriendo la ventana entera, asi que sale ordenado
 * por paso y no por tiempo.
 */
function timeline(sequence: Sequence, bpm: number, cycles: number): Hit[] {
  const origin = CLOCK_START_DELAY;
  const end = origin + cycles * sequence.length * intervalDuration(bpm);

  const state: ClockState = { origin, scheduledUntil: 0 };
  const hits: Hit[] = [];

  for (let t = 0; t < end; t += TICK_MS / 1000) {
    for (const hit of collectHits(t, LOOKAHEAD, bpm, sequence, state)) {
      if (hit.at < end) hits.push(hit);
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

export const simulateBoard = defineTool({
  name: 'simulate_board',
  title: 'Simular el tablero',
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    'Qué suena un tablero dado, sin escucharlo. Usar en lugar de leer el scheduler y recorrer el ' +
    'lookahead a mano: valida cada colocación con las mismas funciones que la app, arma la secuencia ' +
    'con `buildSequence` y corre el scheduler real en ventanas de 25 ms.\n' +
    'El tablero es un RECORRIDO y no un compás: un circuito cerrado visita las piezas —en el orden ' +
    'del camino más BARATO entre sus puertas, NO en el de colocación— y cada celda que cruza al ir de ' +
    'una a la siguiente suena como un click. La respuesta trae ese orden, cada salto con las celdas ' +
    'que atraviesa, el ciclo en intervalos y en segundos, y la línea de tiempo con notas y clicks ' +
    'distinguidos: el camino en la respuesta es lo que permite verificar el recorrido sin oírlo.\n' +
    'Dos trampas medidas: mover una pieza puede reordenar la música entera, porque cambia el ' +
    'circuito; y el camino PREFIERE rodear lo que haya en el medio pero no siempre puede — cruzar una ' +
    'celda ocupada cuesta más (pisar la pieza), y cuando ese cruce es inevitable el click cae sobre esa ' +
    'celda con la MISMA nota que suena al pisarla. Cada salto trae esos cruces aparte, con su celda y ' +
    'su nota, para comparar el costo de pisar sin escucharlo. En el teselado de 12 piezas —sin ninguna ' +
    'celda vacía, el peso no puede evitar nada— los 14 clicks caen todos sobre celdas con pieza.\n' +
    'Desde el spec 017 la respuesta trae también el `regimen`: la rotación cambia las notas ' +
    '(`escala`) o el arranque del arpegio (`orden`), y sin decirlo la línea de tiempo es ambigua en ' +
    '36 de las 48 combinaciones. El circuito no cambia con el régimen — solo las alturas.',
  inputSchema,
  run: ({ pieces, bpm, cycles, regimen, dims }) => {
    const { resolved, placed } = resolve(pieces, dims);

    // Etapa 2 — la secuencia del recorrido, la misma que arma la app. Una pieza
    // invalida no esta en `placed` y por lo tanto no entra al circuito.
    const seq = buildSequence(placed, regimen, dims);
    // El circuito y no los pasos: desde el spec 014 una pieza MUTEADA visita su lugar
    // sin emitir `Step`, asi que contar pasos reportaria un recorrido al que le faltan
    // nodos y fusionaria dos tramos en uno.
    const n = seq.order.length;

    // La proyeccion a la `Sequence` del MOTOR, que no lleva `pieceId` ni `cell`:
    // `src/<capability>/audio/**` tiene prohibido importar `Cell` (AC12), asi que las dos formas
    // son distintas a proposito. `App.tsx` hace esta misma proyeccion por su cuenta
    // y la duplicacion es aceptada: esta tool existe para reproducir lo que hace la
    // app CON LAS MISMAS funciones, y sacarla a un helper compartido romperia
    // justamente esa propiedad.
    const engine: Sequence = {
      steps: seq.steps.map(({ offset, notes }) => ({ offset, notes })),
      // `note` viaja y `cell` no: es la misma proyeccion que hace `App.tsx`. Dejarla
      // caer typechequea igual —`note` es opcional— y la tool reportaria los cruces
      // como clicks mudos, o sea distinto de lo que suena la app. Es justo la
      // propiedad que esta tool existe para sostener.
      //
      // El ternario y no `({ offset, note })`: con la forma corta el click mudo sale
      // con la clave `note` PRESENTE y en `undefined`, que es el estado intermedio que
      // el docblock de `Click` rechaza — ausencia significa "celda vacia", y un campo
      // presente valiendo undefined es un tercer estado esperando a que alguien lo lea
      // con `in` o con `Object.keys`.
      clicks: seq.clicks.map((c) => c.note === undefined ? { offset: c.offset } : { offset: c.offset, note: c.note }),
      length: seq.length,
    };

    // Nombre de nota por frecuencia, construido con la MISMA `midiToHz` que uso
    // el scheduler: la igualdad exacta de floats vale porque es la misma funcion
    // sobre la misma entrada. Es lo que evita invertir la formula a mano.
    const nameByHz = new Map<number, string>();
    for (const s of seq.steps) for (const m of s.notes) nameByHz.set(midiToHz(m), midiName(m));

    // Objeto y no `Map`: `Map.get` devuelve `| undefined` aunque la clave este
    // siempre, y taparlo pediria un `!` o un `??` que mentiria sobre el caso.
    const puertas: Record<string, Gates> = {};
    for (const r of resolved) if (r.gates !== null) puertas[r.id] = r.gates;

    // Los saltos, leidos de la MISMA secuencia que va a sonar. `distance` sale de
    // contar los clicks del tramo y no de volver a medir la distancia: es lo que
    // hace imposible que el camino reportado y el instante de la nota siguiente
    // discrepen (D8). El tramo de la ultima pieza a la primera se calcula con la
    // misma regla que los demas —su borde es `seq.length`, que es el offset 0 del
    // ciclo siguiente—, y de eso depende que el empalme no tenga marca (AC4).
    // Con UNA pieza no hay saltos, y por eso la guarda es explicita: el recorrido
    // existe ENTRE piezas y el dominio ya lo dice devolviendo `clicks: []`. Sin ella
    // el `map` sintetiza un tramo de la pieza a si misma y le reporta
    // `distance: path.length + 1`, que sin clicks da 1 SIEMPRE — y ese 1 contradice a
    // las dos celdas que la respuesta imprime al lado: medido, con la `Z` sola
    // `routeBetween(exit, entry, []).steps` es 3 y con la `F` es 2 (tablero vacio,
    // que es lo que `cellDistance` media antes de que el spec 011 la reemplazara:
    // `.steps` es el equivalente de hoy, no `.cost`). Que el ciclo igual dure lo
    // dice `cycle`, que son los 5 intervalos del arpegio y no un salto.
    const hops = n === 1 ? [] : seq.order.map((step, t) => {
      const ultima = step.offset + CELLS_PER_PIECE - 1;
      const siguiente = t + 1 < n ? seq.order[t + 1].offset : seq.length;
      const to = seq.order[(t + 1) % n].pieceId;
      // Los clicks del tramo enteros y no solo sus celdas: `path` y `crossed` son dos
      // lecturas de ESTA lista, asi que no pueden discrepar (D3).
      const tramo = seq.clicks.filter(c => c.offset > ultima && c.offset < siguiente);
      return {
        from: step.pieceId,
        to,
        exit: puertas[step.pieceId].exit,
        entry: puertas[to].entry,
        distance: tramo.length + 1,
        path: tramo.map(c => c.cell),
        // Los cruces de ESTE tramo: subconjunto de `path` que cae sobre una pieza,
        // cada uno con la nota que suena si se lo pisa (T046).
        crossed: crucesDe(tramo),
      };
    });

    const hits = timeline(engine, bpm, cycles);
    const instantes = new Set(hits.map(h => round4(h.at)));

    return json({
      bpm,
      // El regimen viaja EN LA RESPUESTA y no solo en la entrada: en 36 de las 48
      // combinaciones de pieza x rotacion la misma pieza tiene dos arpegios, asi que
      // una `timeline` con notas y sin regimen es ambigua. El circuito NO depende de
      // el —los saltos, las puertas y los offsets salen iguales en los dos—: lo unico
      // que mueve son las alturas.
      regimen,
      barSeconds: round4(barDuration(bpm)),
      // La separacion entre eventos consecutivos del recorrido, que desde el spec
      // 008 sale del compas: sin este numero la `timeline` no se puede leer sin
      // recalcular `bar / 16` a mano.
      intervalSeconds: round4(intervalDuration(bpm)),
      cycles,
      // El ciclo en las dos unidades: el tablero lo fija en INTERVALOS y el tempo
      // solo lo estira. Dos tableros distintos dan ciclos distintos al mismo bpm,
      // que es la diferencia con el compas fijo del modelo anterior.
      cycle: { intervals: seq.length, seconds: round4(seq.length * intervalDuration(bpm)) },
      placements: resolved.map((r, i) => ({
        id: r.id,
        piece: pieces[i].piece,
        rotation: pieces[i].rotation,
        mirror: pieces[i].mirror,
        at: pieces[i].at,
        muted: pieces[i].muted,
        cells: r.cells,
        valid: r.valid,
        // Las puertas reemplazan a la `phase` del spec 004: la columna del ancla
        // dejo de decir nada sobre cuando suena la pieza, y lo que hoy determina
        // como entra al recorrido es por que celda lo recibe y por cual lo deja.
        ...(r.gates !== null ? { gates: r.gates } : { reason: r.reason }),
      })),
      // El orden del CIRCUITO, que incluye a las piezas muteadas: siguen siendo nodos
      // del recorrido aunque no suenen (spec 014).
      route: { order: seq.order.map(o => o.pieceId), hops },
      // `coincident` se fue. Media cuantos onsets caian juntos, que era la pregunta
      // del modelo viejo: dos piezas en la misma columna se apilaban. En el
      // recorrido dos onsets no pueden coincidir POR CONSTRUCCION —las notas de una
      // pieza ocupan `o..o+4`, sus clicks `o+5..o+4+(d-1)` y la nota siguiente
      // `o+4+d`, verificado sobre 3.000 tableros aleatorios sin una sola falla—,
      // asi que `maxPerInstant` daba 1 siempre y un campo que devuelve siempre el
      // mismo numero no informa nada.
      //
      // Lo que queda de el es `distinctInstants`, que ahora es una ASERCION y no un
      // descriptor: tiene que ser igual a `total`, y de hecho las dos tienen que dar
      // `cycles * cycle.intervals`, porque el recorrido ocupa todos sus intervalos
      // sin huecos. Si alguna vez difieren, o se duplico un onset o dos eventos
      // colisionaron.
      onsets: {
        notes: hits.filter(h => h.kind === HIT.note).length,
        clicks: hits.filter(h => h.kind === HIT.click).length,
        crosses: hits.filter(h => h.kind === HIT.cross).length,
        total: hits.length,
        distinctInstants: instantes.size,
      },
      // Plana y no agrupada por instante: al no haber coincidencias, agrupar
      // envolvia cada evento en un array de uno. `kind` es el discriminante del
      // `Hit` del motor tal cual sale, no una etiqueta traducida aca.
      //
      // Las DOS ramas con altura llevan nota, y el discriminante se lee del `Hit` y no
      // de si `hz` esta presente: el cruce del spec 011 tiene altura igual que la nota
      // —lo que lo distingue es que dura y pega menos, no que suene distinto— y el
      // unico mudo es `HIT.click`. Sus celdas estan en `route.hops`.
      timeline: hits.map(h => h.kind === HIT.click
        ? { at: round4(h.at), kind: h.kind }
        : { at: round4(h.at), kind: h.kind, note: nombreDeHz(nameByHz, h.hz) }),
    });
  },
});
