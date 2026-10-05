import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tools } from '../tools/index.ts';
import { describePiece } from '../tools/describePiece.ts';
import { checkInvariants, pieceOf } from '../tools/checkInvariants.ts';
import { simulateBoard, nombreDeHz } from '../tools/simulateBoard.ts';
import { findSymbol } from '../tools/findSymbol.ts';
import { PIECE_KEYS } from '../pieces.ts';
import { routeBetween } from '../../../src/circuit/routing.ts';
import { SHAPES, CELLS_PER_PIECE } from '../../../src/pieces/pieces.ts';
import { NOTES_PER_PIECE, REGIMEN } from '../../../src/musical-model/music.ts';
import type { Cell } from '../../../src/pieces/transform.ts';
import type { PlacedPiece } from '../../../src/board-editing/placement.ts';
import type { ToolDef } from '../tools/types.ts';
import { GRID_DEFAULT } from '../../../src/board-editing/placement.ts';

/**
 * These tests check the FORMAT of the answers, which is the only thing the server
 * adds.
 *
 * The tests of `src/` already cover the rules of the domain, and to repeat them here
 * would repeat the criterion too.
 *
 * The exception is the numbers of the Z and of the legs: they do not check the domain.
 * They check that the server composes it in the correct order.
 */

/** Runs a tool and returns its parsed answer. */
function call(tool: ToolDef, args: unknown): Record<string, unknown> {
  const r = tool.run(args);
  const first = r.content?.[0];
  assert.ok(first && first.type === 'text', 'the answer must be text');
  return JSON.parse(first.text) as Record<string, unknown>;
}

describe('the registry', () => {
  test('the names are unique and in snake_case', () => {
    const nombres = tools.map(t => t.name);
    assert.equal(new Set(nombres).size, nombres.length);
    for (const n of nombres) assert.match(n, /^[a-z][a-z_]*$/);
  });

  test('every tool has a description and a schema', () => {
    for (const t of tools) {
      assert.ok(t.description.length > 0, t.name);
      assert.ok(t.inputSchema, t.name);
    }
  });

  test('no tool forgets to declare whether it writes', () => {
    // The form is "none forgot" and not "this tool says this": the second one copies the
    // code into the test and lets the next tool through. That is the real failure mode
    // of a datum that `tsc` cannot keep in sync, because the two fields are optional in
    // `ToolDef` on purpose.
    //
    // `openWorldHint` must be `false` and not only "a boolean": the set of entities is
    // CLOSED, twelve pieces and one `src/`, and that property makes this server
    // reliable. Without this line it lives only in prose. If a tool must open it, the
    // discussion goes through this line.
    for (const t of tools) {
      assert.ok(t.annotations, t.name);
      assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
      assert.equal(t.annotations.openWorldHint, false, t.name);
      assert.ok(t.title && t.title.length > 0, t.name);
    }
  });

  test('no tool writes', () => {
    // The server runs the domain and reads it: it has nothing to write.
    assert.deepEqual(tools.filter(t => t.annotations?.readOnlyHint !== true).map(t => t.name), []);
  });

  test('an invalid argument does not reach the handler', () => {
    // The SDK validates before the call, and `defineTool` parses again at the generic
    // boundary: by the two ways, a piece that does not exist fails and does not answer
    // something plausible.
    assert.throws(() => describePiece.run({ piece: 'Q' }));
    assert.throws(() => describePiece.run({ piece: 'F', rotation: 7 }));
    assert.throws(() => describePiece.run({}));
  });
});

