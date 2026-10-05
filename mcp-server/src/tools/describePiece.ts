import { z } from 'zod';
import { defineTool, json } from './types.ts';
import { renderAscii, renderCellNumbers, sizeOf } from '../render.ts';
import { PIECE_KEYS } from '../pieces.ts';
import { rotateN, reflect } from '../../../src/pieces/transform.ts';
import {
  notesForRotation,
  midiName,
  degreeByCellIndex,
  playOrderByCellIndex,
  BASE_MAP,
  CHROMATIC,
  DEFAULT_OCTAVE,
  REGIMEN,
  DEFAULT_REGIMEN,
} from '../../../src/musical-model/music.ts';
import { SHAPES, ANCHOR_INDEX } from '../../../src/pieces/pieces.ts';
import type { RegimenDeRotacion } from '../../../src/musical-model/music.ts';

/**
 * Labels for the `escala` regime only. `notesForRotation` owns the mapping from rotation to
 * formula: update this text if it changes there.
 */
const SCALE_LABEL = [
  'major pentatonic (rotation 0°)',
  'minor pentatonic (rotation 90°)',
  'minor pentatonic with blue note (rotation 180°)',
  'major pentatonic transposed +7 (rotation 270°)',
];

function scaleLabel(regimen: RegimenDeRotacion, rotation: number): string {
  if (regimen === REGIMEN.escala) return SCALE_LABEL[rotation];
  return rotation === 0
    ? 'major pentatonic, not shifted (rotation 0°)'
    : `major pentatonic shifted ${rotation} ${rotation === 1 ? 'position' : 'positions'} (rotation ${rotation * 90}°)`;
}

const inputSchema = z.object({
  piece: z.enum(PIECE_KEYS)
    .describe('Letter of the piece. It names the SHAPE, not the sound: the piece F sounds in C.'),
  rotation: z.number().int().min(0).max(3).default(0)
    .describe('Clockwise quarter turns: 0=0°, 1=90°, 2=180°, 3=270°. `regimen` decides what the rotation does.'),
  mirror: z.boolean().default(false)
    .describe('Reflection. It reverses the order of the notes (retrograde), and sometimes it does not change the shape.'),
  octave: z.number().int().min(0).max(8).default(DEFAULT_OCTAVE)
    .describe(`Octave in which the arpeggio is built. The app uses ${DEFAULT_OCTAVE}.`),
  regimen: z.enum([REGIMEN.escala, REGIMEN.orden]).default(DEFAULT_REGIMEN)
    .describe(
      'What the rotation changes. `escala` (the scale regime): it selects one of four formulas, so ' +
      'a rotation changes WHICH NOTES the piece sounds. `orden` (the order regime): always the major pentatonic, shifted `rotation` ' +
      `positions, so a rotation changes WHERE the arpeggio STARTS. The default is ${DEFAULT_REGIMEN}, ` +
      'the one of the app. At rotation 0 the two give the same notes. In the other 36 of the 48 ' +
      'combinations they give different notes.',
    ),
});

export const describePiece = defineTool({
  name: 'describe_piece',
  title: 'Describe a piece',
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    'The shape and the sound of a piece in a given orientation. Use it BEFORE you simulate a ' +
    'rotation or an arpeggio by hand: it returns the transformed cells (in array order), the ' +
    'ASCII render with the grip cell marked, the tonic, the scale formula and the five ' +
    'MIDI notes with the retrograde applied. It also returns `cellMap`: the degree of the arpeggio and ' +
    'the note that EACH cell owns, in the same order as `cells`. It runs the real functions of ' +
    'src/, so it answers what sounds today, not what the documentation said.\n' +
    'Three measured traps: (1) the letter names the SHAPE, not the ' +
    'sound: the piece F sounds with tonic C, and the note F belongs to the piece T; (2) the reflection ' +
    'always reverses the notes, but sometimes it does not show: on I and X it leaves the shape identical in the ' +
    'four rotations, and on T and U at rotations 0 and 180°; (3) `cellMap` comes from the ' +
    'ASCENDING arpeggio, not from `notes`: the retrograde is about the PLAY ORDER, so a reflection ' +
    'moves the cells but does not change the note that each one owns.\n' +
    'The rotation does ONE OF TWO things, and `regimen` selects which: with `escala` it changes ' +
    'the formula (the notes), with `orden` it shifts the arpeggio on a fixed major pentatonic (the ' +
    'start). The answer has the `regimen` it used, and its `scale` agrees with it. At rotation 0 the ' +
    'two give the same notes; in the other 36 of 48 combinations they do not.\n' +
    'There are TWO drawings: `ascii` marks the grip cell (`@`), and `asciiPlayOrder` puts the STEP of ' +
    'each cell: its position in the play order, which is the number that the board paints in the ' +
    'corner. So `0` is always where the circuit enters and `4` where it leaves. With ' +
    '`mirror` the step is NOT the degree: the retrograde reverses the order, so the step is ' +
    '`4 - degree`. `cellMap` has the two numbers for each cell.',
  inputSchema,
  run: ({ piece, rotation, mirror, octave, regimen }) => {
    const rotated = rotateN(SHAPES[piece], rotation);
    const cells = mirror ? reflect(rotated) : rotated;
    const anchorIndex = ANCHOR_INDEX[piece];

    const ascending = notesForRotation(BASE_MAP[piece], octave, rotation, regimen);
    const notes = mirror ? [...ascending].reverse() : ascending;

    // The canonical shape, not `cells`: the mapping on the transformed shape gives other degrees.
    const degrees = degreeByCellIndex(SHAPES[piece]);
    const playOrder = playOrderByCellIndex(SHAPES[piece], mirror);

    return json({
      piece, rotation, mirror, octave,
      regimen,
      tonic: CHROMATIC[BASE_MAP[piece]],
      tonicPc: BASE_MAP[piece],
      scale: scaleLabel(regimen, rotation),
      cells,
      // `degree` indexes `ascending`, not `notes`: the reflection reverses the play order only.
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
      asciiPlayOrder: renderCellNumbers(cells, playOrder),
      notes: notes.map(m => ({ midi: m, name: midiName(m) })),
      retrograde: mirror,
    });
  },
});
