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

const RAIZ = join(import.meta.dirname, '..', '..', '..');

const ESPERADAS: Record<string, unknown> = {
  GRID_MIN, GRID_DEFAULT, MAX_PIEZAS, CROSS_COST,
  CELLS_PER_PIECE,
  NOTES_PER_PIECE, DEFAULT_OCTAVE, DEFAULT_REGIMEN,
  PASOS_MAX,
  DEFAULT_BPM, MASTER_GAIN, FFT_SIZE,
  LOOKAHEAD, TICK_MS,
};

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
