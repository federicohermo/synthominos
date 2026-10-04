import { z } from 'zod';
import { defineTool, json } from './types.ts';
import { renderAscii, renderCellNumbers, sizeOf } from '../render.ts';
import { PIECE_KEYS } from '../pieces.ts';
import { rotateN, reflect } from '../../../src/pieces/domain/transform.ts';
import { notesForRotation, midiName, degreeByCellIndex, playOrderByCellIndex } from '../../../src/musical-model/domain/music.ts';
import { SHAPES, ANCHOR_INDEX } from '../../../src/pieces/domain/pieces.constants.ts';
import { BASE_MAP, CHROMATIC, DEFAULT_OCTAVE, REGIMEN, DEFAULT_REGIMEN } from '../../../src/musical-model/domain/music.constants.ts';
import type { RegimenDeRotacion } from '../../../src/musical-model/domain/music.types.ts';

/**
 * Forma + sonido de una pieza en una orientacion.
 *
 * Es la tool de mayor ahorro: responder esto leyendo el codigo obliga a componer
 * cuatro puras a mano sobre cinco pares de coordenadas, y nadie avisa si la
 * simulacion mental salio mal.
 *
 * Todo lo que se calcula viene de `src/<capability>/domain/`. Lo unico propio es el ASCII.
 */

/**
 * Como se llama la formula que elige cada rotacion EN EL REGIMEN `escala`.
 *
 * Es una ETIQUETA, no la regla: quien elige la formula es `notesForRotation` en
 * `musical-model/domain/music.ts`, y las notas de la respuesta salen de ahi. Si el mapeo
 * rotacion→formula cambia alla, este texto hay que actualizarlo.
 *
 * Es uno de los DOS supuestos del server sobre el dominio que pueden quedar
 * desincronizados sin que `tsc` diga nada; el otro es `ORIENTATIONS_PER_PIECE` en
 * `checkInvariants.ts`. Estan anotados los dos, y son los dos unicos: todo lo
 * demas se ejecuta en vez de describirse.
 *
 * El spec 017 lo cobro: con el regimen `orden` las CUATRO entradas son falsas —la
 * formula es siempre la pentatonica mayor y lo que la rotacion mueve es el arranque—,
 * y ningun gate lo habria atrapado. Por eso el array dejo de ser lo que la respuesta
 * lee: lo lee `scaleLabel`, que primero mira el regimen.
 */
const SCALE_LABEL = [
  'pentatónica mayor (rotación 0°)',
  'pentatónica menor (rotación 90°)',
  'pentatónica menor con blue note (rotación 180°)',
  'pentatónica mayor transpuesta +7 (rotación 270°)',
];

/**
 * Que dice la respuesta en `scale`, que depende del regimen y no solo de la rotacion.
 *
 * Reportar el regimen y seguir diciendo «pentatónica menor (rotación 90°)» bajo `orden`
 * es peor que no reportarlo: la respuesta se contradiria a si misma, y las notas que
 * trae al lado serian las correctas.
 */
function scaleLabel(regimen: RegimenDeRotacion, rotation: number): string {
  if (regimen === REGIMEN.escala) return SCALE_LABEL[rotation];
  return rotation === 0
    ? 'pentatónica mayor, sin correr (rotación 0°)'
    : `pentatónica mayor corrida ${rotation} ${rotation === 1 ? 'posición' : 'posiciones'} (rotación ${rotation * 90}°)`;
}

const inputSchema = z.object({
  piece: z.enum(PIECE_KEYS)
    .describe('Letra de la pieza. Describe la FORMA, no el sonido: la pieza F suena en C.'),
  rotation: z.number().int().min(0).max(3).default(0)
    .describe('Cuartos de vuelta horarios: 0=0°, 1=90°, 2=180°, 3=270°. Qué hace lo decide `regimen`.'),
  mirror: z.boolean().default(false)
    .describe('Reflexión. Invierte el orden de las notas (retrógrado) y a veces no cambia la forma.'),
  octave: z.number().int().min(0).max(8).default(DEFAULT_OCTAVE)
    .describe(`Octava en la que se construye el arpegio. La app usa ${DEFAULT_OCTAVE}.`),
  regimen: z.enum([REGIMEN.escala, REGIMEN.orden]).default(DEFAULT_REGIMEN)
    .describe(
      'Qué cambia la rotación (spec 017). `escala`: elige entre cuatro fórmulas, o sea que rotar ' +
      'cambia QUÉ NOTAS suena la pieza. `orden`: pentatónica mayor siempre, corrida `rotation` ' +
      `posiciones, o sea que rotar cambia POR DÓNDE ARRANCA el arpegio. El default es ${DEFAULT_REGIMEN}, ` +
      'que es el de la app. A rotación 0 los dos dan lo mismo; en las otras 36 de las 48 ' +
      'combinaciones dan cosas distintas.',
    ),
});

