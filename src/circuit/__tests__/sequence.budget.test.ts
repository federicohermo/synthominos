import { describe, it, expect } from 'vitest';
import { buildSequence, gates } from '../sequence.ts';
import { isValid, GRID_DEFAULT } from '../../board-editing/placement.ts';
import { routeBetween } from '../routing.ts';
import { REGIMEN } from '../../musical-model/music.ts';
import type { Cell } from '../../pieces/transform.ts';
import { TWELVE } from './tiling.ts';

/**
 * The time budgets of the circuit. They are a project of their own, `budget`, by their suffix.
 *
 * A time budget means something only when nothing else competes for the CPU. Next to lint,
 * typecheck and the MCP suite the median goes up with nothing wrong in the product: measured,
 * 8.07 ms on the large board in one run of `pnpm verify` in three, against 3.1 ms alone. So
 * `pnpm verify` runs this project alone, after its parallel block. Issue #107 holds the
 * measurements.
 *
 * Two environments give no number of their own, and the budgets are skipped there:
 *
 * - **CI.** The Actions runner is a shared VM. Two runs of the same commit gave 8.4 ms and
 *   15.7 ms for the first budget, against 2.0 ms on the development machine.
 * - **Instrumented code.** This project is never run under coverage or under Stryker: the
 *   counters of v8 took the first budget from 1.8 ms to 11.3 ms.
 *
 * Each test prints its median. A budget that only says "pass" does not show its margin
 * getting smaller.
 */

// GitHub Actions sets `CI` on every runner.
const IN_CI = !!process.env.CI;

/** The median of 21 timed runs: a GC pause can take ten of them and the result does not move. */
function medianOf21(run: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < 21; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[10];
}

describe('the full board', () => {
  it.skipIf(IN_CI)('AC-CIR-023 — twelve pieces are solved in less than 5 ms (median of 21 runs)', () => {
    // Twelve is the worst case that can exist, not the usual one: there are twelve free
    // pentominoes and none repeats, so the rules of the instrument bound `O(n^2 * 2^n)`.
    expect(buildSequence(TWELVE, REGIMEN.escala, GRID_DEFAULT).steps).toHaveLength(12);

    const median = medianOf21(() => buildSequence(TWELVE, REGIMEN.escala, GRID_DEFAULT));
    console.log(`AC-CIR-023: median of 21 runs, 12 pieces on 60 cells: ${median.toFixed(3)} ms`);
    expect(median).toBeLessThan(5);
  });

  it.skipIf(IN_CI)('AC-CIR-024 — the same budget holds on the board of a 1920x1080 screen', () => {
    // The board comes from the viewport, so the worst desktop case is 26 x 15 = 390 cells,
    // 6.5 times the reference board, and the Dijkstra of `routeBetween` is `O(N^2)`. It fits
    // in the same 5 ms because of the distance cache by destination: 144 searches become 12.
    // Without the cache this measured 10.9 ms.
    const LARGE = { w: 26, h: 15 };
    // The same twelve pieces, each in its own block of 6 x 5, four blocks to a row. So they
    // do not touch and they spread over the whole board: the legs between gates cross the
    // screen, and that is the expensive case.
    const spread = TWELVE.map((p, i) => {
      const x0 = Math.min(...p.cells.map(([x]) => x));
      const y0 = Math.min(...p.cells.map(([, y]) => y));
      const dx = (i % 4) * 6 - x0;
      const dy = Math.floor(i / 4) * 5 - y0;
      return { ...p, cells: p.cells.map(([x, y]): Cell => [x + dx, y + dy]) };
    });
    for (let i = 0; i < spread.length; i++) {
      expect(isValid(spread[i].cells, spread.slice(0, i), LARGE), `${i}`).toBe(true);
    }
    expect(buildSequence(spread, REGIMEN.escala, LARGE).steps).toHaveLength(12);

    const median = medianOf21(() => buildSequence(spread, REGIMEN.escala, LARGE));
    console.log(`AC-CIR-024: median of 21 runs, 12 pieces on 390 cells: ${median.toFixed(3)} ms`);
    expect(median).toBeLessThan(5);
  });

  it.skipIf(IN_CI)('the matrix of 12 x 12 routes stays under 2 ms (median of 21 runs)', () => {
    // The part that made the crossing expensive, measured apart: the 144 routes that
    // `buildSequence` uses to order the circuit. The tiling is the worst case: 60 occupied
    // cells, so no path can avoid the weight of a crossing.
    const doors = TWELVE.map(gates);
    const matrix = (): number => {
      let total = 0;
      for (const from of doors) for (const to of doors) total += routeBetween(from.salida, to.entrada, TWELVE, GRID_DEFAULT).steps;
      return total;
    };
    // Five warm-up runs, not one: the first goes through the interpreter and measures the
    // start of the JIT, not the matrix.
    for (let i = 0; i < 5; i++) matrix();

    const median = medianOf21(matrix);
    console.log(`route matrix: median of 21 runs, 144 routes on 60 cells: ${median.toFixed(3)} ms`);
    expect(median).toBeLessThan(2);
  });
});
