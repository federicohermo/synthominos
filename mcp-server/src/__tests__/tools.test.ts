import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tools } from '../tools/index.ts';
import { describePiece } from '../tools/describePiece.ts';
import { checkInvariants, pieceOf } from '../tools/checkInvariants.ts';
import { simulateBoard, nombreDeHz } from '../tools/simulateBoard.ts';
import { findSymbol } from '../tools/findSymbol.ts';
import { PIECE_KEYS } from '../pieces.ts';
import { routeBetween } from '../../../src/board-editing/domain/board.ts';
import { SHAPES, CELLS_PER_PIECE } from '../../../src/pieces/domain/pieces.constants.ts';
import { NOTES_PER_PIECE, REGIMEN } from '../../../src/musical-model/domain/music.constants.ts';
import type { Cell } from '../../../src/pieces/domain/transform.types.ts';
import type { PlacedPiece } from '../../../src/board-editing/domain/board.types.ts';
import type { ToolDef } from '../tools/types.ts';
import { GRID_DEFAULT } from '../../../src/board-editing/domain/board.constants.ts';

/**
 * Estos tests miran el FORMATO de las respuestas, que es lo unico que el server
 * aporta.
 *
 * Las reglas del dominio ya las cubren los tests de `src/domain/`, y duplicarlas aca
 * seria duplicar tambien el criterio.
 *
 * La excepcion son los numeros del AC4 y el AC7: no verifican el dominio sino
 * que el server lo este componiendo en el orden correcto.
 */

/** Corre una tool y devuelve su respuesta ya parseada. */
function call(tool: ToolDef, args: unknown): Record<string, unknown> {
  const r = tool.run(args);
  const first = r.content?.[0];
  assert.ok(first && first.type === 'text', 'la respuesta tiene que ser texto');
  return JSON.parse(first.text) as Record<string, unknown>;
}

describe('el registro', () => {
  test('los nombres son unicos y en snake_case', () => {
    const nombres = tools.map(t => t.name);
    assert.equal(new Set(nombres).size, nombres.length);
    for (const n of nombres) assert.match(n, /^[a-z][a-z_]*$/);
  });

  test('toda tool tiene descripcion y schema', () => {
    for (const t of tools) {
      assert.ok(t.description.length > 0, t.name);
      assert.ok(t.inputSchema, t.name);
    }
  });

  test('ninguna tool se olvida de declarar si escribe', () => {
    // La forma es «ninguna se olvido» y no «esta tool dice esto»: lo segundo
    // copia el codigo en el test y deja pasar a la tool numero siete, que es el
    // modo de falla real de un dato que `tsc` no puede sincronizar —los dos
    // campos son opcionales en `ToolDef` a proposito.
    //
    // `openWorldHint` se exige en `false` y no solo «booleano»: que el dominio de
    // entidades sea CERRADO —doce piezas, un `src/`, un `specs/`— es la propiedad
    // que hace confiable a este server, y hasta aca vivia solo en prosa. Si algun
    // dia una tool tiene que abrirlo, que la discusion pase por esta linea.
    for (const t of tools) {
      assert.ok(t.annotations, t.name);
      assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
      assert.equal(t.annotations.openWorldHint, false, t.name);
      assert.ok(t.title && t.title.length > 0, t.name);
    }
  });

  test('ninguna escribe', () => {
    // El server ejecuta el dominio y lo lee: no tiene nada que escribir. La unica que
    // escribia era `spec_write`, y se fue con el registro de specs numerados.
    assert.deepEqual(tools.filter(t => t.annotations?.readOnlyHint !== true).map(t => t.name), []);
  });

  test('un argumento invalido no llega al handler', () => {
    // El SDK valida antes de llamar, y `defineTool` vuelve a parsear en el borde
    // generico: por las dos vias, una pieza inexistente falla en vez de responder
    // algo plausible.
    assert.throws(() => describePiece.run({ piece: 'Q' }));
    assert.throws(() => describePiece.run({ piece: 'F', rotation: 7 }));
    assert.throws(() => describePiece.run({}));
  });
});

