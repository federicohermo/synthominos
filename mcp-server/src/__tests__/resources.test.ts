import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { resources } from '../resources/index.ts';
import { constantes } from '../resources/constantes.ts';
import { GRID_MIN, GRID_DEFAULT, MAX_PIEZAS } from '../../../src/board-editing/placement.ts';
import { CROSS_COST } from '../../../src/circuit/routing.ts';
import { CELLS_PER_PIECE } from '../../../src/pieces/pieces.ts';
import {
  NOTES_PER_PIECE,
  DEFAULT_OCTAVE,
  DEFAULT_REGIMEN,
} from '../../../src/musical-model/music.ts';
import { PASOS_MAX } from '../../../src/circuit/sequence.ts';
import { MASTER_GAIN } from '../../../src/playback/engine.ts';
import { FFT_SIZE } from '../../../src/spectrum/spectrum-bars.ts';
import { DEFAULT_BPM } from '../../../src/playback/scheduler.ts';
import { LOOKAHEAD, TICK_MS } from '../../../src/playback/scheduler.ts';

/**
 * What these tests do NOT do is write a number.
 *
 * A test that asserts `MAX_PIEZAS === 12` with the `12` typed in it gives full coverage
 * and checks nothing: it is the SAME copy that the resource exists to avoid, moved one
 * file away. The two sides, the expected and the actual, come from the import.
 *
 * The only string written by hand is the path that each constant declares, so the last
 * test opens it on disk: a path copied wrong is exactly the bug this resource prevents,
 * and it is the only thing the compiler cannot catch.
 */

/** The repo root, from `mcp-server/src/__tests__/`. */
const RAIZ = join(import.meta.dirname, '..', '..', '..');

/**
 * The 14 expected constants, with shorthand: the key comes from the imported identifier
 * and the value from the real file.
 *
 * The count comes from here too: to count the `Object.keys` of this is to count imports,
 * and a "14" written by hand would be one more datum that can go stale.
 */
const ESPERADAS: Record<string, unknown> = {
  GRID_MIN, GRID_DEFAULT, MAX_PIEZAS, CROSS_COST,
  CELLS_PER_PIECE,
  NOTES_PER_PIECE, DEFAULT_OCTAVE, DEFAULT_REGIMEN,
  PASOS_MAX,
  DEFAULT_BPM, MASTER_GAIN, FFT_SIZE,
  LOOKAHEAD, TICK_MS,
};

/** Reads the resource with the URI it declares and returns the parsed body. */
function leer(): Record<string, { valor: unknown; archivo: string }> {
  const r = constantes.read(new URL(constantes.uri));
  const primero = r.contents[0];
  assert.ok(primero, 'the resource must answer one content');
  assert.equal(primero.uri, constantes.uri, 'the answer is about the URI of the request');
  assert.equal(primero.mimeType, 'application/json');
  assert.ok('text' in primero, 'the answer must be text');
  return JSON.parse(primero.text) as Record<string, { valor: unknown; archivo: string }>;
}

describe('the registry of resources', () => {
  test('publishes the resource of constants', () => {
    assert.ok(resources.includes(constantes));
  });

  test('each resource declares name, URI, title, description and mimeType', () => {
    for (const r of resources) {
      assert.ok(r.name.length > 0, `${r.uri} has no name`);
      assert.ok(r.uri.startsWith('pentomino://'), `${r.name} does not use the scheme of the server`);
      assert.ok(r.config.title, `${r.name} has no title`);
      assert.ok(r.config.description, `${r.name} has no description`);
      assert.equal(r.config.mimeType, 'application/json', `${r.name} has no mimeType`);
    }
  });

  test('no resource declares cacheHint', () => {
    // The type of `ResourceDef.config` already rejects it at write time. This checks it
    // on the object, which is where it matters. This server is reliable because nothing
    // can go stale, and a cached answer is a copy with another name.
    for (const r of resources) {
      assert.ok(!('cacheHint' in r.config), `${r.name} declares cacheHint`);
    }
  });
});

describe('pentomino://constantes', () => {
  test('answers exactly the imported constants, not one more and not one less', () => {
    const cuerpo = leer();
    assert.deepEqual(Object.keys(cuerpo).sort(), Object.keys(ESPERADAS).sort());
  });

  test('the value of each one is that of `src/`', () => {
    const cuerpo = leer();
    for (const [nombre, esperado] of Object.entries(ESPERADAS)) {
      assert.deepEqual(cuerpo[nombre]?.valor, esperado, `${nombre} does not match src/`);
    }
  });

  test('the file that each one declares really exports it', () => {
    const cuerpo = leer();
    for (const [nombre, entrada] of Object.entries(cuerpo)) {
      const fuente = readFileSync(join(RAIZ, entrada.archivo), 'utf8');
      assert.ok(
        fuente.includes(`export const ${nombre}`),
        `${entrada.archivo} does not export ${nombre}: the path is wrong and the answer leads nowhere`,
      );
    }
  });
});
