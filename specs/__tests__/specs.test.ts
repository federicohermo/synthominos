import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { audit, readCorpus } from '../../.agents/scripts/specs.ts';

/** The spec gate on the real repo. The logic and its cases live in `.agents/scripts/specs.ts`. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('specs/: the contract of each capability', () => {
  it('keeps its shape, and every criterion of a ratified spec has a test that cites it', () => {
    const { specs, tests } = readCorpus(ROOT);
    const { findings, report } = audit(specs, tests);
    console.info(report.join('\n'));
    expect(findings).toEqual([]);
  });
});