describe('describe_piece', () => {
  test('Z rotada 270° y reflejada', () => {
    const r = call(describePiece, { piece: 'Z', rotation: 3, mirror: true });
    assert.deepEqual((r.notes as { name: string }[]).map(n => n.name), ['D#6', 'C#6', 'A#5', 'G#5', 'F#5']);
    assert.equal(r.anchorIndex, 2);
    assert.deepEqual(r.anchor, [1, 1]);
    assert.equal(r.ascii, '#..\n#@#\n..#');
    assert.equal(r.tonic, 'B');
    assert.equal(r.retrograde, true);
  });

  test('las 96 combinaciones dan 5 celdas y 5 notas, y ninguna falla', () => {
    for (const piece of PIECE_KEYS) {
      for (let rotation = 0; rotation < 4; rotation++) {
        for (const mirror of [false, true]) {
          const r = call(describePiece, { piece, rotation, mirror });
          const donde = `${piece} rot${rotation}${mirror ? ' mirror' : ''}`;
          assert.equal((r.cells as unknown[]).length, CELLS_PER_PIECE, donde);
          assert.equal((r.notes as unknown[]).length, NOTES_PER_PIECE, donde);
          assert.ok(r.ascii, donde);
        }
      }
    }
  });

  test('AC-MUS-017 — la reflexion SIEMPRE invierte las notas, en las 48 combinaciones', () => {
    for (const piece of PIECE_KEYS) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const derecho = call(describePiece, { piece, rotation });
        const espejo = call(describePiece, { piece, rotation, mirror: true });
        assert.deepEqual(
          (espejo.notes as { midi: number }[]).map(n => n.midi),
          (derecho.notes as { midi: number }[]).map(n => n.midi).reverse(),
          `${piece} rot${rotation}`,
        );
      }
    }
  });

  test('y a veces no se ve: donde el espejo deja la forma igual', () => {
    // Medido, y es la trampa que advierte la descripcion de la tool: el boton
    // "Reflexion" se oye y no se ve. La lista es exacta —I y X en las cuatro
    // rotaciones, T y U en 0 y 180°— y no las seis piezas que decia el research
    // del spec: en V y W el espejo SI cambia la forma, lo que no cambia es el
    // conjunto de formas alcanzables, porque cae sobre otra rotacion.
    const invisible: Record<string, number[]> = { I: [0, 1, 2, 3], X: [0, 1, 2, 3], T: [0, 2], U: [0, 2] };

    for (const piece of PIECE_KEYS) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const derecho = call(describePiece, { piece, rotation });
        const espejo = call(describePiece, { piece, rotation, mirror: true });
        const esperadoIgual = (invisible[piece] ?? []).includes(rotation);
        assert.equal(
          espejo.ascii === derecho.ascii, esperadoIgual,
          `${piece} rot${rotation}: el espejo ${esperadoIgual ? 'no deberia' : 'deberia'} cambiar la forma`,
        );
      }
    }
  });

  test('`cellMap` le pone grado, paso y nota a cada celda, sin tocar `cells`', () => {
    // Los dos casos del AC, releidos con el camino del spec 012: en la X la tonica cae
    // en un brazo y no en el centro —el centro tiene cuatro vecinos, y arrancar ahi
    // obligaria a tres saltos en vez de dos—, y la F es la unica pieza cuyo camino
    // coincide con el orden en que estan tipeadas sus celdas en `SHAPES`.
    const x = call(describePiece, { piece: 'X' });
    assert.deepEqual(x.cellMap, [
      { cell: [1, 0], degree: 4, playOrder: 4, note: 'F#5' },
      { cell: [0, 1], degree: 2, playOrder: 2, note: 'C#5' },
      { cell: [1, 1], degree: 3, playOrder: 3, note: 'E5' },
      { cell: [2, 1], degree: 0, playOrder: 0, note: 'A4' },
      { cell: [1, 2], degree: 1, playOrder: 1, note: 'B4' },
    ]);

    const f = call(describePiece, { piece: 'F' });
    assert.deepEqual(f.cellMap, [
      { cell: [0, 1], degree: 0, playOrder: 0, note: 'C4' },
      { cell: [1, 0], degree: 1, playOrder: 1, note: 'D4' },
      { cell: [1, 1], degree: 2, playOrder: 2, note: 'E4' },
      { cell: [1, 2], degree: 3, playOrder: 3, note: 'G4' },
      { cell: [2, 2], degree: 4, playOrder: 4, note: 'A4' },
    ]);

    // `cells` sigue siendo la lista de coordenadas de siempre: el campo se agrego
    // AL LADO, no encima. Es lo que el chequeo de longitud del AC5 no ve.
    assert.deepEqual(f.cells, [[0, 1], [1, 0], [1, 1], [1, 2], [2, 2]]);
  });

  test('`scale` cuenta el regimen, y en `orden` cuenta bien el singular', () => {
    // En `escala` la etiqueta sale de una tabla; en `orden` se arma, y ahi el texto
    // es lo unico que distingue una rotacion de otra —la formula es siempre la
    // pentatonica mayor—. Un "1 posiciones" en la respuesta de una tool que existe
    // para NO tener que derivar a mano es exactamente la clase de detalle que hace
    // dudar del resto.
    const scale = (rotation: number, regimen: 'escala' | 'orden') =>
      call(describePiece, { piece: 'F', rotation, regimen }).scale;

    assert.equal(scale(0, REGIMEN.orden), 'pentatónica mayor, sin correr (rotación 0°)');
    assert.equal(scale(1, REGIMEN.orden), 'pentatónica mayor corrida 1 posición (rotación 90°)');
    assert.equal(scale(2, REGIMEN.orden), 'pentatónica mayor corrida 2 posiciones (rotación 180°)');
    assert.equal(scale(3, REGIMEN.orden), 'pentatónica mayor corrida 3 posiciones (rotación 270°)');

    // Y el otro regimen no pasa por ahi: a rotacion 0 los dos suenan igual y la
    // etiqueta igual tiene que decir cual se uso.
    assert.notEqual(scale(0, REGIMEN.escala), scale(0, REGIMEN.orden));
  });

  test('el paso es el grado sin reflexion y su inverso con ella, en las 96', () => {
    // La unica diferencia entre las dos numeraciones, y la razon de que existan las
    // dos: el grado dice QUE NOTA tiene la celda —la reflexion no lo mueve, eso es
    // AC12— y el paso dice CUANDO suena, que es justo lo que la reflexion invierte.
    for (const piece of PIECE_KEYS) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const pasos = (r: Record<string, unknown>) =>
          (r.cellMap as { degree: number; playOrder: number }[]);
        for (const e of pasos(call(describePiece, { piece, rotation }))) {
          assert.equal(e.playOrder, e.degree, `${piece} rot${rotation}`);
        }
        for (const e of pasos(call(describePiece, { piece, rotation, mirror: true }))) {
          assert.equal(e.playOrder, 4 - e.degree, `${piece} rot${rotation} mirror`);
        }
      }
    }
  });

  test('la reflexion invierte `notes` y NO invierte `cellMap`', () => {
    // El retrogrado es del ORDEN DE REPRODUCCION. La nota de una celda sale del
    // arpegio ascendente, asi que reflejar mueve la celda de lugar en el tablero
    // pero le deja el mismo grado. Indexar `notes` en vez de `ascending` daria
    // vuelta el mapeo justo en las 48 combinaciones con espejo.
    for (const piece of PIECE_KEYS) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const derecho = call(describePiece, { piece, rotation });
        const espejo = call(describePiece, { piece, rotation, mirror: true });
        const notaPorGrado = (r: Record<string, unknown>) =>
          (r.cellMap as { degree: number; note: string }[]).map(e => `${e.degree}:${e.note}`);
        assert.deepEqual(notaPorGrado(espejo), notaPorGrado(derecho), `${piece} rot${rotation}`);
      }
    }
  });

  test('la octava corre el arpegio entero doce semitonos', () => {
    const a = call(describePiece, { piece: 'F', octave: 4 });
    const b = call(describePiece, { piece: 'F', octave: 5 });
    assert.deepEqual(
      (b.notes as { midi: number }[]).map(n => n.midi),
      (a.notes as { midi: number }[]).map(n => n.midi + 12),
    );
  });

  test('los dos regimenes dan respuestas distintas y cada una dice cual es', () => {
    // Sin el `regimen` en la respuesta, la tool seria ambigua en 36 de las 48
    // combinaciones: dos preguntas iguales con dos respuestas correctas y ninguna
    // forma de saber cual se contesto.
    const escala = call(describePiece, { piece: 'F', rotation: 1, regimen: 'escala' });
    const orden = call(describePiece, { piece: 'F', rotation: 1, regimen: 'orden' });

    assert.equal(escala.regimen, 'escala');
    assert.equal(orden.regimen, 'orden');
    assert.notDeepEqual(
      (orden.notes as { midi: number }[]).map(n => n.midi),
      (escala.notes as { midi: number }[]).map(n => n.midi),
    );

    // Y `scale` respeta el regimen: bajo `orden` decir «pentatónica menor (rotación
    // 90°)» seria peor que no reportar nada, porque las notas de al lado no son las de
    // una menor. Es el supuesto hardcodeado que ningun gate atrapa (`SCALE_LABEL`).
    assert.match(String(escala.scale), /menor/);
    assert.doesNotMatch(String(orden.scale), /menor/);
    assert.match(String(orden.scale), /corrida 1 posición/);

    // `cellMap` sale del mismo arpegio que `notes`, asi que tambien se mueve.
    const notaDe = (r: Record<string, unknown>) => (r.cellMap as { note: string }[]).map(c => c.note);
    assert.notDeepEqual(notaDe(orden), notaDe(escala));
  });

  test('a rotacion 0 los dos regimenes dan lo mismo', () => {
    // La propiedad que hace AUDITABLE la comparacion, verificada tambien del lado de
    // la tool: si divergieran acá, el server estaria componiendo otra cosa.
    for (const piece of PIECE_KEYS) {
      const escala = call(describePiece, { piece, rotation: 0, regimen: 'escala' });
      const orden = call(describePiece, { piece, rotation: 0, regimen: 'orden' });
      assert.deepEqual(orden.notes, escala.notes, piece);
    }
  });

  test('sin `regimen` contesta `escala`, que es el de la app', () => {
    const porOmision = call(describePiece, { piece: 'F', rotation: 2 });
    assert.equal(porOmision.regimen, 'escala');
    assert.deepEqual(porOmision.notes, call(describePiece, { piece: 'F', rotation: 2, regimen: 'escala' }).notes);
  });
});

