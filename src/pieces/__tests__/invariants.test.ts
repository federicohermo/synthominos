import { describe, it, expect, vi } from 'vitest';
import {
  checkArrayOrder,
  checkAnchors,
  checkShapes,
  checkBaseMap,
  checkNotes,
  checkDistinct,
  checkLetters,
  checkAll,
  PENTOMINOS_CANONICOS,
} from '../invariants.ts';
import { SHAPES } from '../pieces.ts';
import { BASE_MAP, PENT_MAJOR, REGIMEN } from '../../musical-model/music.ts';
import type { Cell } from '../transform.ts';
import type { PieceKey } from '../pieces.ts';

describe('the seven checks over the 96 combinations', () => {
  it('AC-PCS-015 — array order', () => {
    const r = checkArrayOrder();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('AC-PCS-016 — grip cell', () => {
    const r = checkAnchors();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('AC-PCS-001 — shapes', () => {
    const r = checkShapes();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('AC-MUS-002 — BASE_MAP', () => {
    const r = checkBaseMap();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('AC-MUS-001 — notes', () => {
    const r = checkNotes();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('AC-PCS-003 — distinct pieces', () => {
    const r = checkDistinct();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('AC-PCS-006 — letters', () => {
    const r = checkLetters();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('checkAll returns the seven, all passing', () => {
    const all = checkAll();
    expect(all).toHaveLength(7);
    expect(all.map(r => r.name)).toEqual([
      'orden del array', 'ancla', 'formas', 'BASE_MAP', 'notas', 'piezas distintas', 'letras',
    ]);
    expect(all.every(r => r.ok)).toBe(true);
  });

  it('they return a result and do not throw: the tool needs that', () => {
    // If they asserted, the tool `check_invariants` could not answer with the detail.
    expect(() => checkAll()).not.toThrow();
    for (const r of checkAll()) expect(Array.isArray(r.failures)).toBe(true);
  });
});

/**
 * A check that never failed proves nothing.
 *
 * These tests mutate the tables by hand to confirm that each check DETECTS its
 * regression. The `finally` restores them, because `SHAPES` is a module shared by the
 * test files of the process.
 */
describe('the checks detect a regression', () => {
  /** Runs `fn` with `SHAPES[p]` replaced, and then puts it back. */
  function conFormaMutada(p: PieceKey, cells: Cell[], fn: () => void): void {
    const original = SHAPES[p];
    SHAPES[p] = cells;
    try { fn(); } finally { SHAPES[p] = original; }
  }

  it('checkShapes sees a repeated cell', () => {
    conFormaMutada('I', [[0,0],[0,0],[2,0],[3,0],[4,0]], () => {
      const r = checkShapes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('repetidas'))).toBe(true);
    });
  });

  it('checkShapes sees a shape with fewer than 5 cells', () => {
    conFormaMutada('I', [[0,0],[1,0],[2,0]], () => {
      const r = checkShapes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('3 celdas'))).toBe(true);
    });
  });

  it('checkShapes sees a disconnected shape', () => {
    conFormaMutada('I', [[0,0],[1,0],[2,0],[3,0],[9,9]], () => {
      const r = checkShapes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('conexa'))).toBe(true);
    });
  });

  it('AC-PCS-002 — checkShapes does NOT accept a connection by a diagonal', () => {
    conFormaMutada('I', [[0,0],[1,0],[2,0],[3,0],[4,1]], () => {
      expect(checkShapes().ok).toBe(false);
    });
  });

  /**
   * The most dangerous regression of the repo, and the reason for check 1.
   *
   * If a transformation reordered the cells, the SET would be the same and the piece
   * would draw the same, but `ANCHOR_INDEX` would stop pointing at the grip cell. It
   * gives no visible error.
   *
   * The test replaces `rotateN` with a version that returns the same cells in reverse.
   * To mutate the table is not enough: `SHAPES.I` written in another order breaks
   * nothing, because the functions keep the order of THEIR input. What the check detects
   * is a TRANSFORMATION that reorders.
   */
  it('checkArrayOrder fails if a transformation reorders the cells', async () => {
    vi.resetModules();
    vi.doMock('../transform.ts', async () => {
      const real = await vi.importActual<typeof import('../transform.ts')>('../transform.ts');
      return { ...real, rotateN: (cells: Cell[], n: number) => [...real.rotateN(cells, n)].reverse() };
    });
    try {
      const { checkArrayOrder: conReordenamiento } = await import('../invariants.ts');
      const r = conReordenamiento();
      expect(r.ok).toBe(false);
      expect(r.failures.length).toBeGreaterThan(0);
    } finally {
      vi.doUnmock('../transform.ts');
      vi.resetModules();
    }
  });

  /**
   * The bug that is the reason for the check, reproduced with a shape the `Z` really
   * had: `[[0,1],[1,1],[1,0],[2,0],[3,0]]` is the reflected `N`.
   *
   * The five checks that look at one piece at a time accept it (five cells, none
   * repeated, connected), because none compares two SHAPES: the only one of them that
   * compares pieces is `checkBaseMap`, by their tonic.
   */
  it('AC-PCS-004 — checkDistinct sees the Z that is the reflected N', () => {
    conFormaMutada('Z', [[0,1],[1,1],[1,0],[2,0],[3,0]], () => {
      expect(checkShapes().ok).toBe(true);   // check 3 does not see it, and that is the point

      const r = checkDistinct();
      expect(r.ok).toBe(false);
      expect(r.failures).toEqual(['Z: es la misma forma que N rotada o reflejada']);
    });
  });

  /**
   * A distinct shape with its cells in another order is NOT a duplicate: the check
   * compares sets, not arrays.
   *
   * Without the `sort()` of `canonicalKey`, this `N` (the same piece, another order)
   * would read as a new piece and the real duplicate would pass.
   */
  it('AC-PCS-005 — checkDistinct compares the set and not the order of the array', () => {
    conFormaMutada('N', [[3,1],[2,1],[1,1],[1,0],[0,0]], () => {
      const r = checkDistinct();
      expect(r.ok).toBe(true);
    });
  });

  /** Runs `fn` with the shapes of `a` and `b` swapped, and then restores them. */
  function conLetrasIntercambiadas(a: PieceKey, b: PieceKey, fn: () => void): void {
    const formaA = SHAPES[a];
    const formaB = SHAPES[b];
    SHAPES[a] = formaB;
    SHAPES[b] = formaA;
    try { fn(); } finally { SHAPES[a] = formaA; SHAPES[b] = formaB; }
  }

  /**
   * The gap that `checkDistinct` leaves open, measured.
   *
   * A SWAP of two letters does not change the set of the 12 canonical keys, so
   * `checkDistinct` has nothing to complain about: it still sees 12 distinct shapes. But
   * the board sounds swapped, because the letter gives the piece its tonic through
   * `BASE_MAP`. It is the same failure mode as that of the `Z`, one level up: not "one is
   * repeated" but "this one is not what it says it is".
   *
   * The two halves of the statement are in the SAME test on purpose: that `checkLetters`
   * fails is worth nothing if the test does not show, next to it, that `checkDistinct`
   * passes.
   */
  it('AC-PCS-007 — checkLetters sees an L swapped with the Y, which checkDistinct does not see', () => {
    conLetrasIntercambiadas('L', 'Y', () => {
      const distinct = checkDistinct();
      expect(distinct.ok).toBe(true);          // check 6 does not see it, and that is the point
      expect(distinct.failures).toEqual([]);

      const r = checkLetters();
      expect(r.ok).toBe(false);
      expect(r.failures).toEqual([
        'L: no es el pentomino L, es el Y',
        'Y: no es el pentomino Y, es el L',
      ]);
    });
  });

  /**
   * A shape that is NONE of the 12 is reported as such, and no culprit is invented.
   *
   * The message of the case before comes from a search for the letter that the shape is.
   * When that search finds nothing (here, five disconnected cells), a message that ends
   * in `es el undefined` would send the reader to a piece that has nothing to do with it.
   */
  it('AC-PCS-008 — checkLetters invents no letter for a shape that is not a pentomino', () => {
    conFormaMutada('Z', [[0,0],[1,0],[2,0],[3,0],[9,9]], () => {
      const r = checkLetters();
      expect(r.ok).toBe(false);
      expect(r.failures).toEqual(['Z: no es el pentomino Z, ni ningun otro de los 12']);
    });
  });

  /**
   * The reference table must stay 12 pentominoes, each distinct from the others.
   *
   * `checkLetters` is useful only with this property: if two entries of
   * `PENTOMINOS_CANONICOS` were the same shape, a `SHAPES` with those two letters swapped
   * would pass the check. It is verified on the TABLE and not on `SHAPES`, which
   * `checkDistinct` covers. And it is not derived from `SHAPES`, for the same reason that
   * the table is not derived from `SHAPES`.
   */
  it('the reference table is 12 distinct pentominoes', () => {
    const letras = Object.keys(PENTOMINOS_CANONICOS) as PieceKey[];
    expect(letras).toHaveLength(12);

    // They are compared by putting the table IN `SHAPES` and asking `checkDistinct`,
    // which knows how to reduce a shape to its canonical key. To write that reduction
    // again here would be the second copy that the docblock of `canonicalKey` forbids.
    const originales = letras.map(p => SHAPES[p]);
    for (const p of letras) SHAPES[p] = PENTOMINOS_CANONICOS[p];
    try {
      expect(checkDistinct().failures).toEqual([]);
      // And each one has five cells, connected: they are pentominoes and nothing else.
      expect(checkShapes().failures).toEqual([]);
    } finally {
      letras.forEach((p, i) => { SHAPES[p] = originales[i]; });
    }
  });

  it('checkBaseMap sees two pieces with the same tonic', () => {
    const original = BASE_MAP.Z;
    BASE_MAP.Z = BASE_MAP.F;
    try {
      const r = checkBaseMap();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('comparten tonica'))).toBe(true);
    } finally {
      BASE_MAP.Z = original;
    }
  });

  it('checkNotes sees a scale that stops ascending', () => {
    const original = PENT_MAJOR.slice();
    PENT_MAJOR[3] = 0;   // the fourth note stops being higher than the one before
    try {
      const r = checkNotes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('no supera'))).toBe(true);
    } finally {
      PENT_MAJOR.splice(0, PENT_MAJOR.length, ...original);
    }
  });

  it('checkAnchors sees an ANCHOR_INDEX out of range', () => {
    conFormaMutada('I', [[0,0],[1,0]], () => {
      // ANCHOR_INDEX.I is 2, and the mutated shape has 2 cells: the index is out of range.
      const r = checkAnchors();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('fuera de'))).toBe(true);
    });
  });

  /**
   * The corollary of check 1, broken the same way and verified apart on purpose.
   *
   * With the grip cell IN RANGE (past the `continue` of the case before), what is left to
   * assert is that the grip cell is still the grip cell after a transformation. The click
   * falls where the user pointed because of this property, and it breaks with no symptom:
   * the piece draws the same.
   */
  it('checkAnchors fails if a transformation reorders the cells', async () => {
    vi.resetModules();
    vi.doMock('../transform.ts', async () => {
      const real = await vi.importActual<typeof import('../transform.ts')>('../transform.ts');
      return { ...real, rotateN: (cells: Cell[], n: number) => [...real.rotateN(cells, n)].reverse() };
    });
    try {
      const { checkAnchors: conReordenamiento } = await import('../invariants.ts');
      const r = conReordenamiento();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('el ancla quedo en'))).toBe(true);
      // The two halves of the space and not one: the message tells the reflected
      // orientation from the other, and that makes the regression locatable.
      expect(r.failures.some(f => f.includes('mirror'))).toBe(true);
      expect(r.failures.some(f => !f.includes('mirror'))).toBe(true);
    } finally {
      vi.doUnmock('../transform.ts');
      vi.resetModules();
    }
  });

  /**
   * The empty case of `isConnected`, which is not theoretical: a shape that lost all its
   * cells reaches it.
   *
   * The assertion is that the check REPORTS the short shape and does not break on a read
   * of `cells[0]` from an empty array.
   */
  it('checkShapes sees a shape with no cells and does not crash on a search for the first', () => {
    conFormaMutada('I', [], () => {
      const r = checkShapes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('0 celdas'))).toBe(true);
      // And it does NOT report it as disconnected: an empty set is connected vacuously,
      // and to say the two things would send the reader to look for a hole that does not
      // exist.
      expect(r.failures.some(f => f.includes('conexa'))).toBe(false);
    });
  });

  it('checkBaseMap sees one pitch class too many', async () => {
    vi.resetModules();
    vi.doMock('../../musical-model/music.ts', async () => {
      const real = await vi.importActual<typeof import('../../musical-model/music.ts')>(
        '../../musical-model/music.ts',
      );
      // Thirteen classes for twelve pieces: the bijection breaks on the side that no
      // other check looks at, because each tonic is still in range and not repeated.
      return { ...real, CHROMATIC: [...real.CHROMATIC, 'X'] };
    });
    try {
      const { checkBaseMap: conCromaticaLarga } = await import('../invariants.ts');
      const r = conCromaticaLarga();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('12 piezas para 13 clases'))).toBe(true);
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  });

  /**
   * The three ways to be out of range, each one apart.
   *
   * The guard is `!Number.isInteger(pc) || pc < 0 || pc >= CHROMATIC.length`: three
   * chained conditions, and one case alone leaves the other two not exercised. What is
   * not exercised is exactly where a `>` gets written for a `>=`.
   */
  it.each([
    ['above the range', 99],
    ['that is negative', -1],
    ['that is a fraction', 1.5],
  ])('checkBaseMap sees a tonic %s', (_caso, valor) => {
    const original = BASE_MAP.Z;
    BASE_MAP.Z = valor;
    try {
      const r = checkBaseMap();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes(`Z: tonica ${valor} fuera de`))).toBe(true);
    } finally {
      BASE_MAP.Z = original;
    }
  });

  /**
   * The check that the docblock of `checkNotes` explains.
   *
   * Without it, a formula of four notes with `NOTES_PER_PIECE = 4` passes every other
   * check and every test, and the cell of degree 4 renders `undefinedNaN`.
   *
   * It is broken on the cheap side (the constant, not the formula), and that gives the
   * two messages: that of the pair that stopped being equal, and that of the arpeggio
   * that now has one note more than the constant declares.
   */
  it('checkNotes sees that NOTES_PER_PIECE stopped being equal to CELLS_PER_PIECE', async () => {
    vi.resetModules();
    vi.doMock('../../musical-model/music.ts', async () => {
      const real = await vi.importActual<typeof import('../../musical-model/music.ts')>(
        '../../musical-model/music.ts',
      );
      return { ...real, NOTES_PER_PIECE: 4 };
    });
    try {
      const { checkNotes: conCuatroNotas } = await import('../invariants.ts');
      const r = conCuatroNotas();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('tienen que ser iguales'))).toBe(true);
      expect(r.failures.some(f => f.includes('5 notas y deberian ser 4'))).toBe(true);
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  });

  /**
   * The check of rotation 0, verified with the exact mutation that its comment names.
   *
   * `checkNotes` compares the arpeggio of the order regime with that of rotation 0 of the
   * SAME regime, so a uniform shift (`(j + rot + 1)` in place of `(j + rot)`) moves the
   * reference with the rest, and the cyclic permutation still closes. The only thing that
   * catches it is to demand that rotation 0 of the order regime is that of the scale
   * regime.
   */
  it('checkNotes sees a uniform shift, which the cyclic permutation does not see', async () => {
    vi.resetModules();
    vi.doMock('../../musical-model/music.ts', async () => {
      const real = await vi.importActual<typeof import('../../musical-model/music.ts')>('../../musical-model/music.ts');
      return {
        ...real,
        notesForRotation: (basePc: number, octave: number, rot: number, regimen: typeof REGIMEN[keyof typeof REGIMEN]) =>
          regimen === REGIMEN.orden
            ? real.notesForRotation(basePc, octave, rot + 1, REGIMEN.orden)
            : real.notesForRotation(basePc, octave, rot, regimen),
      };
    });
    try {
      const { checkNotes: conCorrimientoUniforme } = await import('../invariants.ts');
      const r = conCorrimientoUniforme();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('tienen que dar lo mismo a rotacion 0'))).toBe(true);
      // And the cyclic permutation does NOT complain: it is exactly the blind spot that
      // the check of rotation 0 covers.
      expect(r.failures.some(f => f.includes('rompe la permutacion ciclica'))).toBe(false);
      expect(r.failures.some(f => f.includes('corrido'))).toBe(false);
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  });

  /**
   * The hole that the double modulo of `notesForRotation` closes: an arpeggio of the
   * order regime whose first note is not in that of rotation 0.
   *
   * Without this path, the `indexOf` that returns -1 would be used as an index all the
   * same, and the check would report a broken permutation and not the real problem.
   */
  it('checkNotes sees an arpeggio of the order regime that does not come from that of rotation 0', async () => {
    vi.resetModules();
    vi.doMock('../../musical-model/music.ts', async () => {
      const real = await vi.importActual<typeof import('../../musical-model/music.ts')>('../../musical-model/music.ts');
      return {
        ...real,
        notesForRotation: (basePc: number, octave: number, rot: number, regimen: typeof REGIMEN[keyof typeof REGIMEN]) =>
          regimen === REGIMEN.orden && rot !== 0
            ? [900, 901, 902, 903, 904]
            : real.notesForRotation(basePc, octave, rot, regimen),
      };
    });
    try {
      const { checkNotes: conArpegioAjeno } = await import('../invariants.ts');
      const r = conArpegioAjeno();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('que no esta en el arpegio de rotacion 0'))).toBe(true);
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  });
});
