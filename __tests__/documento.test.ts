import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The document that wraps the app, read from the disk.
 *
 * No browser test can falsify this file: the `browser` project **serves its own document**
 * and never loads this `index.html`, so a wrong `lang` breaks no assertion there. So the test
 * lives in the `node` project and reads the file as text.
 *
 * The name is not free: ANOTHER test reads this same file from the disk, the sync of the
 * background color between CSS, manifest and `meta`, and it is `fondo-sincronizado.test.ts`.
 * With the obvious name for both, the one of `index.html`, the second lane to merge would
 * overwrite the first and the merge would not see it: a whole file lost in green.
 */
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('AC-ACC-001 — declares the language of the interface, which is the one spoken inside', () => {
    // A screen reader uses `lang` to choose the voice engine. With `en`, the default of the
    // Create React App template, "Reflexión" and "rotación 90°" are spoken with English
    // phonetics, and so is the `aria-label` of the thumbnails, written in Spanish on
    // purpose. WCAG 2.2 3.1.1, level A.
    expect(HTML).toMatch(/<html\s+lang="es"\s*>/);
    // And `en` must not stay anywhere in the document: a second `lang` deeper in would win
    // for its subtree, and the first assertion would not see it.
    expect(HTML).not.toContain('lang="en"');
  });
});