describe('check_invariants', () => {
  test('los siete chequeos, por separado y en verde', () => {
    const r = call(checkInvariants, {});
    assert.equal(r.ok, true);
    const checks = r.checks as { name: string; ok: boolean; failures: string[] }[];
    // Seis desde el spec 036 y SIETE desde el 039, que agrego `letras`. La tool los
    // expone sin listarlos —itera `checkAll()`— asi que este numero es lo unico del
    // server que hay que mover cuando el dominio suma un chequeo.
    assert.equal(checks.length, 7);
    for (const c of checks) {
      assert.equal(c.ok, true, `${c.name}: ${c.failures.join(' · ')}`);
      assert.deepEqual(c.failures, []);
    }
    // El espacio del modelo, que no es lo que recorre cada chequeo: `formas` mira
    // las 12 canonicas y `BASE_MAP` el conjunto una vez.
    assert.deepEqual(r.modelSpace, { pieces: 12, orientationsPerPiece: 8, orientations: 96 });
  });

  test('el filtro por pieza reconoce el prefijo del mensaje y deja pasar lo global', () => {
    // Es la unica pieza del server acoplada al FORMATO de los mensajes de
    // invariants.ts, y esta escrita para degradar mostrando de mas.
    assert.equal(pieceOf('Z rot3 mirror: celda 2 es (1,1)'), 'Z');
    assert.equal(pieceOf('F: tiene 4 celdas y deberia tener 5'), 'F');
    assert.equal(pieceOf('dos piezas comparten tonica'), null);
    assert.equal(pieceOf('Q: pieza inexistente'), null);
  });

  test('con un fallo real, el filtro acota los mensajes y no el veredicto', () => {
    // El docblock de `pieceOf` dice por que se exporta: «con los siete chequeos en
    // verde no hay ni un fallo real con el que ejercitar el filtro desde la tool».
    // Se fabrica uno rompiendo una forma, que es la unica manera de recorrer el
    // camino que la tool toma cuando algo esta mal — o sea, el unico que importa.
    const original = SHAPES.I;
    SHAPES.I = [[0, 0], [1, 0], [2, 0]];
    try {
      const formas = (r: Record<string, unknown>) =>
        (r.checks as { name: string; failures: string[]; failuresOtherPieces: number }[])
          .find(c => c.name === 'formas')!;

      const sinFiltro = call(checkInvariants, {});
      assert.equal(sinFiltro.ok, false);
      assert.equal(formas(sinFiltro).failures.length, 1);
      assert.match(formas(sinFiltro).failures[0], /^I: tiene 3 celdas/);
      assert.equal(formas(sinFiltro).failuresOtherPieces, 0);

      // Acotado a otra pieza: el mensaje desaparece de la lista PERO `ok` sigue
      // siendo el del modelo entero. Un "todo bien" acotado a la Z mientras la I
      // esta rota seria la respuesta enganosa que el comentario del fuente rechaza.
      const conFiltro = call(checkInvariants, { piece: 'Z' });
      assert.equal(conFiltro.ok, false);
      assert.equal(conFiltro.scope, 'Z');
      assert.deepEqual(formas(conFiltro).failures, []);
      // Y se dice cuantos se escondieron, que es lo que evita leer el [] como "nada".
      assert.equal(formas(conFiltro).failuresOtherPieces, 1);
    } finally {
      SHAPES.I = original;
    }
  });
});

