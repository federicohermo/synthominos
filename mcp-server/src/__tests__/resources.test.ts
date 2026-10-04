import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { resources } from '../resources/index.ts';
import { constantes } from '../resources/constantes.ts';
import { GRID_MIN, GRID_DEFAULT, MAX_PIEZAS } from '../../../src/board-editing/domain/board.constants.ts';
import { CROSS_COST } from '../../../src/circuit/domain/routing.constants.ts';
import { CELLS_PER_PIECE } from '../../../src/pieces/domain/pieces.constants.ts';
import { NOTES_PER_PIECE, DEFAULT_OCTAVE, DEFAULT_REGIMEN } from '../../../src/musical-model/domain/music.constants.ts';
import { PASOS_MAX } from '../../../src/circuit/domain/sequence.constants.ts';
import { DEFAULT_BPM, MASTER_GAIN, FFT_SIZE } from '../../../src/playback/audio/engine.constants.ts';
import { LOOKAHEAD, TICK_MS } from '../../../src/playback/audio/scheduler.constants.ts';

/**
 * Lo que estos tests NO hacen es escribir un numero.
 *
 * Un test que afirma `MAX_PIEZAS === 12` con el `12` tipeado adentro da cobertura total y
 * no verifica nada: es la MISMA copia que el resource existe para no hacer, movida un
 * archivo mas alla. Los dos lados —lo esperado y lo obtenido— salen del import.
 *
 * El unico string escrito a mano es la ruta que cada constante declara, y por eso el ultimo
 * test la abre en el disco: una ruta mal copiada es exactamente el bug de este spec, y es
 * lo unico que el compilador no puede atajar.
 */

/** La raiz del repo, desde `mcp-server/src/__tests__/`. */
const RAIZ = join(import.meta.dirname, '..', '..', '..');

/**
 * Las 14 esperadas, con shorthand: la clave sale del identificador importado y el valor,
 * del archivo real.
 *
 * Es tambien de donde sale el numero — contar `Object.keys` de esto es contar imports, y
 * escribir "14" a mano seria un dato mas que puede envejecer.
 */
const ESPERADAS: Record<string, unknown> = {
  GRID_MIN, GRID_DEFAULT, MAX_PIEZAS, CROSS_COST,
  CELLS_PER_PIECE,
  NOTES_PER_PIECE, DEFAULT_OCTAVE, DEFAULT_REGIMEN,
  PASOS_MAX,
  DEFAULT_BPM, MASTER_GAIN, FFT_SIZE,
  LOOKAHEAD, TICK_MS,
};

/** Lee el resource con la URI que declara y devuelve el cuerpo ya parseado. */
function leer(): Record<string, { valor: unknown; archivo: string }> {
  const r = constantes.read(new URL(constantes.uri));
  const primero = r.contents[0];
  assert.ok(primero, 'el resource tiene que contestar un contenido');
  assert.equal(primero.uri, constantes.uri, 'la respuesta contesta sobre la URI que se pidio');
  assert.equal(primero.mimeType, 'application/json');
  assert.ok('text' in primero, 'la respuesta tiene que ser texto');
  return JSON.parse(primero.text) as Record<string, { valor: unknown; archivo: string }>;
}

describe('el registro de resources', () => {
  test('publica el resource de constantes', () => {
    assert.ok(resources.includes(constantes));
  });

  test('cada resource declara nombre, URI, titulo, descripcion y mimeType', () => {
    for (const r of resources) {
      assert.ok(r.name.length > 0, `${r.uri} sin nombre`);
      assert.ok(r.uri.startsWith('pentomino://'), `${r.name} no usa el esquema del server`);
      assert.ok(r.config.title, `${r.name} sin title`);
      assert.ok(r.config.description, `${r.name} sin description`);
      assert.equal(r.config.mimeType, 'application/json', `${r.name} sin mimeType`);
    }
  });

  test('ningun resource declara cacheHint', () => {
    // El tipo de `ResourceDef.config` ya lo rechaza al escribirlo; esto lo verifica sobre
    // el objeto, que es donde importa. Lo que hace confiable a este server es que nada
    // pueda quedar viejo, y una respuesta cacheada es una copia con otro nombre.
    for (const r of resources) {
      assert.ok(!('cacheHint' in r.config), `${r.name} declara cacheHint`);
    }
  });
});

describe('pentomino://constantes', () => {
  test('contesta exactamente las constantes importadas, ni una mas ni una menos', () => {
    const cuerpo = leer();
    assert.deepEqual(Object.keys(cuerpo).sort(), Object.keys(ESPERADAS).sort());
  });

  test('el valor de cada una es el de `src/`', () => {
    const cuerpo = leer();
    for (const [nombre, esperado] of Object.entries(ESPERADAS)) {
      assert.deepEqual(cuerpo[nombre]?.valor, esperado, `${nombre} no coincide con src/`);
    }
  });

  test('el archivo que declara cada una la exporta de verdad', () => {
    const cuerpo = leer();
    for (const [nombre, entrada] of Object.entries(cuerpo)) {
      const fuente = readFileSync(join(RAIZ, entrada.archivo), 'utf8');
      assert.ok(
        fuente.includes(`export const ${nombre}`),
        `${entrada.archivo} no exporta ${nombre}: la ruta esta mal y la respuesta lleva a ningun lado`,
      );
    }
  });
});
