import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { audit, readCorpus } from '../../.agents/scripts/specs.ts';

/**
 * El gate de specs sobre el repo real. La lógica y sus casos viven en
 * `.agents/scripts/specs.ts` y su test; acá sólo se corre.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('specs/: el contrato de cada capacidad', () => {
  it('cumple la forma, y todo criterio de un spec ratified tiene un test que lo cita', () => {
    const { specs, tests } = readCorpus(ROOT);
    const { findings, report } = audit(specs, tests);
    console.info(report.join('\n'));
    expect(findings).toEqual([]);
  });
});