describe('simulate_board', () => {
  /** Lo que estos tests miran de la respuesta. No es el contrato completo. */
  interface Hop {
    from: string; to: string; exit: Cell; entry: Cell; distance: number; path: Cell[];
    crossed: { cell: Cell; note: string }[];
  }
  interface Evento { at: number; kind: string; note?: string }

  const ruta = (r: Record<string, unknown>) => r.route as { order: string[]; hops: Hop[] };
  const linea = (r: Record<string, unknown>) => r.timeline as Evento[];
  const cuentas = (r: Record<string, unknown>) =>
    r.onsets as { notes: number; clicks: number; crosses: number; total: number; distinctInstants: number };
  const ciclo = (r: Record<string, unknown>) => r.cycle as { intervals: number; seconds: number };

  /**
   * Tolerancia al comparar espaciados, en segundos.
   *
   * Los `at` de la respuesta vienen redondeados a 4 decimales, asi que un delta puede
   * errarle hasta 2e-4; un evento de mas o de menos movería el delta un intervalo
   * entero (0,1364 s a 110 bpm), o sea tres ordenes de magnitud por encima de esto.
   */
  const EPS = 1e-3;

  /**
   * El tablero de la linea base del spec: tres piezas, saltos de 6, 4 y 8 celdas.
   *
   * Los tres numeros se movieron en el spec 036 —eran 6, 5 y 4— porque la `Z` de
   * (7,4) cambio de forma: era la `N` reflejada. Las piezas y sus posiciones son las
   * mismas; lo que cambio es por donde entra y sale la del medio.
   */
  const BASE = [
    { piece: 'F', at: [1, 1] },
    { piece: 'Z', at: [7, 4] },
    { piece: 'I', rotation: 1, at: [5, 2] },
  ];

  /**
   * Un tablero cuyo recorrido SI pisa piezas: rodear la `X` de (1,1) cuesta mas que
   * atravesarla.
   *
   * `BASE` no sirve para eso desde el spec 012 —sus tramos dejaron de rozar nada cuando
   * las puertas se movieron— y este es el mismo tablero que usan los tests del cruce en
   * `src/domain/` y en `src/components/`, a proposito: si el dia de mañana deja de
   * cruzar, los tres fallan juntos y no queda uno verde afirmando lo contrario.
   */
  const CON_CRUCE = [
    { piece: 'X', at: [1, 1] },
    { piece: 'F', at: [3, 2] },
    { piece: 'N', at: [2, 4] },
  ];

  test('el orden es el del circuito, no el de colocacion', () => {
    // Tres `I` verticales en las columnas 0, 9 y 5, colocadas en ESE orden: el
    // recorrido las visita de izquierda a derecha (1, 3, 2) y vuelve por la
    // costura. Es la propiedad entera del spec en un caso: mover una pieza
    // reordena la musica, y el orden de colocacion no se lee en ningun lado.
    const r = call(simulateBoard, {
      pieces: [
        { piece: 'I', rotation: 1, at: [0, 2] },
        { piece: 'I', rotation: 1, at: [9, 2] },
        { piece: 'I', rotation: 1, at: [5, 2] },
      ],
    });
    assert.deepEqual(ruta(r).order, ['1', '3', '2']);
    assert.equal(ciclo(r).intervals, 31);
    // 16 clicks por ciclo, por los dos ciclos, y NINGUNO cruza: `onsets` los parte en
    // MUDOS y CON ALTURA, y aca la segunda mitad queda en cero. Con el mapeo del 007
    // este mismo tablero pagaba un cruce por ciclo, porque la `I` entraba por su celda
    // del MEDIO y el recorrido tenia que meterse en la columna; desde el spec 012 la
    // `I` se recorre de punta a punta, asi que se entra y se sale por los extremos.
    assert.equal(cuentas(r).clicks, 32);
    assert.equal(cuentas(r).crosses, 0);
    assert.equal(cuentas(r).clicks + cuentas(r).crosses, 32);
    // El tramo de vuelta cruza la costura: `(9,5)` y `(0,0)` son adyacentes, asi que de
    // la columna 9 a la 0 se pasa por ahi y no dando la vuelta entera. Con las puertas
    // del 012 el atajo ademas sale GRATIS —la salida de una `I` es su punta de abajo y
    // la entrada de la otra su punta de arriba, o sea las dos bocas de la costura—, asi
    // que el tramo mide 2 y `crossed` queda vacio. Sin el atajo el tramo seria un rodeo
    // de 9 pasos por la columna 8 mas el peaje de pisar `(0,0)`, que es la magnitud que
    // esta asercion fija.
    assert.deepEqual(ruta(r).hops[2], {
      from: '2', to: '1', exit: [9, 4], entry: [0, 0], distance: 2,
      path: [[9, 5]],
      crossed: [],
    });
  });

  test('un salto de d celdas da d-1 clicks equiespaciados, cada uno con su celda', () => {
    const r = call(simulateBoard, { pieces: BASE });
    const hops = ruta(r).hops;
    assert.deepEqual(hops.map(h => h.distance), [6, 4, 8]);
    for (const h of hops) {
      assert.equal(h.path.length, h.distance - 1, `${h.from}->${h.to}`);
    }

    // El primer salto en la linea de tiempo: las 5 notas de la pieza 1, despues
    // sus 5 golpes, despues la primera nota de la pieza 2. Son consecutivos y estan
    // separados por un intervalo exacto — el mismo que separa a las notas del arpegio.
    const eventos = linea(r);
    const clicks = eventos.slice(CELLS_PER_PIECE, CELLS_PER_PIECE + hops[0].path.length);
    // El tercero es un CRUCE y no un click, y vale la pena decir por que: el tramo
    // vuelve a pisar la `F` en (1,0), o sea su propia pieza de salida. Estuvo mudo entre
    // el spec 012 y el 036 — el 012 movio la puerta de salida de la `F` y el tramo dejo
    // de rozarla— y volvio a pisar cuando el 036 arreglo la forma de la `Z`: cambio el
    // DESTINO, y con el todo el camino. La `F` no se movio.
    //
    // O sea que este tablero ejerce las dos clases de golpe, que es mas de lo que
    // ejercia antes. El equiespaciado —que es lo que el AC7 afirma— vale para los cinco
    // por igual: un cruce dura un intervalo, como un click.
    assert.deepEqual(clicks.map(e => e.kind), ['click', 'click', 'cross', 'click', 'click']);
    for (const c of clicks) {
      if (c.kind === 'cross') assert.equal(c.note, 'D4', 'el cruce suena la celda que pisa');
      else assert.equal(c.note, undefined, 'el click mudo no lleva altura');
    }
    assert.equal(eventos[CELLS_PER_PIECE + hops[0].path.length].kind, 'note');
    for (let i = 1; i < clicks.length; i++) {
      assert.ok(
        Math.abs(clicks[i].at - clicks[i - 1].at - (r.intervalSeconds as number)) < EPS,
        `clicks ${i - 1} y ${i}: ${clicks[i - 1].at} → ${clicks[i].at}`,
      );
    }
  });

  test('el empalme entre dos ciclos tiene el mismo espaciado que el interior', () => {
    // El ciclo no tiene marca de inicio: el salto de la ultima pieza a la primera
    // se calcula con la misma regla que los demas. Medido de la forma mas fuerte
    // posible: el recorrido ocupa TODOS sus intervalos sin huecos, asi que la linea
    // de tiempo entera es una grilla pareja y el empalme no se distingue de
    // cualquier otro par de eventos consecutivos.
    const r = call(simulateBoard, { pieces: BASE, cycles: 2 });
    const at = linea(r).map(e => e.at);
    assert.equal(at.length, 2 * ciclo(r).intervals);
    for (let i = 1; i < at.length; i++) {
      assert.ok(
        Math.abs(at[i] - at[i - 1] - (r.intervalSeconds as number)) < EPS,
        `eventos ${i - 1} y ${i}: ${at[i - 1]} → ${at[i]}`,
      );
    }
  });

  test('los saltos reportados son los del dominio, no una segunda cuenta', () => {
    // El `exit`/`entry` sale de `gates` —la MISMA del dominio, exportada, no una copia
    // de sus tres lineas— y el `distance`/`path` sale de contar los clicks de
    // `buildSequence`. Son dos lecturas distintas del mismo salto, y este test es lo
    // que las ata: si las puertas se corrieran, el camino entre ellas dejaria de ser
    // el que suena.
    //
    // Se recorre BASE y tambien un tablero de dos piezas: el bucle es vacuo si la
    // respuesta no trae saltos, asi que sin la guarda de abajo un `hops: []` pasaria
    // por verde.
    for (const pieces of [BASE, [{ piece: 'F', at: [1, 1] }, { piece: 'Z', at: [7, 4] }]]) {
      const r = call(simulateBoard, { pieces });
      assert.ok(ruta(r).hops.length > 0, 'el tablero tiene saltos que contrastar');
      // El tablero entero entra en el contraste: desde el spec 011 la ruta entre dos
      // puertas depende de que piezas haya en el medio, asi que preguntarle al dominio
      // por el tramo sin decirle donde esta el resto compararia contra otro recorrido.
      // Las que no entran quedan afuera porque tampoco ocupan celdas.
      const tablero = (r.placements as (PlacedPiece & { valid: boolean })[]).filter(p => p.valid);
      for (const h of ruta(r).hops) {
        const donde = `${h.from}->${h.to}`;
        const tramo = routeBetween(h.exit, h.entry, tablero, GRID_DEFAULT);
        assert.equal(tramo.steps, h.distance, donde);
        assert.deepEqual(tramo.path, h.path, donde);
      }
    }
  });

  test('con una sola pieza no hay saltos: el recorrido existe ENTRE piezas', () => {
    // La guarda que falto la primera vez, y el bug que dejo: el `map` sobre los pasos
    // sintetizaba un tramo de la pieza a si misma con `distance` fijo en 1, porque sin
    // clicks `path.length + 1` da 1. Ese 1 contradecia a las celdas que la misma
    // respuesta imprimia al lado — con la `Z` sola la distancia real de salida a
    // entrada es 3, y con la `F` es 2—, o sea que el objeto era internamente
    // inconsistente. El dominio ya decide esto devolviendo `clicks: []`.
    for (const piece of ['X', 'Z', 'I', 'F'] as const) {
      const r = call(simulateBoard, { pieces: [{ piece, at: [5, 2] }] });
      assert.deepEqual(ruta(r).order, ['1'], piece);
      assert.deepEqual(ruta(r).hops, [], piece);
      assert.equal(cuentas(r).clicks, 0, piece);
      // El ciclo igual dura: son los 5 intervalos del arpegio, no un salto.
      assert.equal(ciclo(r).intervals, CELLS_PER_PIECE, piece);
    }
  });

  test('un click puede caer sobre una celda ocupada, y en la respuesta se ve', () => {
    // Desde el spec 011 el camino NO ignora lo que hay en el medio: rodea cuando rodear
    // sale mas barato (`CROSS_COST` solo se paga en celda ocupada) pero cruzar sigue
    // siendo el camino mas barato en algunos tramos, y ahi el click cae sobre una pieza
    // igual. Que esas celdas salgan en la respuesta —hoy con su nota, en
    // `hops[].crossed`— es lo que permite verlo sin escuchar.
    const r = call(simulateBoard, { pieces: CON_CRUCE });
    const ocupadas = new Set(
      (r.placements as { cells: Cell[] }[]).flatMap(p => p.cells).map(([x, y]) => `${x},${y}`),
    );
    const pisados = ruta(r).hops.flatMap(h => h.path).filter(([x, y]) => ocupadas.has(`${x},${y}`));
    assert.ok(pisados.length > 0, 'este tablero tiene clicks sobre celdas ocupadas');
  });

  test('T046 — el cruce sobre una pieza trae la nota que suena al pisarla', () => {
    // El tablero esta elegido para que cruzar sea lo BARATO, no lo inevitable: rodear la
    // `X` existe y cuesta mas que pagar sus tres celdas. Hasta el spec 012 este test se
    // apoyaba en otra cosa —que la celda central de la `X` fuera siempre una de sus dos
    // puertas, o sea que entrar a ella cruzara por mucho que subiera `CROSS_COST`— y esa
    // propiedad se fue con el camino: hoy la `X` entra por un brazo y sale por el
    // opuesto, y su tablero viejo no cruza ni una celda.
    //
    // Por eso la guarda cuenta los cruces exactos: si alguien mueve `CROSS_COST` y el
    // recorrido pasa a rodear, el test falla en rojo en vez de quedarse sin nada que
    // contrastar.
    //
    // `crossed` tiene que leerse de la MISMA `noteAtCell` que pinta el tablero, no de una
    // nota recalculada aca.
    const r = call(simulateBoard, { pieces: CON_CRUCE });
    const hops = ruta(r).hops;
    // El tramo que entra a la `X` la atraviesa entera —brazo, centro— y el que sale roza
    // un brazo: uno de los cruces es la celda central, que es lo que la hace la pieza
    // mas cara de pisar.
    assert.deepEqual(hops.map(h => h.crossed.length), [1, 0, 2]);
    assert.deepEqual(hops[0].crossed, [{ cell: [2, 1], note: 'A4' }]);
    assert.deepEqual(hops[2].crossed, [{ cell: [1, 2], note: 'B4' }, { cell: [1, 1], note: 'E5' }]);
  });

  test('T046 — sin cruces la lista sale vacia, nunca ausente', () => {
    // `F` en (2,1) e `I` rot 1 en (6,3): el camino mas barato entre las dos no tiene
    // por que rozar ninguna, asi que `crossed` tiene que seguir presente y en [] en
    // vez de faltar del objeto — es la propiedad que distingue "no hay cruces" de
    // "no se reporto". Verificado en los dos sentidos del salto.
    const r = call(simulateBoard, {
      pieces: [
        { piece: 'F', at: [2, 1] },
        { piece: 'I', rotation: 1, at: [6, 3] },
      ],
    });
    const hops = ruta(r).hops;
    assert.ok(hops.length > 0, 'el tablero tiene saltos que contrastar');
    for (const h of hops) {
      assert.ok(Array.isArray(h.crossed), `${h.from}->${h.to} trae crossed`);
      assert.deepEqual(h.crossed, [], `${h.from}->${h.to}`);
    }
  });

  test('fuera del tablero: invalida, con motivo, sin puertas y sin ciclo', () => {
    const r = call(simulateBoard, { pieces: [{ piece: 'I', at: [9, 0] }] });
    const p = (r.placements as { valid: boolean; reason: string; gates?: unknown }[])[0];
    assert.equal(p.valid, false);
    assert.equal(p.reason, 'fuera-del-tablero');
    assert.equal(p.gates, undefined, 'una pieza que no entra no esta en el recorrido');
    assert.deepEqual(cuentas(r), { notes: 0, clicks: 0, crosses: 0, total: 0, distinctInstants: 0 });
    // Sin piezas validas no hay circuito, y sin circuito no hay ciclo que durar.
    assert.deepEqual(ciclo(r), { intervals: 0, seconds: 0 });
    assert.deepEqual(ruta(r), { order: [], hops: [] });
  });

  test('solapada: el motivo nombra contra que pieza se choco', () => {
    const r = call(simulateBoard, { pieces: [{ piece: 'F', at: [2, 1] }, { piece: 'F', at: [2, 1] }] });
    const ps = r.placements as { id: string; valid: boolean; reason?: string }[];
    assert.equal(ps[0].valid, true);
    assert.equal(ps[1].valid, false);
    assert.equal(ps[1].reason, 'choque-con-1');
    // Solo la valida entra al circuito: 5 notas por ciclo, 2 ciclos. Con una pieza
    // sola el ciclo es su arpegio y nada mas — no hay tramo, porque el recorrido
    // existe entre piezas.
    assert.equal(cuentas(r).notes, 10);
    assert.deepEqual(ruta(r).order, ['1']);
  });

  test('una jugada rechazada no deja obstaculo en el tablero', () => {
    // La segunda choca con la primera y se descarta; la tercera cae donde estaba
    // la segunda y tiene que entrar.
    const r = call(simulateBoard, {
      pieces: [{ piece: 'F', at: [2, 1] }, { piece: 'F', at: [2, 1] }, { piece: 'F', at: [7, 1] }],
    });
    assert.deepEqual((r.placements as { valid: boolean }[]).map(p => p.valid), [true, false, true]);
    // Y la rechazada tampoco entra al recorrido, que es donde se notaria de mas.
    assert.deepEqual(ruta(r).order, ['1', '3']);
  });

  test('la cantidad de onsets crece con los ciclos y no con el tempo', () => {
    const piezas = [{ piece: 'F', at: [2, 1] }];
    const dos = call(simulateBoard, { pieces: piezas });
    const cuatro = call(simulateBoard, { pieces: piezas, cycles: 4 });
    const rapido = call(simulateBoard, { pieces: piezas, bpm: 200 });

    // El ciclo de una `F` sola mide 5 intervalos y NO tiene clicks: el recorrido
    // existe entre piezas, y con una sola no hay entre. Son 5 y no 4 porque las
    // cinco notas abarcan 4 intervalos, asi que con 4 la ultima nota de la vuelta
    // y la primera de la siguiente caerian en el mismo instante.
    assert.equal(ciclo(dos).intervals, 5);
    assert.equal(cuentas(dos).clicks, 0);
    assert.equal(cuentas(dos).total, 10);
    assert.equal(cuentas(cuatro).total, 20);
    assert.equal(cuentas(rapido).total, 10);
    // El tempo estira el patron en vez de reordenarlo: el ciclo mide los mismos
    // intervalos y menos segundos.
    assert.equal(ciclo(rapido).intervals, ciclo(dos).intervals);
    assert.ok(ciclo(rapido).seconds < ciclo(dos).seconds);
    assert.ok((rapido.barSeconds as number) < (dos.barSeconds as number));
    // Y el intervalo se estira con el: es `compas / 16` a cualquier tempo, no una
    // constante en segundos. A 110 bpm el compas dura 2,1818 s y el intervalo
    // 0,1364; a 200, 1,2 y 0,075.
    assert.equal(dos.intervalSeconds, 0.1364);
    assert.equal(rapido.intervalSeconds, 0.075);
  });

  test('el ciclo lo fija el tablero y no el tempo: dos tableros, dos ciclos', () => {
    // Lo que el modelo viejo no podia decir: con compases todo entraba en los
    // mismos 2 x 2,18 s con 3 piezas o con 8. Ahora la duracion es del recorrido.
    const una = call(simulateBoard, { pieces: [{ piece: 'X', at: [5, 2] }] });
    const tres = call(simulateBoard, { pieces: BASE });
    assert.equal(ciclo(una).intervals, 5);
    assert.equal(ciclo(tres).intervals, 30);
    assert.equal(ciclo(tres).seconds, 4.0909);
  });

  test('ningun onset se emite dos veces pese al solape de ventanas', () => {
    // Los ticks son de 25 ms y el horizonte de 100 ms: sin `scheduledUntil` cada
    // onset saldria cuatro veces. Es el bug que este bucle podria reintroducir.
    //
    // `distinctInstants` es lo que quedo de `coincident`, que se fue porque su
    // `maxPerInstant` daba 1 siempre: en el recorrido dos onsets no pueden
    // coincidir por construccion. Reconvertido en asercion sigue atajando las dos
    // cosas — un onset duplicado y dos eventos colisionando.
    const r = call(simulateBoard, { pieces: [{ piece: 'X', at: [5, 2] }], cycles: 3 });
    assert.equal(cuentas(r).total, 15);
    assert.equal(cuentas(r).distinctInstants, 15);
    assert.equal(cuentas(r).total, 3 * ciclo(r).intervals);
  });

  test('AC-MUS-015 — el regimen mueve las alturas y NO el circuito, y la respuesta lo dice', () => {
    // Las tres piezas de `BASE` rotadas, para que el regimen tenga algo que mover: a
    // rotacion 0 los dos son identicos por D2 y este test pasaria vacio.
    const rotadas = [
      { piece: 'F', rotation: 1, at: [1, 1] },
      { piece: 'Z', rotation: 2, at: [7, 4] },
      { piece: 'I', rotation: 1, at: [5, 2] },
    ];
    const escala = call(simulateBoard, { pieces: rotadas, regimen: 'escala' });
    const orden = call(simulateBoard, { pieces: rotadas, regimen: 'orden' });

    assert.equal(escala.regimen, 'escala');
    assert.equal(orden.regimen, 'orden');

    // Lo que NO cambia: el circuito entero. El 017 corre el arpegio y no la entrada
    // justamente para no reordenar el tablero (D1), asi que el orden, los saltos y el
    // largo del ciclo salen iguales en los dos.
    assert.deepEqual(ruta(orden).order, ruta(escala).order);
    assert.deepEqual(ruta(orden).hops.map(h => h.distance), ruta(escala).hops.map(h => h.distance));
    assert.deepEqual(ciclo(orden), ciclo(escala));

    // Lo que si cambia: las alturas de la linea de tiempo, en los mismos instantes.
    const notas = (r: Record<string, unknown>) => linea(r).map(e => e.note ?? null);
    assert.deepEqual(linea(orden).map(e => e.at), linea(escala).map(e => e.at));
    assert.notDeepEqual(notas(orden), notas(escala));
  });

  test('sin `regimen` simula `escala`, que es el de la app', () => {
    const porOmision = call(simulateBoard, { pieces: BASE });
    assert.equal(porOmision.regimen, 'escala');
  });

  test('AC-PLY-024 — una pieza muteada reporta sus clicks y no su arpegio', () => {
    // La tool es una fachada sobre `buildSequence`, asi que esto no verifica la regla
    // del muteo —eso vive en `src/circuit/domain/__tests__/sequence.test.ts`— sino que la
    // fachada la deje pasar entera: sin `muted` en el schema, la entrada se caia en
    // silencio y la respuesta describia otro tablero.
    // Un ciclo y no los dos del default: asi los conteos de `onsets` se leen contra el
    // ciclo del tablero y no contra un multiplo suyo.
    const normal = call(simulateBoard, { pieces: CON_CRUCE, cycles: 1 });
    const conMute = call(simulateBoard, {
      pieces: CON_CRUCE.map((p, i) => i === 0 ? { ...p, muted: true } : p),
      cycles: 1,
    });

    // El circuito no se mueve: mismo orden de visita, mismos saltos y mismo ciclo. Es lo
    // que hace que la tool pueda contestar "que cambia si muteo esta" — si el recorrido
    // se moviera, la pregunta cambiaria la respuesta.
    assert.deepEqual(ruta(conMute).order, ruta(normal).order);
    assert.deepEqual(ruta(conMute).hops.map(h => h.distance), ruta(normal).hops.map(h => h.distance));
    assert.equal(ciclo(conMute).intervals, ciclo(normal).intervals);

    // La pieza muteada sigue siendo un nodo del recorrido, aunque no emita `Step`.
    assert.ok(ruta(conMute).order.includes('1'));
    assert.equal((r => (r.placements as { muted: boolean }[])[0].muted)(conMute), true);

    // Cinco notas menos y cinco clicks mas, con el total intacto: el hueco se escucha en
    // su lugar y no como un patron acortado.
    assert.equal(cuentas(conMute).notes, cuentas(normal).notes - 5);
    assert.equal(cuentas(conMute).total, cuentas(normal).total);
    // Y los cruces sobre la pieza muteada dejan de sonar: la floritura del 011 es
    // exactamente la nota que el muteo apago.
    assert.ok(cuentas(normal).crosses > 0, 'este tablero cruza de verdad');
    assert.equal(cuentas(conMute).crosses, 0);
    assert.deepEqual(ruta(conMute).hops.flatMap(h => h.crossed), []);
  });

  test('la reflexion llega hasta la simulacion: mismas celdas, arpegio al reves', () => {
    // La `X` es una de las cuatro piezas donde el espejo NO cambia la forma, asi que
    // aisla lo que este test mira: la reflexion no se ve en `cells` y si se oye en la
    // `timeline`. Con una pieza asimetrica el retrogrado quedaria mezclado con el
    // cambio de celdas y el test afirmaria dos cosas a la vez.
    const enX = (mirror: boolean) =>
      call(simulateBoard, { pieces: [{ piece: 'X', at: [2, 2], mirror }], cycles: 1 });
    const derecho = enX(false);
    const espejo = enX(true);

    // Como CONJUNTO y no como lista: el espejo deja la forma igual pero reordena el
    // array, que es justo lo que el invariante del orden garantiza —el indice k sigue
    // siendo la imagen de la celda k— y lo que hace que el retrogrado tenga sentido.
    const celdas = (r: Record<string, unknown>) =>
      new Set((r.placements as { cells: Cell[] }[])[0].cells.map(c => c.join(',')));
    assert.deepEqual(celdas(espejo), celdas(derecho), 'en la X el espejo no se ve');

    const notas = (r: Record<string, unknown>) =>
      linea(r).filter(e => e.note !== undefined).map(e => e.note);
    assert.equal(notas(derecho).length, NOTES_PER_PIECE);
    assert.deepEqual(notas(espejo), [...notas(derecho)].reverse());
  });

  test('un `hz` que el mapa no conoce se dice en Hz, no como `undefined`', () => {
    // La regla vive en `nombreDeHz` y no en un `??` dentro del `map` justamente para
    // poder ejercerla: desde la tool no se alcanza, porque hoy todo `Hit` con altura
    // sale de las notas con las que se arma el mapa. Que no se alcance no la vuelve
    // irrelevante — la vuelve invisible, que es peor.
    const mapa = new Map([[440, 'A4']]);
    assert.equal(nombreDeHz(mapa, 440), 'A4');
    assert.equal(nombreDeHz(mapa, 523.2511), '523Hz');
  });
});

