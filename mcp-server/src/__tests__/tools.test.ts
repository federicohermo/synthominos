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
    for (const t of tools) {
      assert.ok(t.annotations, t.name);
      assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
      assert.equal(t.annotations.openWorldHint, false, t.name);
      assert.ok(t.title && t.title.length > 0, t.name);
    }
  });

  test('no tool writes', () => {
    assert.deepEqual(tools.filter(t => t.annotations?.readOnlyHint !== true).map(t => t.name), []);
  });

  test('an invalid argument does not reach the handler', () => {
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

    assert.deepEqual(f.cells, [[0, 1], [1, 0], [1, 1], [1, 2], [2, 2]]);
  });

  test('`scale` tells the regime, and in `orden` it gets the singular right', () => {
    const scale = (rotation: number, regimen: 'escala' | 'orden') =>
      call(describePiece, { piece: 'F', rotation, regimen }).scale;

    assert.equal(scale(0, REGIMEN.orden), 'major pentatonic, not shifted (rotation 0°)');
    assert.equal(scale(1, REGIMEN.orden), 'major pentatonic shifted 1 position (rotation 90°)');
    assert.equal(scale(2, REGIMEN.orden), 'major pentatonic shifted 2 positions (rotation 180°)');
    assert.equal(scale(3, REGIMEN.orden), 'major pentatonic shifted 3 positions (rotation 270°)');

    assert.notEqual(scale(0, REGIMEN.escala), scale(0, REGIMEN.orden));
  });

  test('the step is the degree with no reflection and its inverse with it, in the 96', () => {
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
    const escala = call(describePiece, { piece: 'F', rotation: 1, regimen: 'escala' });
    const orden = call(describePiece, { piece: 'F', rotation: 1, regimen: 'orden' });

    assert.equal(escala.regimen, 'escala');
    assert.equal(orden.regimen, 'orden');
    assert.notDeepEqual(
      (orden.notes as { midi: number }[]).map(n => n.midi),
      (escala.notes as { midi: number }[]).map(n => n.midi),
    );

    assert.match(String(escala.scale), /minor/);
    assert.doesNotMatch(String(orden.scale), /minor/);
    assert.match(String(orden.scale), /shifted 1 position \(/);

    const notaDe = (r: Record<string, unknown>) => (r.cellMap as { note: string }[]).map(c => c.note);
    assert.notDeepEqual(notaDe(orden), notaDe(escala));
  });

  test('at rotation 0 the two regimes give the same notes', () => {
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
    assert.equal(checks.length, 7);
    for (const c of checks) {
      assert.equal(c.ok, true, `${c.name}: ${c.failures.join(' · ')}`);
      assert.deepEqual(c.failures, []);
    }
    assert.deepEqual(r.modelSpace, { pieces: 12, orientationsPerPiece: 8, orientations: 96 });
  });

  test('the piece filter recognizes the prefix of the message and lets the global ones through', () => {
    assert.equal(pieceOf('Z rot3 mirror: cell 2 is (1,1)'), 'Z');
    assert.equal(pieceOf('F: has 4 cells and must have 5'), 'F');
    assert.equal(pieceOf('two pieces share a tonic'), null);
    assert.equal(pieceOf('Q: no such piece'), null);
  });

  test('with a real failure, the filter limits the messages and not the verdict', () => {
    const original = SHAPES.I;
    SHAPES.I = [[0, 0], [1, 0], [2, 0]];
    try {
      const formas = (r: Record<string, unknown>) =>
        (r.checks as { name: string; failures: string[]; failuresOtherPieces: number }[])
          .find(c => c.name === 'shapes')!;

      const sinFiltro = call(checkInvariants, {});
      assert.equal(sinFiltro.ok, false);
      assert.equal(formas(sinFiltro).failures.length, 1);
      assert.match(formas(sinFiltro).failures[0], /^I: has 3 cells/);
      assert.equal(formas(sinFiltro).failuresOtherPieces, 0);

      const conFiltro = call(checkInvariants, { piece: 'Z' });
      assert.equal(conFiltro.ok, false);
      assert.equal(conFiltro.scope, 'Z');
      assert.deepEqual(formas(conFiltro).failures, []);
      assert.equal(formas(conFiltro).failuresOtherPieces, 1);
    } finally {
      SHAPES.I = original;
    }
  });
});

