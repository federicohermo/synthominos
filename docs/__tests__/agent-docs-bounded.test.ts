import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

/**
 * The always-loaded agent documents stay within budget. Each harness loads them whole at the
 * start of a session and keeps them in every request, so each extra line is paid on every turn.
 * Reference material goes to `docs/` or to a rule with `paths:`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lines = (file: string) => readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/).length;

describe('the agent documents stay within budget', () => {
  it.each([
    ['AGENTS.md', 110],
    ['CLAUDE.md', 200],
  ])('%s has at most %i lines', (file, ceiling) => {
    expect(lines(file), `${file} is loaded whole in every request; move detail to docs/`).toBeLessThanOrEqual(ceiling);
  });

  it('CLAUDE.md imports AGENTS.md instead of repeating it', () => {
    expect(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').startsWith('@AGENTS.md')).toBe(true);
  });
});
