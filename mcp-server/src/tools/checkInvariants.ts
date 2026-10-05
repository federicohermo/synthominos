import { z } from 'zod';
import { defineTool, json } from './types.ts';
import { PIECE_KEYS } from '../pieces.ts';
import { checkAll } from '../../../src/pieces/invariants.ts';

/**
 * The checks of the model, run for real.
 *
 * It is the smallest tool of the server because **all the logic lives in
 * `src/pieces/invariants.ts`**: no check is written here, only the format of the
 * answer.
 *
 * It iterates over what `checkAll()` returns, not over a list of its own. So a check
 * that the domain adds shows in the answer with no change to the code here. What is
 * edited by hand is the text of `description` and the constant below, as its comment
 * says.
 */

/**
 * Rotations x reflection: the SPACE of the model for each piece.
 *
 * It is not coverage, and the difference matters. Of the seven checks, four go through
 * the 96 orientations: `orden del array`, `ancla`, `piezas distintas` and `letras`.
 * `formas` reads the 12 canonical shapes, because rotation and reflection change neither
 * the cell count nor the connectivity. `notas` also covers 96: 12 x 4 rotations x 2
 * REGIMES, with no mirror because the mirror only reverses the order. `BASE_MAP` reads
 * the set once. `piezas distintas` and `letras` reach 96 because the reduction of a
 * shape to its canonical key generates its 8 orientations. So the answer reports it as
 * `modelSpace` and not as `checked`: to state 96 for the seven would promise too much.
 *
 * With `SCALE_LABEL` of `describePiece.ts`, it is one of the two assumptions of the
 * server about the domain: if `invariants.ts` changes the grid it goes through, update
 * this by hand.
 */
const ORIENTATIONS_PER_PIECE = 4 * 2;

/**
 * The piece that a failure is about, read from the prefix of the message (`Z: …` or
 * `Z rot3 …`).
 *
 * It is a coupling to the FORMAT of the messages of `invariants.ts`, so it is made to
 * degrade toward showing too much. If the format changes, the failure is not recognized
 * as the failure of one piece and is always reported: the filter does not hide it. The
 * messages that do not start with a piece letter, those of `BASE_MAP` that are about
 * the set, are truly global.
 *
 * It is exported for its test: with the seven checks green, the tool has no real
 * failure to exercise the filter with.
 */
export function pieceOf(failure: string): string | null {
  const head = failure.split(/[: ]/, 1)[0];
  return (PIECE_KEYS as readonly string[]).includes(head) ? head : null;
}

const inputSchema = z.object({
  piece: z.enum(PIECE_KEYS).optional()
    .describe('Limits the reported failures to this piece. The checks still run on all 12.'),
});

export const checkInvariants = defineTool({
  name: 'check_invariants',
  title: 'Check the invariants',
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    'Runs the seven checks of the model and returns which ones pass, with counterexamples. The ' +
    'model space is 12 pieces × 4 rotations × reflection = 96 orientations, and each check ' +
    'covers its own part: `orden del array` (array order), `ancla` (grip cell), `piezas distintas` ' +
    '(distinct pieces) and `letras` (letters) cover the 96, `notas` (notes) another 96 (12 × 4 ' +
    'rotations × 2 regimes, without the mirror), `formas` (shapes) the 12 canonical shapes, and ' +
    'BASE_MAP the set once. ' +
    'Use it before you change geometry, piece tables or ' +
    'the musical model, and again after: the most dangerous invariant of the repo, that the cell ' +
    'at index k stays the same logical cell after a transform, breaks with NO visible error, ' +
    'and only this check shows it. It runs checkAll() of src/pieces/invariants.ts and reimplements no check.',
  inputSchema,
  run: ({ piece }) => {
    const checks = checkAll();

    return json({
      scope: piece ?? 'all',
      // The space of the model, NOT what each check covers: see
      // `ORIENTATIONS_PER_PIECE`.
      modelSpace: {
        pieces: PIECE_KEYS.length,
        orientationsPerPiece: ORIENTATIONS_PER_PIECE,
        orientations: PIECE_KEYS.length * ORIENTATIONS_PER_PIECE,
      },
      // `ok` is that of the whole model, also with a piece filter: an "all good"
      // limited to the Z while the F is broken would be a misleading answer.
      ok: checks.every(c => c.ok),
      checks: checks.map(c => {
        const relevantes = piece
          ? c.failures.filter(f => { const p = pieceOf(f); return p === null || p === piece; })
          : c.failures;
        return {
          name: c.name,
          ok: c.ok,
          failures: relevantes,
          failuresOtherPieces: c.failures.length - relevantes.length,
        };
      }),
    });
  },
});
