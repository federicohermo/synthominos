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
 * Shape and sound of a piece in one orientation.
 *
 * It is the tool that saves the most: to answer this from the code, a reader must
 * compose four pure functions by hand over five coordinate pairs, and nothing warns if
 * the mental simulation went wrong.
 *
 * All that is computed comes from `src/`. Only the ASCII is local.
 */

/**
 * The name of the formula that each rotation selects IN THE `escala` REGIME.
 *
 * It is a LABEL, not the rule: `notesForRotation` in `musical-model/music.ts` selects
 * the formula, and the notes of the answer come from there. If the mapping from
 * rotation to formula changes there, update this text.
 *
 * It is one of the TWO assumptions of the server about the domain that can go out of
 * sync while `tsc` says nothing. The other is `ORIENTATIONS_PER_PIECE` in
 * `checkInvariants.ts`. The two are marked, and they are the only two: all the rest is
 * run, not described.
 *
 * Under the `orden` regime the FOUR entries are false: the formula is always the major
 * pentatonic, and the rotation moves the start. No gate catches that. So the answer
 * does not read the array: `scaleLabel` reads it, and it checks the regime first.
 */
const SCALE_LABEL = [
  'major pentatonic (rotation 0°)',
  'minor pentatonic (rotation 90°)',
  'minor pentatonic with blue note (rotation 180°)',
  'major pentatonic transposed +7 (rotation 270°)',
];

/**
 * What the answer says in `scale`. It depends on the regime, not only on the rotation.
 *
 * To report the regime and still say "minor pentatonic (rotation 90°)" under `orden` is
 * worse than no report: the answer would contradict itself, and the notes next to it
 * would be the correct ones.
 */
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

    // The retrograde is applied as in the app: `notesForRotation` gives the ascending
    // arpeggio and the reflection reverses it after.
    const ascending = notesForRotation(BASE_MAP[piece], octave, rotation, regimen);
    const notes = mirror ? [...ascending].reverse() : ascending;

    // The CANONICAL shape, not `cells`: a rotation moves the origin of the angle, so the
    // mapping computed again on the transformed shape would give other degrees. It
    // carries by index because `rotateN` and `reflect` are `map`, the same as the grip cell.
    const degrees = degreeByCellIndex(SHAPES[piece]);
    // The step is the degree with the retrograde applied, and it is NOT computed again
    // here: it comes from the same pure function that feeds `gates` and the number shown
    // on the board.
    const playOrder = playOrderByCellIndex(SHAPES[piece], mirror);

    return json({
      piece, rotation, mirror, octave,
      // The regime travels IN THE ANSWER, not only in the input: in 36 of the 48
      // combinations the same piece has two arpeggios. An answer that gives five notes
      // and not the regime is ambiguous three times out of four.
      regimen,
      tonic: CHROMATIC[BASE_MAP[piece]],
      tonicPc: BASE_MAP[piece],
      scale: scaleLabel(regimen, rotation),
      // Index k is the same logical cell as in SHAPES: rotate, reflect and normalize
      // are `map`. The grip cell by index depends on that.
      cells,
      // A field NEXT to `cells`, which does not change: to overwrite `cells` would
      // silently change the contract of the tool. It indexes `ascending` and not `notes`
      // because the retrograde is about the play order, and `notes` already says that:
      // the note of a cell is the one of its degree in the ascending arpeggio.
      // `degree` and `playOrder` are the SAME number only with no reflection. `degree`
      // answers which note the cell has, and so it indexes `ascending`. `playOrder`
      // answers when it sounds: use it to follow the playhead or to compare with the
      // screen.
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
      // The same drawing with the STEP in each cell: it shows the walk that the arpeggio
      // makes through the shape, always from `0` to `4`. It draws the step and not the
      // degree because the step is the number that the board paints. Two different
      // numberings, one on the screen and one in the tool, is exactly how a check goes
      // wrong. `ascii` does not change: the two drawings say different things.
      asciiPlayOrder: renderCellNumbers(cells, playOrder),
      notes: notes.map(m => ({ midi: m, name: midiName(m) })),
      retrograde: mirror,
    });
  },
});
