import { GRID_MIN, GRID_DEFAULT, MAX_PIEZAS } from '../../../src/board-editing/domain/board.constants.ts';
import { CROSS_COST } from '../../../src/circuit/domain/routing.constants.ts';
import { CELLS_PER_PIECE } from '../../../src/pieces/domain/pieces.constants.ts';
import { NOTES_PER_PIECE, DEFAULT_OCTAVE, DEFAULT_REGIMEN } from '../../../src/musical-model/domain/music.constants.ts';
import { PASOS_MAX } from '../../../src/circuit/domain/sequence.constants.ts';
import { DEFAULT_BPM, MASTER_GAIN, FFT_SIZE } from '../../../src/playback/audio/engine.constants.ts';
import { LOOKAHEAD, TICK_MS } from '../../../src/playback/audio/scheduler.constants.ts';
import { jsonResource, type ResourceDef } from './types.ts';

/**
 * Los valores que gobiernan el instrumento, IMPORTADOS de `src/` y no copiados.
 *
 * «Valores» y no «numeros» porque uno no lo es: `DEFAULT_REGIMEN` es `REGIMEN.escala`,
 * un string. Entra igual —esta copiado en `docs/`, que es el criterio— y llamarlos a
 * todos numeros seria otra afirmacion falsa, que es de lo que trata este archivo.
 *
 * Ni un valor escrito aca: el archivo no tiene un solo literal numerico. Ese es el punto
 * entero del resource — un cuadro de constantes escrito a mano es una copia, y una copia
 * envejece sin que nada se ponga en rojo. Si alguna hiciera falta y no estuviera exportada,
 * el arreglo es exportarla en `src/`, en su propio commit, y no tipearla de este lado.
 *
 * Agrupadas por el archivo que las define, con **shorthand de propiedad**: escrita asi, la
 * clave ES el identificador importado, o sea que el nombre no puede desincronizarse del
 * valor ni sobrevivir a un rename —el import deja de compilar—. Y la ruta se escribe una
 * vez por archivo y no una vez por constante.
 */
const POR_ARCHIVO = [
  {
    archivo: 'src/board-editing/domain/board.constants.ts',
    constantes: { GRID_MIN, GRID_DEFAULT, MAX_PIEZAS },
  },
  {
    archivo: 'src/circuit/domain/routing.constants.ts',
    constantes: { CROSS_COST },
  },
  {
    archivo: 'src/pieces/domain/pieces.constants.ts',
    constantes: { CELLS_PER_PIECE },
  },
  {
    archivo: 'src/musical-model/domain/music.constants.ts',
    constantes: { NOTES_PER_PIECE, DEFAULT_OCTAVE, DEFAULT_REGIMEN },
  },
  {
    archivo: 'src/circuit/domain/sequence.constants.ts',
    constantes: { PASOS_MAX },
  },
  {
    archivo: 'src/playback/audio/engine.constants.ts',
    constantes: { DEFAULT_BPM, MASTER_GAIN, FFT_SIZE },
  },
  {
    archivo: 'src/playback/audio/scheduler.constants.ts',
    constantes: { LOOKAHEAD, TICK_MS },
  },
];

/**
 * Lo que viaja: un mapa `NOMBRE -> { valor, archivo }`, derivado de la lista agrupada.
 *
 * **La forma la decide la pregunta que trae a alguien aca**, que es "cuanto vale X y donde
 * lo edito". Sobre un mapa eso es una lectura; sobre la lista agrupada hay que recorrer los
 * grupos buscando en cual cayo. La lista sigue siendo la FUENTE —es donde la ruta se
 * escribe una sola vez— y esto es su indice.
 *
 * Que cada constante lleve su `archivo` al lado es lo que la separa de otra copia, solo que
 * generada: sin la ruta, quien lee la respuesta sabe el numero y no sabe donde cambiarlo, y
 * vuelve a `grep`. Con la ruta, la respuesta termina en el archivo que hay que abrir.
 */
const CONSTANTES = Object.fromEntries(
  POR_ARCHIVO.flatMap(({ archivo, constantes }) =>
    Object.entries(constantes).map(
      ([nombre, valor]): [string, { valor: unknown; archivo: string }] => [nombre, { valor, archivo }],
    ),
  ),
);

/**
 * `pentomino://constantes`.
 *
 * Es un resource y no una tool porque no hay nada que preguntarle: no toma argumentos y la
 * respuesta entera entra en el contexto de una. Una tool con `inputSchema` vacio seria la
 * misma informacion detras de una llamada que el cliente tiene que decidir hacer.
 */
export const constantes: ResourceDef = {
  name: 'constantes',
  uri: 'pentomino://constantes',
  config: {
    title: 'Constantes del instrumento',
    // La `description` es lo que lee el cliente, no un comentario: va en español con
    // acentos, como las de las tools.
    description:
      'Los valores fijos del dominio y del motor de audio —tablero, piezas, modelo musical, scheduler—, cada uno con su valor y con la ruta del archivo de `src/` que lo define. Se importan en cada consulta: no hay copia que pueda quedar vieja. Usarlo en lugar de leer los valores que `CLAUDE.md` y `docs/` transcriben.',
    mimeType: 'application/json',
  },
  read: (uri) => jsonResource(uri, CONSTANTES),
};
