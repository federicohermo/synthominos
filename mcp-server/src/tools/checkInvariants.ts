import { z } from 'zod';
import { defineTool, json } from './types.ts';
import { PIECE_KEYS } from '../pieces.ts';
import { checkAll } from '../../../src/pieces/invariants.ts';

/** Rotations x reflection. Update it by hand if `invariants.ts` changes the grid it goes through. */
const ORIENTATIONS_PER_PIECE = 4 * 2;

/** Coupled to the message format of `invariants.ts`: `Z: …` or `Z rot3 …`. */
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
    'covers its own part: `array order`, `grip cell`, `distinct pieces` ' +
    'and `letters` cover the 96, `notes` another 96 (12 × 4 ' +
    'rotations × 2 regimes, without the mirror), `shapes` the 12 canonical shapes, and ' +
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
      modelSpace: {
        pieces: PIECE_KEYS.length,
        orientationsPerPiece: ORIENTATIONS_PER_PIECE,
        orientations: PIECE_KEYS.length * ORIENTATIONS_PER_PIECE,
      },
      // `ok` is that of the whole model, also with a piece filter.
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