describe('describe_piece', () => {
  test('Z rotated 270° and reflected', () => {
    const r = call(describePiece, { piece: 'Z', rotation: 3, mirror: true });
    assert.deepEqual((r.notes as { name: string }[]).map(n => n.name), ['D#6', 'C#6', 'A#5', 'G#5', 'F#5']);
    assert.equal(r.anchorIndex, 2);
    assert.deepEqual(r.anchor, [1, 1]);
    assert.equal(r.ascii, '#..\n#@#\n..#');
    assert.equal(r.tonic, 'B');
    assert.equal(r.retrograde, true);
  });

  test('the 96 combinations give 5 cells and 5 notes, and none fails', () => {
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

  test('AC-MUS-017 — the reflection ALWAYS reverses the notes, in the 48 combinations', () => {
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

  test('and sometimes it does not show: where the mirror leaves the shape equal', () => {
    // Measured, and it is the trap that the description of the tool warns about: the
    // reflection can be heard and not seen. The list is exact: I and X in the four
    // rotations, T and U at 0 and 180°. V and W are not in it: on them the mirror DOES
    // change the shape. What does not change is the set of reachable shapes, because the
    // mirror falls on another rotation.
    const invisible: Record<string, number[]> = { I: [0, 1, 2, 3], X: [0, 1, 2, 3], T: [0, 2], U: [0, 2] };

    for (const piece of PIECE_KEYS) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const derecho = call(describePiece, { piece, rotation });
        const espejo = call(describePiece, { piece, rotation, mirror: true });
        const esperadoIgual = (invisible[piece] ?? []).includes(rotation);
        assert.equal(
          espejo.ascii === derecho.ascii, esperadoIgual,
          `${piece} rot${rotation}: the mirror ${esperadoIgual ? 'must not' : 'must'} change the shape`,
        );
      }
    }
  });

  test('`cellMap` gives degree, step and note to each cell, and does not touch `cells`', () => {
    // Two cases of the walk. On the X the tonic falls on an arm and not on the center:
    // the center has four neighbors, and a start there would need three jumps and not
    // two. The F is the only piece whose walk agrees with the order in which its cells
    // are typed in `SHAPES`.
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

    // `cells` is still the plain list of coordinates: the field was added NEXT to it,
    // not over it. A check of its length alone does not see that.
    assert.deepEqual(f.cells, [[0, 1], [1, 0], [1, 1], [1, 2], [2, 2]]);
  });

  test('`scale` tells the regime, and in `orden` it gets the singular right', () => {
    // In `escala` the label comes from a table. In `orden` it is built, and there the
    // text is the only thing that tells one rotation from another, because the formula
    // is always the major pentatonic. A "1 positions" in the answer of a tool that
    // exists so that NOBODY derives by hand is exactly the kind of detail that makes a
    // reader doubt the rest.
    const scale = (rotation: number, regimen: 'escala' | 'orden') =>
      call(describePiece, { piece: 'F', rotation, regimen }).scale;

    assert.equal(scale(0, REGIMEN.orden), 'major pentatonic, not shifted (rotation 0°)');
    assert.equal(scale(1, REGIMEN.orden), 'major pentatonic shifted 1 position (rotation 90°)');
    assert.equal(scale(2, REGIMEN.orden), 'major pentatonic shifted 2 positions (rotation 180°)');
    assert.equal(scale(3, REGIMEN.orden), 'major pentatonic shifted 3 positions (rotation 270°)');

    // And the other regime does not go through there: at rotation 0 the two sound the
    // same, and the label must still say which one was used.
    assert.notEqual(scale(0, REGIMEN.escala), scale(0, REGIMEN.orden));
  });

  test('the step is the degree with no reflection and its inverse with it, in the 96', () => {
    // The only difference between the two numberings, and the reason the two exist: the
    // degree says WHICH NOTE the cell has, and the reflection does not move it. The step
    // says WHEN it sounds, which is exactly what the reflection reverses.
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

  test('the reflection reverses `notes` and does NOT reverse `cellMap`', () => {
    // The retrograde is about the PLAY ORDER. The note of a cell comes from the
    // ascending arpeggio, so a reflection moves the cell on the board but leaves it the
    // same degree. To index `notes` and not `ascending` would turn the mapping around
    // in exactly the 48 combinations with a mirror.
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

  test('the octave shifts the whole arpeggio twelve semitones', () => {
    const a = call(describePiece, { piece: 'F', octave: 4 });
    const b = call(describePiece, { piece: 'F', octave: 5 });
    assert.deepEqual(
      (b.notes as { midi: number }[]).map(n => n.midi),
      (a.notes as { midi: number }[]).map(n => n.midi + 12),
    );
  });

  test('the two regimes give different answers and each one says which it is', () => {
    // Without the `regimen` in the answer, the tool would be ambiguous in 36 of the 48
    // combinations: two equal questions with two correct answers and no way to know
    // which one was answered.
    const escala = call(describePiece, { piece: 'F', rotation: 1, regimen: 'escala' });
    const orden = call(describePiece, { piece: 'F', rotation: 1, regimen: 'orden' });

    assert.equal(escala.regimen, 'escala');
    assert.equal(orden.regimen, 'orden');
    assert.notDeepEqual(
      (orden.notes as { midi: number }[]).map(n => n.midi),
      (escala.notes as { midi: number }[]).map(n => n.midi),
    );

    // And `scale` agrees with the regime: under `orden`, "minor pentatonic (rotation
    // 90°)" would be worse than no report, because the notes next to it are not those
    // of a minor. It is the hardcoded assumption that no gate catches (`SCALE_LABEL`).
    assert.match(String(escala.scale), /minor/);
    assert.doesNotMatch(String(orden.scale), /minor/);
    assert.match(String(orden.scale), /shifted 1 position \(/);

    // `cellMap` comes from the same arpeggio as `notes`, so it moves too.
    const notaDe = (r: Record<string, unknown>) => (r.cellMap as { note: string }[]).map(c => c.note);
    assert.notDeepEqual(notaDe(orden), notaDe(escala));
  });

  test('at rotation 0 the two regimes give the same notes', () => {
    // The property that makes the comparison AUDITABLE, checked on the side of the tool
    // too: if they diverged here, the server would compose something else.
    for (const piece of PIECE_KEYS) {
      const escala = call(describePiece, { piece, rotation: 0, regimen: 'escala' });
      const orden = call(describePiece, { piece, rotation: 0, regimen: 'orden' });
      assert.deepEqual(orden.notes, escala.notes, piece);
    }
  });

  test('with no `regimen` it answers `escala`, the one of the app', () => {
    const porOmision = call(describePiece, { piece: 'F', rotation: 2 });
    assert.equal(porOmision.regimen, 'escala');
    assert.deepEqual(porOmision.notes, call(describePiece, { piece: 'F', rotation: 2, regimen: 'escala' }).notes);
  });
});

describe('check_invariants', () => {
  test('the seven checks, one by one and green', () => {
    const r = call(checkInvariants, {});
    assert.equal(r.ok, true);
    const checks = r.checks as { name: string; ok: boolean; failures: string[] }[];
    // The tool exposes the checks and does not list them: it iterates `checkAll()`. So
    // this number is the only thing of the server to move when the domain adds a check.
    assert.equal(checks.length, 7);
    for (const c of checks) {
      assert.equal(c.ok, true, `${c.name}: ${c.failures.join(' · ')}`);
      assert.deepEqual(c.failures, []);
    }
    // The space of the model, which is not what each check covers: `formas` reads the
    // 12 canonical shapes and `BASE_MAP` the set once.
    assert.deepEqual(r.modelSpace, { pieces: 12, orientationsPerPiece: 8, orientations: 96 });
  });

  test('the piece filter recognizes the prefix of the message and lets the global ones through', () => {
    // It is the only part of the server coupled to the FORMAT of the messages of
    // invariants.ts, and it is written to degrade toward showing too much.
    assert.equal(pieceOf('Z rot3 mirror: cell 2 is (1,1)'), 'Z');
    assert.equal(pieceOf('F: has 4 cells and must have 5'), 'F');
    assert.equal(pieceOf('two pieces share a tonic'), null);
    assert.equal(pieceOf('Q: no such piece'), null);
  });

  test('with a real failure, the filter limits the messages and not the verdict', () => {
    // The docblock of `pieceOf` says why it is exported: with the seven checks green,
    // the tool has no real failure to exercise the filter with. This test makes one: it
    // breaks a shape, which is the only way to go through the path that the tool takes
    // when something is wrong. That is the only path that matters.
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

      // Limited to another piece: the message leaves the list BUT `ok` is still that of
      // the whole model. An "all good" limited to the Z while the I is broken would be
      // the misleading answer that the comment in the source rejects.
      const conFiltro = call(checkInvariants, { piece: 'Z' });
      assert.equal(conFiltro.ok, false);
      assert.equal(conFiltro.scope, 'Z');
      assert.deepEqual(formas(conFiltro).failures, []);
      // And the answer says how many were hidden, so that nobody reads the [] as "none".
      assert.equal(formas(conFiltro).failuresOtherPieces, 1);
    } finally {
      SHAPES.I = original;
    }
  });
});

describe('simulate_board', () => {
  /** What these tests read from the answer. It is not the whole contract. */
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
   * Tolerance for the comparison of gaps, in seconds.
   *
   * The `at` values of the answer are rounded to 4 decimals, so a delta can be off by
   * up to 2e-4. One event more or less would move the delta a whole interval (0.1364 s
   * at 110 bpm), three orders of magnitude above this.
   */
  const EPS = 1e-3;

  /**
   * The baseline board: three pieces, legs of 6, 4 and 8 moves.
   *
   * The three numbers depend on where the circuit enters and leaves the piece in the
   * middle, the `Z` at (7,4).
   */
  const BASE = [
    { piece: 'F', at: [1, 1] },
    { piece: 'Z', at: [7, 4] },
    { piece: 'I', rotation: 1, at: [5, 2] },
  ];

  /**
   * A board whose circuit DOES cross pieces: to go around the `X` at (1,1) costs more
   * than to cross it.
   *
   * `BASE` has one crossing only, on the piece that the leg leaves. This is the same
   * board that the crossing tests in `src/` use, on purpose: if it stops crossing, the
   * three fail together and none stays green and states the opposite.
   */
  const CON_CRUCE = [
    { piece: 'X', at: [1, 1] },
    { piece: 'F', at: [3, 2] },
    { piece: 'N', at: [2, 4] },
  ];

  test('the order is that of the circuit, not that of placement', () => {
    // Three vertical `I` in columns 0, 9 and 5, placed in THAT order: the circuit visits
    // them from left to right (1, 3, 2) and comes back through the seam. It is the whole
    // property of the circuit in one case: a move of one piece reorders the music, and
    // the order of placement shows nowhere.
    const r = call(simulateBoard, {
      pieces: [
        { piece: 'I', rotation: 1, at: [0, 2] },
        { piece: 'I', rotation: 1, at: [9, 2] },
        { piece: 'I', rotation: 1, at: [5, 2] },
      ],
    });
    assert.deepEqual(ruta(r).order, ['1', '3', '2']);
    assert.equal(ciclo(r).intervals, 31);
    // 16 clicks for each cycle, for the two cycles, and NONE crosses: `onsets` splits
    // them into SILENT and WITH PITCH, and here the second half is zero. The walk goes
    // through the `I` from end to end, so the circuit enters and leaves by its two ends
    // and does not go into the column.
    assert.equal(cuentas(r).clicks, 32);
    assert.equal(cuentas(r).crosses, 0);
    assert.equal(cuentas(r).clicks + cuentas(r).crosses, 32);
    // The return leg crosses the seam: `(9,5)` and `(0,0)` are neighbors, so the route
    // from column 9 to column 0 goes through there and not all the way around. With
    // these gates the shortcut is also FREE: the exit of one `I` is its bottom end and
    // the entry of the other is its top end, the two mouths of the seam. So the leg
    // measures 2 and `crossed` is empty. Without the shortcut the leg would be a detour
    // of 9 moves through column 8 plus the crossing cost of `(0,0)`, and this assertion
    // fixes that magnitude.
    assert.deepEqual(ruta(r).hops[2], {
      from: '2', to: '1', exit: [9, 4], entry: [0, 0], distance: 2,
      path: [[9, 5]],
      crossed: [],
    });
  });

  test('a leg of d moves gives d-1 evenly spaced clicks, each with its cell', () => {
    const r = call(simulateBoard, { pieces: BASE });
    const hops = ruta(r).hops;
    assert.deepEqual(hops.map(h => h.distance), [6, 4, 8]);
    for (const h of hops) {
      assert.equal(h.path.length, h.distance - 1, `${h.from}->${h.to}`);
    }

    // The first leg on the timeline: the 5 notes of piece 1, then its 5 leg events,
    // then the first note of piece 2. They are consecutive and exactly one interval
    // apart, the same interval that separates the notes of the arpeggio.
    const eventos = linea(r);
    const clicks = eventos.slice(CELLS_PER_PIECE, CELLS_PER_PIECE + hops[0].path.length);
    // The third is a CROSSING and not a click, and the reason is worth saying: the leg
    // enters the `F` again at (1,0), its own piece of departure. The route depends on
    // the DESTINATION, the `Z`, and not only on the `F`.
    //
    // So this board exercises the two kinds of leg event. The even spacing holds for
    // the five alike: a crossing lasts one interval, as a click does.
    assert.deepEqual(clicks.map(e => e.kind), ['click', 'click', 'cross', 'click', 'click']);
    for (const c of clicks) {
      if (c.kind === 'cross') assert.equal(c.note, 'D4', 'the crossing sounds the cell it enters');
      else assert.equal(c.note, undefined, 'the silent click has no pitch');
    }
    assert.equal(eventos[CELLS_PER_PIECE + hops[0].path.length].kind, 'note');
    for (let i = 1; i < clicks.length; i++) {
      assert.ok(
        Math.abs(clicks[i].at - clicks[i - 1].at - (r.intervalSeconds as number)) < EPS,
        `clicks ${i - 1} and ${i}: ${clicks[i - 1].at} → ${clicks[i].at}`,
      );
    }
  });

  test('the join between two cycles has the same spacing as the inside', () => {
    // The cycle has no start mark: the leg from the last piece to the first uses the
    // same rule as the others. Measured in the strongest way possible: the circuit takes
    // ALL its intervals with no gap, so the whole timeline is an even grid, and the join
    // is not distinct from any other pair of consecutive events.
    const r = call(simulateBoard, { pieces: BASE, cycles: 2 });
    const at = linea(r).map(e => e.at);
    assert.equal(at.length, 2 * ciclo(r).intervals);
    for (let i = 1; i < at.length; i++) {
      assert.ok(
        Math.abs(at[i] - at[i - 1] - (r.intervalSeconds as number)) < EPS,
        `events ${i - 1} and ${i}: ${at[i - 1]} → ${at[i]}`,
      );
    }
  });

  test('the reported legs are those of the domain, not a second count', () => {
    // The `exit`/`entry` comes from `gates`, THE SAME function of the domain, exported,
    // not a copy of its three lines. The `distance`/`path` comes from a count of the
    // clicks of `buildSequence`. They are two different reads of the same leg, and this
    // test ties them: if the gates moved, the route between them would not be the one
    // that sounds.
    //
    // It goes through BASE and also through a board of two pieces: the loop is vacuous
    // if the answer has no legs, so without the guard below a `hops: []` would pass
    // green.
    for (const pieces of [BASE, [{ piece: 'F', at: [1, 1] }, { piece: 'Z', at: [7, 4] }]]) {
      const r = call(simulateBoard, { pieces });
      assert.ok(ruta(r).hops.length > 0, 'the board has legs to compare');
      // The whole board goes into the comparison: the route between two gates depends
      // on which pieces are in the way. To ask the domain for the leg and not say where
      // the rest is would compare against another route. The invalid ones stay out
      // because they occupy no cells.
      const tablero = (r.placements as (PlacedPiece & { valid: boolean })[]).filter(p => p.valid);
      for (const h of ruta(r).hops) {
        const donde = `${h.from}->${h.to}`;
        const tramo = routeBetween(h.exit, h.entry, tablero, GRID_DEFAULT);
        assert.equal(tramo.steps, h.distance, donde);
        assert.deepEqual(tramo.path, h.path, donde);
      }
    }
  });

  test('with one piece there are no legs: a leg exists BETWEEN pieces', () => {
    // The guard on `n === 1`, and the bug it prevents: the `map` over the pieces would
    // make a leg from the piece to itself with `distance` fixed at 1, because with no
    // clicks `path.length + 1` is 1. That 1 contradicts the cells that the same answer
    // prints next to it: with the `Z` alone the real distance from exit to entry is 3,
    // and with the `F` it is 2. So the object would be inconsistent in itself. The
    // domain already decides this with `clicks: []`.
    for (const piece of ['X', 'Z', 'I', 'F'] as const) {
      const r = call(simulateBoard, { pieces: [{ piece, at: [5, 2] }] });
      assert.deepEqual(ruta(r).order, ['1'], piece);
      assert.deepEqual(ruta(r).hops, [], piece);
      assert.equal(cuentas(r).clicks, 0, piece);
      // The cycle still lasts: the 5 intervals of the arpeggio, not a leg.
      assert.equal(ciclo(r).intervals, CELLS_PER_PIECE, piece);
    }
  });

  test('a click can fall on an occupied cell, and the answer shows it', () => {
    // The route does NOT ignore what is in the way: it goes around when that is cheaper
    // (`CROSS_COST` is paid only on an occupied cell), but to cross is still the
    // cheapest route on some legs, and there the click falls on a piece anyway. Those
    // cells come in the answer, with their note, in `hops[].crossed`: that lets a reader
    // see it without hearing it.
    const r = call(simulateBoard, { pieces: CON_CRUCE });
    const ocupadas = new Set(
      (r.placements as { cells: Cell[] }[]).flatMap(p => p.cells).map(([x, y]) => `${x},${y}`),
    );
    const pisados = ruta(r).hops.flatMap(h => h.path).filter(([x, y]) => ocupadas.has(`${x},${y}`));
    assert.ok(pisados.length > 0, 'this board has clicks on occupied cells');
  });

  test('the crossing on a piece has the note that the cell shows', () => {
    // The board is chosen so that to cross is the CHEAP route, not the only one: a
    // route around the `X` exists and costs more than its crossings. The circuit enters
    // the `X` by one arm and leaves by another arm.
    //
    // So the guard counts the exact crossings: if someone moves `CROSS_COST` and the
    // route goes around, the test fails red and does not stay with nothing to compare.
    //
    // `crossed` must be read from THE SAME `noteAtCell` that paints the board, not from
    // a note computed again here.
    const r = call(simulateBoard, { pieces: CON_CRUCE });
    const hops = ruta(r).hops;
    // The leg that leaves the `X` crosses one arm, and the leg that enters it crosses an
    // arm and the center. The center cell is one of the crossings, and it makes the `X`
    // the most expensive piece to cross.
    assert.deepEqual(hops.map(h => h.crossed.length), [1, 0, 2]);
    assert.deepEqual(hops[0].crossed, [{ cell: [2, 1], note: 'A4' }]);
    assert.deepEqual(hops[2].crossed, [{ cell: [1, 2], note: 'B4' }, { cell: [1, 1], note: 'E5' }]);
  });

  test('with no crossings the list is empty, never absent', () => {
    // `F` at (2,1) and `I` rot 1 at (6,3): the cheapest route between the two does not
    // need to touch either, so `crossed` must still be present and be [], not missing
    // from the object. That property tells "there are no crossings" from "it was not
    // reported". Checked in the two directions of the leg.
    const r = call(simulateBoard, {
      pieces: [
        { piece: 'F', at: [2, 1] },
        { piece: 'I', rotation: 1, at: [6, 3] },
      ],
    });
    const hops = ruta(r).hops;
    assert.ok(hops.length > 0, 'the board has legs to compare');
    for (const h of hops) {
      assert.ok(Array.isArray(h.crossed), `${h.from}->${h.to} has crossed`);
      assert.deepEqual(h.crossed, [], `${h.from}->${h.to}`);
    }
  });

  test('off the board: invalid, with a reason, with no gates and no cycle', () => {
    const r = call(simulateBoard, { pieces: [{ piece: 'I', at: [9, 0] }] });
    const p = (r.placements as { valid: boolean; reason: string; gates?: unknown }[])[0];
    assert.equal(p.valid, false);
    assert.equal(p.reason, 'off-the-board');
    assert.equal(p.gates, undefined, 'a piece that does not fit is not in the circuit');
    assert.deepEqual(cuentas(r), { notes: 0, clicks: 0, crosses: 0, total: 0, distinctInstants: 0 });
    // With no valid piece there is no circuit, and with no circuit there is no cycle.
    assert.deepEqual(ciclo(r), { intervals: 0, seconds: 0 });
    assert.deepEqual(ruta(r), { order: [], hops: [] });
  });

  test('overlap: the reason names the piece it collided with', () => {
    const r = call(simulateBoard, { pieces: [{ piece: 'F', at: [2, 1] }, { piece: 'F', at: [2, 1] }] });
    const ps = r.placements as { id: string; valid: boolean; reason?: string }[];
    assert.equal(ps[0].valid, true);
    assert.equal(ps[1].valid, false);
    assert.equal(ps[1].reason, 'collides-with-1');
    // Only the valid one enters the circuit: 5 notes for each cycle, 2 cycles. With one
    // piece the cycle is its arpeggio and nothing more. There is no leg, because a leg
    // exists between pieces.
    assert.equal(cuentas(r).notes, 10);
    assert.deepEqual(ruta(r).order, ['1']);
  });

  test('a rejected placement leaves no obstacle on the board', () => {
    // The second collides with the first and is discarded. The third lands where the
    // second was and must be valid.
    const r = call(simulateBoard, {
      pieces: [{ piece: 'F', at: [2, 1] }, { piece: 'F', at: [2, 1] }, { piece: 'F', at: [7, 1] }],
    });
    assert.deepEqual((r.placements as { valid: boolean }[]).map(p => p.valid), [true, false, true]);
    // And the rejected one does not enter the circuit either, where it would show most.
    assert.deepEqual(ruta(r).order, ['1', '3']);
  });

  test('the event count grows with the cycles and not with the tempo', () => {
    const piezas = [{ piece: 'F', at: [2, 1] }];
    const dos = call(simulateBoard, { pieces: piezas });
    const cuatro = call(simulateBoard, { pieces: piezas, cycles: 4 });
    const rapido = call(simulateBoard, { pieces: piezas, bpm: 200 });

    // The cycle of one `F` alone is 5 intervals long and has NO clicks: a leg exists
    // between pieces, and one piece has no "between". It is 5 and not 4 because the
    // five notes span 4 intervals: with 4, the last note of the lap and the first of
    // the next would fall on the same instant.
    assert.equal(ciclo(dos).intervals, 5);
    assert.equal(cuentas(dos).clicks, 0);
    assert.equal(cuentas(dos).total, 10);
    assert.equal(cuentas(cuatro).total, 20);
    assert.equal(cuentas(rapido).total, 10);
    // The tempo stretches the pattern and does not reorder it: the cycle has the same
    // intervals and fewer seconds.
    assert.equal(ciclo(rapido).intervals, ciclo(dos).intervals);
    assert.ok(ciclo(rapido).seconds < ciclo(dos).seconds);
    assert.ok((rapido.barSeconds as number) < (dos.barSeconds as number));
    // And the interval stretches with it: it is `bar / 16` at any tempo, not a constant
    // in seconds. At 110 bpm the bar lasts 2.1818 s and the interval 0.1364 s. At 200,
    // 1.2 s and 0.075 s.
    assert.equal(dos.intervalSeconds, 0.1364);
    assert.equal(rapido.intervalSeconds, 0.075);
  });

  test('the board sets the cycle and not the tempo: two boards, two cycles', () => {
    // The duration belongs to the circuit: a board of 3 pieces and a board of 1 piece
    // do not fit in the same number of bars.
    const una = call(simulateBoard, { pieces: [{ piece: 'X', at: [5, 2] }] });
    const tres = call(simulateBoard, { pieces: BASE });
    assert.equal(ciclo(una).intervals, 5);
    assert.equal(ciclo(tres).intervals, 30);
    assert.equal(ciclo(tres).seconds, 4.0909);
  });

  test('no event is emitted twice despite the overlap of the windows', () => {
    // The ticks are 25 ms and the horizon is 100 ms: without `scheduledUntil` each event
    // would come out four times. It is the bug that this loop could bring back.
    //
    // In the circuit two events cannot coincide by construction, so `distinctInstants`
    // is an assertion: it catches the two things, an event emitted twice and two events
    // that collide.
    const r = call(simulateBoard, { pieces: [{ piece: 'X', at: [5, 2] }], cycles: 3 });
    assert.equal(cuentas(r).total, 15);
    assert.equal(cuentas(r).distinctInstants, 15);
    assert.equal(cuentas(r).total, 3 * ciclo(r).intervals);
  });

  test('AC-MUS-015 — the regime moves the pitches and NOT the circuit, and the answer says so', () => {
    // The three pieces of `BASE` rotated, so that the regime has something to move: at
    // rotation 0 the two regimes are identical and this test would pass empty.
    const rotadas = [
      { piece: 'F', rotation: 1, at: [1, 1] },
      { piece: 'Z', rotation: 2, at: [7, 4] },
      { piece: 'I', rotation: 1, at: [5, 2] },
    ];
    const escala = call(simulateBoard, { pieces: rotadas, regimen: 'escala' });
    const orden = call(simulateBoard, { pieces: rotadas, regimen: 'orden' });

    assert.equal(escala.regimen, 'escala');
    assert.equal(orden.regimen, 'orden');

    // What does NOT change: the whole circuit. The order regime shifts the arpeggio and
    // not the entry, exactly so that it does not reorder the board. So the order, the
    // legs and the length of the cycle are equal in the two.
    assert.deepEqual(ruta(orden).order, ruta(escala).order);
    assert.deepEqual(ruta(orden).hops.map(h => h.distance), ruta(escala).hops.map(h => h.distance));
    assert.deepEqual(ciclo(orden), ciclo(escala));

    // What does change: the pitches of the timeline, at the same instants.
    const notas = (r: Record<string, unknown>) => linea(r).map(e => e.note ?? null);
    assert.deepEqual(linea(orden).map(e => e.at), linea(escala).map(e => e.at));
    assert.notDeepEqual(notas(orden), notas(escala));
  });

  test('with no `regimen` it simulates `escala`, the one of the app', () => {
    const porOmision = call(simulateBoard, { pieces: BASE });
    assert.equal(porOmision.regimen, 'escala');
  });

  test('AC-PLY-024 — a muted piece reports its clicks and not its arpeggio', () => {
    // The tool is a facade over `buildSequence`, so this does not check the rule of the
    // mute, which lives in `src/circuit/__tests__/sequence.test.ts`. It checks that the
    // facade lets it through whole: without `muted` in the schema, the input would drop
    // silently and the answer would describe another board.
    // One cycle and not the two of the default: so the counts of `onsets` read against
    // the cycle of the board and not against a multiple of it.
    const normal = call(simulateBoard, { pieces: CON_CRUCE, cycles: 1 });
    const conMute = call(simulateBoard, {
      pieces: CON_CRUCE.map((p, i) => i === 0 ? { ...p, muted: true } : p),
      cycles: 1,
    });

    // The circuit does not move: same order of visit, same legs and same cycle. That
    // lets the tool answer "what changes if I mute this one": if the circuit moved, the
    // question would change the answer.
    assert.deepEqual(ruta(conMute).order, ruta(normal).order);
    assert.deepEqual(ruta(conMute).hops.map(h => h.distance), ruta(normal).hops.map(h => h.distance));
    assert.equal(ciclo(conMute).intervals, ciclo(normal).intervals);

    // The muted piece is still a node of the circuit, although it emits no `Step`.
    assert.ok(ruta(conMute).order.includes('1'));
    assert.equal((r => (r.placements as { muted: boolean }[])[0].muted)(conMute), true);

    // Five notes less and five clicks more, with the total intact: the gap is heard in
    // its place and not as a shorter pattern.
    assert.equal(cuentas(conMute).notes, cuentas(normal).notes - 5);
    assert.equal(cuentas(conMute).total, cuentas(normal).total);
    // And the crossings on the muted piece do not sound: the note of a crossing is
    // exactly the note that the mute turned off.
    assert.ok(cuentas(normal).crosses > 0, 'this board really crosses');
    assert.equal(cuentas(conMute).crosses, 0);
    assert.deepEqual(ruta(conMute).hops.flatMap(h => h.crossed), []);
  });

  test('the reflection reaches the simulation: same cells, arpeggio reversed', () => {
    // The `X` is one of the four pieces where the mirror does NOT change the shape, so
    // it isolates what this test checks: the reflection does not show in `cells` and it
    // is heard in the `timeline`. With an asymmetric piece the retrograde would be mixed
    // with the change of cells, and the test would assert two things at once.
    const enX = (mirror: boolean) =>
      call(simulateBoard, { pieces: [{ piece: 'X', at: [2, 2], mirror }], cycles: 1 });
    const derecho = enX(false);
    const espejo = enX(true);

    // As a SET and not as a list: the mirror leaves the shape equal but reorders the
    // array. That is exactly what the invariant of the array order guarantees, index k
    // is still the image of cell k, and what gives the retrograde its meaning.
    const celdas = (r: Record<string, unknown>) =>
      new Set((r.placements as { cells: Cell[] }[])[0].cells.map(c => c.join(',')));
    assert.deepEqual(celdas(espejo), celdas(derecho), 'on the X the mirror does not show');

    const notas = (r: Record<string, unknown>) =>
      linea(r).filter(e => e.note !== undefined).map(e => e.note);
    assert.equal(notas(derecho).length, NOTES_PER_PIECE);
    assert.deepEqual(notas(espejo), [...notas(derecho)].reverse());
  });

  test('an `hz` that the map does not know is said in Hz, not as `undefined`', () => {
    // The rule lives in `nombreDeHz` and not in a `??` inside the `map` so that a test
    // can exercise it: the tool cannot reach it, because today every `Hit` with a pitch
    // comes from the notes that the map is built from. That it cannot be reached does
    // not make it irrelevant. It makes it invisible, which is worse.
    const mapa = new Map([[440, 'A4']]);
    assert.equal(nombreDeHz(mapa, 440), 'A4');
    assert.equal(nombreDeHz(mapa, 523.2511), '523Hz');
  });
});

/**
 * The tool that reads the disk runs on the REAL repo: a fake `src/` would check the
 * parser against an invented dialect.
 *
 * The assertions are on the SHAPE and the invariants of the answer, never on its
 * content: a new symbol must not turn the build red.
 */
describe('find_symbol', () => {
  test('with no `name` it returns the whole outline, and the counters are those of the map that travels', () => {
    const r = call(findSymbol, { includeTests: false });
    const outline = r.outline as Record<string, string[]>;

    // The regression that the comment in the source names: counters derived from the raw
    // index, which counts the tests, above an outline that omits them. Measured: 84 in
    // 36 above a list of 78 in 26.
    assert.equal(r.archivos, Object.keys(outline).length);
    assert.equal(r.simbolos, Object.values(outline).reduce((n, xs) => n + xs.length, 0));
    assert.ok(r.archivos > 0, 'the index cannot be empty');

    // And with no tests: no file of the outline lives in `__tests__/`.
    assert.deepEqual(Object.keys(outline).filter(f => f.includes('__tests__')), []);
  });

  test('`includeTests` is the only thing that changes between the two views, and it adds', () => {
    const sin = call(findSymbol, { includeTests: false });
    const con = call(findSymbol, { includeTests: true });
    assert.ok((con.simbolos as number) > (sin.simbolos as number));
    assert.ok((con.archivos as number) > (sin.archivos as number));
  });

  test('with `name` it has the signature and the `usedBy` resolved by the graph, not by text', () => {
    const r = call(findSymbol, { name: 'notesForRotation', includeTests: false });
    const matches = r.matches as { name: string; file: string; usedBy: string[] }[];
    assert.equal(r.query, 'notesForRotation');
    assert.equal(r.nota, undefined, 'no miss and no cut: there is no note to give');

    const hit = matches.find(m => m.name === 'notesForRotation');
    assert.ok(hit, 'the symbol must be there');
    assert.equal(hit.file, 'src/musical-model/music.ts');
    // The edge that justifies the index of `mcp-server/` as graph only: without it
    // `usedBy` under-reports and the tool is poorer than the grep it replaces.
    assert.ok(
      hit.usedBy.some(f => f.startsWith('mcp-server/')),
      'a tool of the server imports this symbol, and that edge counts',
    );
    // Resolved by the graph and not by a text match: each user appears ONCE.
    assert.equal(new Set(hit.usedBy).size, hit.usedBy.length);
  });

  test('a miss is said, and is not a silent empty list', () => {
    const r = call(findSymbol, { name: 'noExisteEsteSimboloEnNingunLado', includeTests: false });
    assert.deepEqual(r.matches, []);
    assert.match(r.nota as string, /No exported symbol of src\/ matches/);
  });

  test('a cut is said too, which is different from a silent return of 20', () => {
    // A substring of one letter sweeps almost the whole index. The assertion is not on
    // how many there are, which changes with each new symbol. It is that the tool says
    // that it cut, and that the number in the note is the total and not the truncated
    // count.
    const r = call(findSymbol, { name: 'e', includeTests: false });
    const matches = r.matches as unknown[];
    assert.equal(matches.length, 20, 'the limit of the tool');
    assert.match(r.nota as string, /matches \d+ symbols by substring; these are the first 20/);
    const total = Number((r.nota as string).match(/matches (\d+) symbols/)![1]);
    assert.ok(total > matches.length, 'the note reports the total, not what fit');
  });
});

describe('simulate_board: the board has the size the caller gives', () => {
  test('with no `dims` it answers for the reference board', () => {
    // The compatibility: a query that gives no dimensions must answer for the reference
    // board. The oracle is the answer itself: `[9, 5]` is the last cell of the
    // reference board, so a piece that occupies it is valid, and a piece in column 10 is
    // not.
    const dentro = call(simulateBoard, { pieces: [{ piece: 'I', at: [7, 5] }] });
    assert.equal((dentro.placements as { valid: boolean }[])[0].valid, true);

    const afuera = call(simulateBoard, { pieces: [{ piece: 'I', at: [12, 2] }] });
    assert.equal((afuera.placements as { valid: boolean }[])[0].valid, false);
    assert.equal((afuera.placements as { reason: string }[])[0].reason, 'off-the-board');
  });

  test('with `dims` it answers for the board that the caller gives', () => {
    // The same placement that is off the 10 x 6 board fits on the board of a 1920 x
    // 1080 screen, which is 26 x 15. Without this parameter there would be no way to
    // ask the domain about the board that is on the screen.
    const r = call(simulateBoard, { pieces: [{ piece: 'I', at: [12, 2] }], dims: { w: 26, h: 15 } });
    assert.equal((r.placements as { valid: boolean }[])[0].valid, true);
  });

  test('the circuit changes with the dimensions, because the seam is the corners', () => {
    // It is not only the edge: the seam joins `(0,0)` with the opposite corner, so a
    // larger board moves one edge of the graph and the routes with it. Two boards with
    // equal pieces and different sizes have different cycles.
    //
    // The `Z` is at (8,4) and not at (7,4), and that was SEARCHED for: from (7,4) the
    // circuit is the same on the two boards, so that board would leave this test green
    // and exercise nothing. It is the same trap that the comment on the tie documents
    // in `sequence.test.ts`.
    const saltos = (r: Record<string, unknown>) => (r.route as { hops: unknown[] }).hops;
    const piezas = [{ piece: 'F', at: [1, 1] }, { piece: 'Z', at: [8, 4] }];
    const chico = call(simulateBoard, { pieces: piezas });
    const grande = call(simulateBoard, { pieces: piezas, dims: { w: 26, h: 15 } });
    assert.notDeepEqual(saltos(grande), saltos(chico));
  });
});
