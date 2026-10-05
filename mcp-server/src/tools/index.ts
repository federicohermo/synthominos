import type { ToolDef } from './types.ts';
import { describePiece } from './describePiece.ts';
import { checkInvariants } from './checkInvariants.ts';
import { simulateBoard } from './simulateBoard.ts';
import { findSymbol } from './findSymbol.ts';

/**
 * The registry. A new tool is one file plus one line here: the entry point does not
 * change, and there is no `switch` to keep in sync.
 */
export const tools: readonly ToolDef[] = [
  describePiece,
  checkInvariants,
  simulateBoard,
  findSymbol,
];