/**
 * La tool que lee el disco corre sobre el repo REAL: un `src/` de mentira verificaria
 * el parser contra un dialecto inventado.
 *
 * Se afirma la FORMA y las invariantes de la respuesta, nunca su contenido: un simbolo
 * nuevo no tiene que poner el build en rojo.
 */
describe('find_symbol', () => {
  test('sin `name` devuelve el outline entero, y los contadores son los del mapa que viaja', () => {
    const r = call(findSymbol, { includeTests: false });
    const outline = r.outline as Record<string, string[]>;

    // La regresion que el comentario del fuente nombra: los contadores se derivaban
    // del indice crudo —que cuenta los tests— sobre un outline que los omite, y
    // decia 84 sobre 36 arriba de una lista de 78 sobre 26.
    assert.equal(r.archivos, Object.keys(outline).length);
    assert.equal(r.simbolos, Object.values(outline).reduce((n, xs) => n + xs.length, 0));
    assert.ok(r.archivos > 0, 'el indice no puede salir vacio');

    // Y sin tests: ningun archivo del outline vive en `__tests__/`.
    assert.deepEqual(Object.keys(outline).filter(f => f.includes('__tests__')), []);
  });

  test('`includeTests` es lo unico que cambia entre las dos vistas, y suma', () => {
    const sin = call(findSymbol, { includeTests: false });
    const con = call(findSymbol, { includeTests: true });
    assert.ok((con.simbolos as number) > (sin.simbolos as number));
    assert.ok((con.archivos as number) > (sin.archivos as number));
  });

  test('con `name` trae la firma y el `usedBy` resuelto por el grafo, no por texto', () => {
    const r = call(findSymbol, { name: 'notesForRotation', includeTests: false });
    const matches = r.matches as { name: string; file: string; usedBy: string[] }[];
    assert.equal(r.query, 'notesForRotation');
    assert.equal(r.nota, undefined, 'ni miss ni corte: no hay nota que dar');

    const hit = matches.find(m => m.name === 'notesForRotation');
    assert.ok(hit, 'el simbolo tiene que estar');
    assert.equal(hit.file, 'src/musical-model/domain/music.ts');
    // La arista que justifica indexar `mcp-server/` como solo-grafo: sin ella
    // `usedBy` sub-reporta y la tool queda mas pobre que el grep que reemplaza.
    assert.ok(
      hit.usedBy.some(f => f.startsWith('mcp-server/')),
      'una tool del server importa este simbolo, y esa arista cuenta',
    );
    // Resuelto por grafo y no por coincidencia de texto: cada usuario aparece UNA vez.
    assert.equal(new Set(hit.usedBy).size, hit.usedBy.length);
  });

  test('un miss se dice, en vez de devolver una lista vacia muda', () => {
    const r = call(findSymbol, { name: 'noExisteEsteSimboloEnNingunLado', includeTests: false });
    assert.deepEqual(r.matches, []);
    assert.match(r.nota as string, /Ningún símbolo exportado de src\/ coincide/);
  });

  test('un corte tambien se dice, que es distinto de devolver 20 y callarse', () => {
    // Una subcadena de una letra barre casi todo el indice: lo que se afirma no es
    // cuantos hay —eso cambia con cada simbolo nuevo— sino que al cortar lo diga y
    // que el numero de la nota sea el total y no el truncado.
    const r = call(findSymbol, { name: 'e', includeTests: false });
    const matches = r.matches as unknown[];
    assert.equal(matches.length, 20, 'el tope de la tool');
    assert.match(r.nota as string, /coincide por subcadena con \d+ símbolos; van los primeros 20/);
    const total = Number((r.nota as string).match(/con (\d+) símbolos/)![1]);
    assert.ok(total > matches.length, 'la nota reporta el total, no lo que entro');
  });
});

