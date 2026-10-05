import type { ToolDef } from './types.ts';
import { describePiece } from './describePiece.ts';
import { checkInvariants } from './checkInvariants.ts';
import { simulateBoard } from './simulateBoard.ts';
import { findSymbol } from './findSymbol.ts';

export const tools: readonly ToolDef[] = [
  describePiece,
  checkInvariants,
  simulateBoard,
  findSymbol,
];