export const describePiece = defineTool({
  name: 'describe_piece',
  title: 'Describir una pieza',
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    'Qué forma tiene y qué suena una pieza en una orientación dada. Usar ANTES de simular a mano ' +
    'una rotación o un arpegio: devuelve las celdas ya transformadas (en orden de array), el ' +
    'render ASCII con la celda de agarre marcada, la tónica, la fórmula de escala y las cinco ' +
    'notas MIDI con el retrógrado ya aplicado. Devuelve además `cellMap`: qué grado del arpegio y ' +
    'qué nota le toca a CADA celda, en el mismo orden que `cells`. Ejecuta las funciones reales de ' +
    'src/<capability>/domain/, así que responde lo que suena hoy, no lo que decía la documentación.\n' +
    'Tres trampas medidas que conviene tener presentes: (1) la letra describe la FORMA, no el ' +
    'sonido — la pieza F suena con tónica C, y la nota F le toca a la pieza T; (2) la reflexión ' +
    'siempre invierte las notas, pero a veces no se ve: en I y X deja la forma idéntica en las ' +
    'cuatro rotaciones, y en T y U en las rotaciones 0 y 180°; (3) `cellMap` sale del arpegio ' +
    'ASCENDENTE, no de `notes` — el retrógrado es del ORDEN DE REPRODUCCIÓN, así que reflejar ' +
    'mueve las celdas de lugar pero no cambia qué nota le toca a cada una.\n' +
    'Desde el spec 017 la rotación hace UNA DE DOS cosas y la elige `regimen`: con `escala` cambia ' +
    'la fórmula (las notas), con `orden` corre el arpegio sobre una pentatónica mayor fija (el ' +
    'arranque). La respuesta trae el `regimen` que usó y su `scale` lo respeta — a rotación 0 los ' +
    'dos dan lo mismo, en las otras 36 de 48 combinaciones no.\n' +
    'Hay DOS dibujos: `ascii` marca la celda de agarre (`@`) y `asciiPlayOrder` pone el PASO de ' +
    'cada celda —su lugar en el orden de reproducción, que es el número que el tablero pinta en la ' +
    'esquina—, así que el `0` es siempre por donde el recorrido entra y el `4` por donde sale. Con ' +
    '`mirror` NO coincide con el grado: el retrógrado invierte el orden, así que el paso es ' +
    '`4 - grado`. `cellMap` trae los dos números por celda.',
  inputSchema,
  run: ({ piece, rotation, mirror, octave, regimen }) => {
    const rotated = rotateN(SHAPES[piece], rotation);
    const cells = mirror ? reflect(rotated) : rotated;
    const anchorIndex = ANCHOR_INDEX[piece];

    // El retrogrado se aplica igual que en la app: `notesForRotation` produce el
    // arpegio ascendente y la reflexion lo da vuelta despues.
    const ascending = notesForRotation(BASE_MAP[piece], octave, rotation, regimen);
    const notes = mirror ? [...ascending].reverse() : ascending;

    // La forma CANONICA, no `cells`: rotar corre el origen del angulo, asi que
    // recalcular el mapeo sobre la transformada daria otros grados. Se arrastra
    // por indice porque `rotateN` y `reflect` son `map`, igual que el ancla.
    const degrees = degreeByCellIndex(SHAPES[piece]);
    // El paso es el grado con el retrogrado aplicado, y NO se recalcula aca: sale de
    // la misma pura que alimenta a `gates` y al numero que se ve en el tablero.
    const playOrder = playOrderByCellIndex(SHAPES[piece], mirror);

    return json({
      piece, rotation, mirror, octave,
      // El regimen viaja EN LA RESPUESTA y no solo en la entrada: en 36 de las 48
      // combinaciones la misma pieza tiene dos arpegios, asi que una respuesta que
      // dice cinco notas sin decir bajo que regimen es ambigua las tres cuartas
      // partes de las veces.
      regimen,
      tonic: CHROMATIC[BASE_MAP[piece]],
      tonicPc: BASE_MAP[piece],
      scale: scaleLabel(regimen, rotation),
      // El indice k es la misma celda logica que en SHAPES: rotar, reflejar y
      // normalizar son `map`. De eso depende que el ancla salga por indice.
      cells,
      // Campo NUEVO al lado de `cells`, que no se toca: pisarlo cambiaria en
      // silencio el contrato de la tool. Indexa `ascending` y no `notes` porque
      // el retrogrado es del orden de reproduccion —eso ya lo dice `notes`—: la
      // nota de una celda es la del grado que le toca en el arpegio ascendente.
      // `degree` y `playOrder` son el MISMO numero solo sin reflexion. El `degree`
      // contesta que nota tiene la celda —por eso indexa `ascending`—; el `playOrder`
      // contesta cuando suena, y es el que hay que mirar para seguir a la cabeza
      // lectora o para contrastar contra lo que se ve en pantalla.
      cellMap: cells.map((c, k) => ({
        cell: c,
        degree: degrees[k],
        playOrder: playOrder[k],
        note: midiName(ascending[degrees[k]]),
      })),
      anchorIndex,
      anchor: cells[anchorIndex],
      size: sizeOf(cells),
      ascii: renderAscii(cells, anchorIndex),
      // El mismo dibujo con el PASO en cada celda: es donde se ve el recorrido que
      // el arpegio hace por la forma, siempre del `0` al `4`. Dibuja el paso y no el
      // grado porque es el numero que el tablero pinta, y dos numeraciones distintas
      // —una en pantalla y otra en la tool— es exactamente como se verifica mal.
      // `ascii` no se toca — dicen cosas distintas.
      asciiPlayOrder: renderCellNumbers(cells, playOrder),
      notes: notes.map(m => ({ midi: m, name: midiName(m) })),
      retrograde: mirror,
    });
  },
});