describe('simulate_board — el tablero deja de ser 10x6 (spec 031)', () => {
  test('sin `dims` contesta sobre el tablero de siempre', () => {
    // La compatibilidad que el AC12 pide: una consulta escrita antes del 031 no dice
    // dimensiones y tiene que dar exactamente lo mismo que antes. El oraculo es la propia
    // respuesta: `[9, 5]` es la ultima celda del tablero de referencia, asi que una pieza
    // que la pisa entra, y una pieza en la columna 10 no.
    const dentro = call(simulateBoard, { pieces: [{ piece: 'I', at: [7, 5] }] });
    assert.equal((dentro.placements as { valid: boolean }[])[0].valid, true);

    const afuera = call(simulateBoard, { pieces: [{ piece: 'I', at: [12, 2] }] });
    assert.equal((afuera.placements as { valid: boolean }[])[0].valid, false);
    assert.equal((afuera.placements as { reason: string }[])[0].reason, 'fuera-del-tablero');
  });

  test('con `dims` contesta sobre el tablero que se le pida', () => {
    // La misma jugada que se cae en 10 x 6 entra en el tablero de una pantalla de
    // 1920 x 1080, que es de 26 x 15. Sin este parametro no habria forma de preguntarle al
    // dominio por el tablero que se esta mirando.
    const r = call(simulateBoard, { pieces: [{ piece: 'I', at: [12, 2] }], dims: { w: 26, h: 15 } });
    assert.equal((r.placements as { valid: boolean }[])[0].valid, true);
  });

  test('el circuito cambia con las dimensiones, porque la costura son las esquinas', () => {
    // No es solo el borde: la costura del spec 009 une `(0,0)` con la esquina opuesta, asi
    // que agrandar el tablero mueve una arista del grafo y con ella los caminos. Dos
    // tableros iguales en piezas y distintos en tamano tienen ciclos distintos.
    //
    // La `Z` esta en (8,4) y no en (7,4) desde el spec 036, y se BUSCO en vez de
    // ajustarse: con la forma nueva, desde (7,4) el circuito pasa a ser el mismo en los
    // dos tableros, o sea que el tablero viejo dejaba este test verde sin ejercer nada.
    // Es la misma trampa que el comentario del empate documenta en `sequence.test.ts`.
    const saltos = (r: Record<string, unknown>) => (r.route as { hops: unknown[] }).hops;
    const piezas = [{ piece: 'F', at: [1, 1] }, { piece: 'Z', at: [8, 4] }];
    const chico = call(simulateBoard, { pieces: piezas });
    const grande = call(simulateBoard, { pieces: piezas, dims: { w: 26, h: 15 } });
    assert.notDeepEqual(saltos(grande), saltos(chico));
  });
});