describe('simulate_board', () => {
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

  /** Seconds. `at` has 4 decimals, so a delta is off by up to 2e-4; one interval is 0.1364 s at 110 bpm. */
  const EPS = 1e-3;

  /** Three pieces, with legs of 6, 4 and 8 moves. */
  const BASE = [
    { piece: 'F', at: [1, 1] },
    { piece: 'Z', at: [7, 4] },
    { piece: 'I', rotation: 1, at: [5, 2] },
  ];

  /** To go around the `X` at (1,1) costs more than to cross it. The crossing tests of `src/` use this board. */
  const CON_CRUCE = [
    { piece: 'X', at: [1, 1] },
    { piece: 'F', at: [3, 2] },
    { piece: 'N', at: [2, 4] },
  ];

  test('the order is that of the circuit, not that of placement', () => {
    const r = call(simulateBoard, {
      pieces: [
        { piece: 'I', rotation: 1, at: [0, 2] },
        { piece: 'I', rotation: 1, at: [9, 2] },
        { piece: 'I', rotation: 1, at: [5, 2] },
      ],
    });
    assert.deepEqual(ruta(r).order, ['1', '3', '2']);
    assert.equal(ciclo(r).intervals, 31);
    assert.equal(cuentas(r).clicks, 32);
    assert.equal(cuentas(r).crosses, 0);
    assert.equal(cuentas(r).clicks + cuentas(r).crosses, 32);
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

    const eventos = linea(r);
    const clicks = eventos.slice(CELLS_PER_PIECE, CELLS_PER_PIECE + hops[0].path.length);
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
    for (const pieces of [BASE, [{ piece: 'F', at: [1, 1] }, { piece: 'Z', at: [7, 4] }]]) {
      const r = call(simulateBoard, { pieces });
      assert.ok(ruta(r).hops.length > 0, 'the board has legs to compare');
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
    for (const piece of ['X', 'Z', 'I', 'F'] as const) {
      const r = call(simulateBoard, { pieces: [{ piece, at: [5, 2] }] });
      assert.deepEqual(ruta(r).order, ['1'], piece);
      assert.deepEqual(ruta(r).hops, [], piece);
      assert.equal(cuentas(r).clicks, 0, piece);
      assert.equal(ciclo(r).intervals, CELLS_PER_PIECE, piece);
    }
  });

  test('a click can fall on an occupied cell, and the answer shows it', () => {
    const r = call(simulateBoard, { pieces: CON_CRUCE });
    const ocupadas = new Set(
      (r.placements as { cells: Cell[] }[]).flatMap(p => p.cells).map(([x, y]) => `${x},${y}`),
    );
    const pisados = ruta(r).hops.flatMap(h => h.path).filter(([x, y]) => ocupadas.has(`${x},${y}`));
    assert.ok(pisados.length > 0, 'this board has clicks on occupied cells');
  });

  test('the crossing on a piece has the note that the cell shows', () => {
    const r = call(simulateBoard, { pieces: CON_CRUCE });
    const hops = ruta(r).hops;
    assert.deepEqual(hops.map(h => h.crossed.length), [1, 0, 2]);
    assert.deepEqual(hops[0].crossed, [{ cell: [2, 1], note: 'A4' }]);
    assert.deepEqual(hops[2].crossed, [{ cell: [1, 2], note: 'B4' }, { cell: [1, 1], note: 'E5' }]);
  });

  test('with no crossings the list is empty, never absent', () => {
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
    assert.deepEqual(ciclo(r), { intervals: 0, seconds: 0 });
    assert.deepEqual(ruta(r), { order: [], hops: [] });
  });

  test('overlap: the reason names the piece it collided with', () => {
    const r = call(simulateBoard, { pieces: [{ piece: 'F', at: [2, 1] }, { piece: 'F', at: [2, 1] }] });
    const ps = r.placements as { id: string; valid: boolean; reason?: string }[];
    assert.equal(ps[0].valid, true);
    assert.equal(ps[1].valid, false);
    assert.equal(ps[1].reason, 'collides-with-1');
    assert.equal(cuentas(r).notes, 10);
    assert.deepEqual(ruta(r).order, ['1']);
  });

  test('a rejected placement leaves no obstacle on the board', () => {
    const r = call(simulateBoard, {
      pieces: [{ piece: 'F', at: [2, 1] }, { piece: 'F', at: [2, 1] }, { piece: 'F', at: [7, 1] }],
    });
    assert.deepEqual((r.placements as { valid: boolean }[]).map(p => p.valid), [true, false, true]);
    assert.deepEqual(ruta(r).order, ['1', '3']);
  });

  test('the event count grows with the cycles and not with the tempo', () => {
    const piezas = [{ piece: 'F', at: [2, 1] }];
    const dos = call(simulateBoard, { pieces: piezas });
    const cuatro = call(simulateBoard, { pieces: piezas, cycles: 4 });
    const rapido = call(simulateBoard, { pieces: piezas, bpm: 200 });

    assert.equal(ciclo(dos).intervals, 5);
    assert.equal(cuentas(dos).clicks, 0);
    assert.equal(cuentas(dos).total, 10);
    assert.equal(cuentas(cuatro).total, 20);
    assert.equal(cuentas(rapido).total, 10);
    assert.equal(ciclo(rapido).intervals, ciclo(dos).intervals);
    assert.ok(ciclo(rapido).seconds < ciclo(dos).seconds);
    assert.ok((rapido.barSeconds as number) < (dos.barSeconds as number));
    assert.equal(dos.intervalSeconds, 0.1364);
    assert.equal(rapido.intervalSeconds, 0.075);
  });

  test('the board sets the cycle and not the tempo: two boards, two cycles', () => {
    const una = call(simulateBoard, { pieces: [{ piece: 'X', at: [5, 2] }] });
    const tres = call(simulateBoard, { pieces: BASE });
    assert.equal(ciclo(una).intervals, 5);
    assert.equal(ciclo(tres).intervals, 30);
    assert.equal(ciclo(tres).seconds, 4.0909);
  });

  test('no event is emitted twice despite the overlap of the windows', () => {
    const r = call(simulateBoard, { pieces: [{ piece: 'X', at: [5, 2] }], cycles: 3 });
    assert.equal(cuentas(r).total, 15);
    assert.equal(cuentas(r).distinctInstants, 15);
    assert.equal(cuentas(r).total, 3 * ciclo(r).intervals);
  });

  test('AC-MUS-015 — the regime moves the pitches and NOT the circuit, and the answer says so', () => {
    // Rotated: at rotation 0 the two regimes are identical, and this test would pass empty.
    const rotadas = [
      { piece: 'F', rotation: 1, at: [1, 1] },
      { piece: 'Z', rotation: 2, at: [7, 4] },
      { piece: 'I', rotation: 1, at: [5, 2] },
    ];
    const escala = call(simulateBoard, { pieces: rotadas, regimen: 'escala' });
    const orden = call(simulateBoard, { pieces: rotadas, regimen: 'orden' });

    assert.equal(escala.regimen, 'escala');
    assert.equal(orden.regimen, 'orden');

    assert.deepEqual(ruta(orden).order, ruta(escala).order);
    assert.deepEqual(ruta(orden).hops.map(h => h.distance), ruta(escala).hops.map(h => h.distance));
    assert.deepEqual(ciclo(orden), ciclo(escala));

    const notas = (r: Record<string, unknown>) => linea(r).map(e => e.note ?? null);
    assert.deepEqual(linea(orden).map(e => e.at), linea(escala).map(e => e.at));
    assert.notDeepEqual(notas(orden), notas(escala));
  });

  test('with no `regimen` it simulates `escala`, the one of the app', () => {
    const porOmision = call(simulateBoard, { pieces: BASE });
    assert.equal(porOmision.regimen, 'escala');
  });

  test('AC-PLY-024 — a muted piece reports its clicks and not its arpeggio', () => {
    const normal = call(simulateBoard, { pieces: CON_CRUCE, cycles: 1 });
    const conMute = call(simulateBoard, {
      pieces: CON_CRUCE.map((p, i) => i === 0 ? { ...p, muted: true } : p),
      cycles: 1,
    });

    assert.deepEqual(ruta(conMute).order, ruta(normal).order);
    assert.deepEqual(ruta(conMute).hops.map(h => h.distance), ruta(normal).hops.map(h => h.distance));
    assert.equal(ciclo(conMute).intervals, ciclo(normal).intervals);

    assert.ok(ruta(conMute).order.includes('1'));
    assert.equal((r => (r.placements as { muted: boolean }[])[0].muted)(conMute), true);

    assert.equal(cuentas(conMute).notes, cuentas(normal).notes - 5);
    assert.equal(cuentas(conMute).total, cuentas(normal).total);
    assert.ok(cuentas(normal).crosses > 0, 'this board really crosses');
    assert.equal(cuentas(conMute).crosses, 0);
    assert.deepEqual(ruta(conMute).hops.flatMap(h => h.crossed), []);
  });

  test('the reflection reaches the simulation: same cells, arpeggio reversed', () => {
    // The `X`: the mirror does not change its shape, so only the retrograde differs.
    const enX = (mirror: boolean) =>
      call(simulateBoard, { pieces: [{ piece: 'X', at: [2, 2], mirror }], cycles: 1 });
    const derecho = enX(false);
    const espejo = enX(true);

    const celdas = (r: Record<string, unknown>) =>
      new Set((r.placements as { cells: Cell[] }[])[0].cells.map(c => c.join(',')));
    assert.deepEqual(celdas(espejo), celdas(derecho), 'on the X the mirror does not show');

    const notas = (r: Record<string, unknown>) =>
      linea(r).filter(e => e.note !== undefined).map(e => e.note);
    assert.equal(notas(derecho).length, NOTES_PER_PIECE);
    assert.deepEqual(notas(espejo), [...notas(derecho)].reverse());
  });

  test('an `hz` that the map does not know is said in Hz, not as `undefined`', () => {
    const mapa = new Map([[440, 'A4']]);
    assert.equal(nombreDeHz(mapa, 440), 'A4');
    assert.equal(nombreDeHz(mapa, 523.2511), '523Hz');
  });
});

/** On the real repo. Assert the shape of the answer, never its content: a new symbol must not break it. */
describe('find_symbol', () => {
  test('with no `name` it returns the whole outline, and the counters are those of the map that travels', () => {
    const r = call(findSymbol, { includeTests: false });
    const outline = r.outline as Record<string, string[]>;

    assert.equal(r.archivos, Object.keys(outline).length);
    assert.equal(r.simbolos, Object.values(outline).reduce((n, xs) => n + xs.length, 0));
    assert.ok(r.archivos > 0, 'the index cannot be empty');

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
    assert.ok(
      hit.usedBy.some(f => f.startsWith('mcp-server/')),
      'a tool of the server imports this symbol, and that edge counts',
    );
    assert.equal(new Set(hit.usedBy).size, hit.usedBy.length);
  });

  test('a miss is said, and is not a silent empty list', () => {
    const r = call(findSymbol, { name: 'noExisteEsteSimboloEnNingunLado', includeTests: false });
    assert.deepEqual(r.matches, []);
    assert.match(r.nota as string, /No exported symbol of src\/ matches/);
  });

  test('a cut is said too, which is different from a silent return of 20', () => {
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
    const dentro = call(simulateBoard, { pieces: [{ piece: 'I', at: [7, 5] }] });
    assert.equal((dentro.placements as { valid: boolean }[])[0].valid, true);

    const afuera = call(simulateBoard, { pieces: [{ piece: 'I', at: [12, 2] }] });
    assert.equal((afuera.placements as { valid: boolean }[])[0].valid, false);
    assert.equal((afuera.placements as { reason: string }[])[0].reason, 'off-the-board');
  });

  test('with `dims` it answers for the board that the caller gives', () => {
    // 26 x 15 is the board of a 1920 x 1080 screen.
    const r = call(simulateBoard, { pieces: [{ piece: 'I', at: [12, 2] }], dims: { w: 26, h: 15 } });
    assert.equal((r.placements as { valid: boolean }[])[0].valid, true);
  });

  test('the circuit changes with the dimensions, because the seam is the corners', () => {
    // The `Z` at (8,4), not (7,4): from (7,4) the circuit is the same on the two boards, and the
    // test exercises nothing.
    const saltos = (r: Record<string, unknown>) => (r.route as { hops: unknown[] }).hops;
    const piezas = [{ piece: 'F', at: [1, 1] }, { piece: 'Z', at: [8, 4] }];
    const chico = call(simulateBoard, { pieces: piezas });
    const grande = call(simulateBoard, { pieces: piezas, dims: { w: 26, h: 15 } });
    assert.notDeepEqual(saltos(grande), saltos(chico));
  });
});
