import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The `browser` project serves its own document and never loads this `index.html`.
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('AC-ACC-001 — declares the language of the interface, which is the one spoken inside', () => {
    expect(HTML).toMatch(/<html\s+lang="es"\s*>/);
    // A second `lang` deeper in would win for its subtree.
    expect(HTML).not.toContain('lang="en"');
  });
});
