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
import { SHAPES, ANCHOR_INDEX } from '../pieces.ts';
import { BASE_MAP, DEFAULT_OCTAVE, PENT_MAJOR, REGIMEN, notesForRotation } from '../../musical-model/music.ts';
import type { Cell } from '../transform.ts';
import type { PieceKey } from '../pieces.ts';
import type { RegimenDeRotacion } from '../../musical-model/music.ts';

const PIEZAS = Object.keys(SHAPES) as PieceKey[];

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
      'array order', 'grip cell', 'shapes', 'BASE_MAP', 'notes', 'distinct pieces', 'letters',
    ]);
    expect(all.every(r => r.ok)).toBe(true);
  });

  it('they return a result and do not throw: the tool needs that', () => {
    expect(() => checkAll()).not.toThrow();
    for (const r of checkAll()) expect(Array.isArray(r.failures)).toBe(true);
  });
});

describe('the checks detect a regression', () => {
  function conFormaMutada(p: PieceKey, cells: Cell[], fn: () => void): void {
    const original = SHAPES[p];
    SHAPES[p] = cells;
    try { fn(); } finally { SHAPES[p] = original; }
  }

  it('checkShapes sees a repeated cell', () => {
    conFormaMutada('I', [[0,0],[0,0],[2,0],[3,0],[4,0]], () => {
      const r = checkShapes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('repeated'))).toBe(true);
    });
  });

  it('checkShapes sees a shape with fewer than 5 cells', () => {
    conFormaMutada('I', [[0,0],[1,0],[2,0]], () => {
      const r = checkShapes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('3 cells'))).toBe(true);
    });
  });

  it('checkShapes sees a disconnected shape', () => {
    conFormaMutada('I', [[0,0],[1,0],[2,0],[3,0],[9,9]], () => {
      const r = checkShapes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('connected'))).toBe(true);
    });
  });

  it('AC-PCS-002 — checkShapes does NOT accept a connection by a diagonal', () => {
    conFormaMutada('I', [[0,0],[1,0],[2,0],[3,0],[4,1]], () => {
      expect(checkShapes().ok).toBe(false);
    });
  });

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

  it('AC-PCS-004 — checkDistinct sees the Z that is the reflected N', () => {
    conFormaMutada('Z', [[0,1],[1,1],[1,0],[2,0],[3,0]], () => {
      expect(checkShapes().ok).toBe(true);

      const r = checkDistinct();
      expect(r.ok).toBe(false);
      expect(r.failures).toEqual(['Z: is the same shape as N, rotated or reflected']);
    });
  });

  it('AC-PCS-005 — checkDistinct compares the set and not the order of the array', () => {
    conFormaMutada('N', [[3,1],[2,1],[1,1],[1,0],[0,0]], () => {
      const r = checkDistinct();
      expect(r.ok).toBe(true);
    });
  });

  function conLetrasIntercambiadas(a: PieceKey, b: PieceKey, fn: () => void): void {
    const formaA = SHAPES[a];
    const formaB = SHAPES[b];
    SHAPES[a] = formaB;
    SHAPES[b] = formaA;
    try { fn(); } finally { SHAPES[a] = formaA; SHAPES[b] = formaB; }
  }

  it('AC-PCS-007 — checkLetters sees an L swapped with the Y, which checkDistinct does not see', () => {
    conLetrasIntercambiadas('L', 'Y', () => {
      const distinct = checkDistinct();
      expect(distinct.ok).toBe(true);
      expect(distinct.failures).toEqual([]);

      const r = checkLetters();
      expect(r.ok).toBe(false);
      expect(r.failures).toEqual([
        'L: is not the pentomino L, it is the Y',
        'Y: is not the pentomino Y, it is the L',
      ]);
    });
  });

  it('AC-PCS-008 — checkLetters invents no letter for a shape that is not a pentomino', () => {
    conFormaMutada('Z', [[0,0],[1,0],[2,0],[3,0],[9,9]], () => {
      const r = checkLetters();
      expect(r.ok).toBe(false);
      expect(r.failures).toEqual(['Z: is not the pentomino Z, and no other of the 12']);
    });
  });

  it('the reference table is 12 distinct pentominoes', () => {
    const letras = Object.keys(PENTOMINOS_CANONICOS) as PieceKey[];
    expect(letras).toHaveLength(12);

    const originales = letras.map(p => SHAPES[p]);
    for (const p of letras) SHAPES[p] = PENTOMINOS_CANONICOS[p];
    try {
      expect(checkDistinct().failures).toEqual([]);
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
      expect(r.failures.some(f => f.includes('share a tonic'))).toBe(true);
    } finally {
      BASE_MAP.Z = original;
    }
  });

  it('checkNotes sees a scale that stops ascending', () => {
    const original = PENT_MAJOR.slice();
    PENT_MAJOR[3] = 0;
    try {
      const r = checkNotes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('is not above'))).toBe(true);
    } finally {
      PENT_MAJOR.splice(0, PENT_MAJOR.length, ...original);
    }
  });

  it('checkAnchors sees an ANCHOR_INDEX out of range', () => {
    conFormaMutada('I', [[0,0],[1,0]], () => {
      // ANCHOR_INDEX.I is 2, and the mutated shape has 2 cells: the index is out of range.
      const r = checkAnchors();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('is outside'))).toBe(true);
    });
  });

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
      expect(r.failures.some(f => f.includes('the grip cell is at'))).toBe(true);
      expect(r.failures.some(f => f.includes('mirror'))).toBe(true);
      expect(r.failures.some(f => !f.includes('mirror'))).toBe(true);
    } finally {
      vi.doUnmock('../transform.ts');
      vi.resetModules();
    }
  });

  it('checkShapes sees a shape with no cells and does not crash on a search for the first', () => {
    conFormaMutada('I', [], () => {
      const r = checkShapes();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('0 cells'))).toBe(true);
      expect(r.failures.some(f => f.includes('connected'))).toBe(false);
    });
  });

  it('checkBaseMap sees one pitch class too many', async () => {
    vi.resetModules();
    vi.doMock('../../musical-model/music.ts', async () => {
      const real = await vi.importActual<typeof import('../../musical-model/music.ts')>(
        '../../musical-model/music.ts',
      );
      return { ...real, CHROMATIC: [...real.CHROMATIC, 'X'] };
    });
    try {
      const { checkBaseMap: conCromaticaLarga } = await import('../invariants.ts');
      const r = conCromaticaLarga();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes('12 pieces for 13 pitch classes'))).toBe(true);
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  });

  it.each([
    ['above the range', 99],
    ['equal to the count of pitch classes', 12],
    ['that is negative', -1],
    ['that is a fraction', 1.5],
  ])('checkBaseMap sees a tonic %s', (_caso, valor) => {
    const original = BASE_MAP.Z;
    BASE_MAP.Z = valor;
    try {
      const r = checkBaseMap();
      expect(r.ok).toBe(false);
      expect(r.failures.some(f => f.includes(`Z: tonic ${valor} is outside`))).toBe(true);
    } finally {
      BASE_MAP.Z = original;
    }
  });

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
      expect(r.failures.some(f => f.includes('must be equal'))).toBe(true);
      expect(r.failures.some(f => f.includes('5 notes and must be 4'))).toBe(true);
      expect(r.failures).toEqual([
        'NOTES_PER_PIECE (4) and CELLS_PER_PIECE (5) must be equal: each cell fires its note',
        ...PIEZAS.flatMap(p => Object.values(REGIMEN).flatMap(regimen =>
          [0, 1, 2, 3].map(rot => `${p} rot${rot} [${regimen}]: 5 notes and must be 4`),
        )),
      ]);
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  });

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
      expect(r.failures.some(f => f.includes('must give the same notes at rotation 0'))).toBe(true);
      expect(r.failures.some(f => f.includes('breaks the cyclic permutation'))).toBe(false);
      expect(r.failures.some(f => f.includes('shifted'))).toBe(false);
      expect(r.failures[0]).toBe(
        'F rot0: the two regimes must give the same notes at rotation 0 ' +
        '(escala 60,62,64,67,69 vs orden 62,64,67,69,60)',
      );
      expect(r.failures).toEqual(PIEZAS.map(p => {
        const enEscala = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 0, REGIMEN.escala);
        const enOrden = notesForRotation(BASE_MAP[p], DEFAULT_OCTAVE, 1, REGIMEN.orden);
        return `${p} rot0: the two regimes must give the same notes at rotation 0 ` +
          `(escala ${enEscala.join(',')} vs orden ${enOrden.join(',')})`;
      }));
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  });

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
      expect(r.failures.some(f => f.includes('which is not in the arpeggio of rotation 0'))).toBe(true);
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  });

  type Invariantes = typeof import('../invariants.ts');

  async function conCeldaDeAgarreDeIDesplazada(
    dx: number, dy: number, fn: (invariantes: Invariantes) => void,
  ): Promise<void> {
    vi.resetModules();
    const piezas = await import('../pieces.ts');
    vi.doMock('../transform.ts', async () => {
      const real = await vi.importActual<typeof import('../transform.ts')>('../transform.ts');
      return {
        ...real,
        rotateN: (cells: Cell[], n: number): Cell[] => {
          const rotada = real.rotateN(cells, n);
          if (cells !== piezas.SHAPES.I || n !== 0) return rotada;
          return rotada.map((c, k): Cell => (k === piezas.ANCHOR_INDEX.I ? [c[0] + dx, c[1] + dy] : c));
        },
      };
    });
    try {
      fn(await import('../invariants.ts'));
    } finally {
      vi.doUnmock('../transform.ts');
      vi.resetModules();
    }
  }

  it.each([
    { eje: 'x', dx: 1, dy: 0, directa: '3,0', reflejada: '1,0' },
    { eje: 'y', dx: 0, dy: 1, directa: '2,1', reflejada: '2,1' },
  ])('checkArrayOrder and checkAnchors see one cell that moves only in $eje', async ({ dx, dy, directa, reflejada }) => {
    await conCeldaDeAgarreDeIDesplazada(dx, dy, invariantes => {
      expect(invariantes.checkArrayOrder().failures).toEqual([
        `I rot0: cell 2 is (${directa}) and must be (2,0)`,
        `I rot0 mirror: cell 2 is (${reflejada}) and must be (2,0)`,
      ]);
      expect(invariantes.checkAnchors().failures).toEqual([
        `I rot0: the grip cell is at (${directa}) and must be at (2,0)`,
        `I rot0 mirror: the grip cell is at (${reflejada}) and must be at (2,0)`,
      ]);
    });
  });

  it.each([
    ['that is negative', -1],
    ['that is a fraction', 1.5],
  ])('checkAnchors sees an ANCHOR_INDEX %s', (_caso, valor) => {
    const original = ANCHOR_INDEX.I;
    ANCHOR_INDEX.I = valor;
    try {
      expect(checkAnchors().failures).toEqual([`I: ANCHOR_INDEX ${valor} is outside [0, 5)`]);
    } finally {
      ANCHOR_INDEX.I = original;
    }
  });

  it('checkShapes takes a shape of one cell as connected', () => {
    conFormaMutada('I', [[0,0]], () => {
      expect(checkShapes().failures).toEqual(['I: has 1 cells and must have 5']);
    });
  });

  async function conNotasDeFMutadas(
    parche: (reales: number[], rot: number, regimen: RegimenDeRotacion) => number[],
    fn: (invariantes: Invariantes) => void,
  ): Promise<void> {
    vi.resetModules();
    vi.doMock('../../musical-model/music.ts', async () => {
      const real = await vi.importActual<typeof import('../../musical-model/music.ts')>('../../musical-model/music.ts');
      return {
        ...real,
        notesForRotation: (basePc: number, octave: number, rot: number, regimen: RegimenDeRotacion) => {
          const reales = real.notesForRotation(basePc, octave, rot, regimen);
          return basePc === real.BASE_MAP.F ? parche(reales, rot, regimen) : reales;
        },
      };
    });
    try {
      fn(await import('../invariants.ts'));
    } finally {
      vi.doUnmock('../../musical-model/music.ts');
      vi.resetModules();
    }
  }

  it('checkNotes sees a note that repeats the one before it and a note below the one before it', async () => {
    await conNotasDeFMutadas(
      (reales, rot, regimen) => (regimen === REGIMEN.escala && rot === 2 ? [60, 64, 64, 62, 72] : reales),
      invariantes => {
        expect(invariantes.checkNotes().failures).toEqual([
          'F rot2 [escala]: has a repeated note',
          'F rot2 [escala]: note 2 (64) is not above the note before it (64)',
          'F rot2 [escala]: note 3 (62) is not above the note before it (64)',
        ]);
      },
    );
  });

  it('checkNotes sees an arpeggio of the order regime that is not a cyclic permutation', async () => {
    await conNotasDeFMutadas(
      (reales, rot, regimen) => (regimen === REGIMEN.orden && rot === 1 ? [62, 64, 67, 60, 69] : reales),
      invariantes => {
        expect(invariantes.checkNotes().failures).toEqual([
          'F rot1 [orden]: note 3 (60) breaks the cyclic permutation, it must be 69',
          'F rot1 [orden]: note 4 (69) breaks the cyclic permutation, it must be 60',
        ]);
      },
    );
  });

  it('checkNotes sees an arpeggio of the order regime with the shift of another rotation', async () => {
    await conNotasDeFMutadas(
      (reales, rot, regimen) => (regimen === REGIMEN.orden && rot === 1 ? [64, 67, 69, 60, 62] : reales),
      invariantes => {
        expect(invariantes.checkNotes().failures).toEqual([
          'F rot1 [orden]: shifted 2 positions and must be 1',
        ]);
      },
    );
  });
});
