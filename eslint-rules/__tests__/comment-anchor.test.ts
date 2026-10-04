import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import regla from '../comment-anchor.mjs';

/**
 * El `RuleTester` de ESLint 9 no registra nada por si solo: llama a `describe` y a
 * `it` globales, y este repo no corre vitest con `globals: true`. Sin estas dos
 * lineas la corrida no falla en rojo — falla con `No test suite found in file`, que
 * es la forma de fallar en verde que este repo ya se comio dos veces.
 */
RuleTester.describe = describe;
RuleTester.it = it;

/**
 * La regla resuelve contra `context.cwd`, que en el `RuleTester` es el `cwd` del
 * proceso: la raiz del repo, porque vitest corre desde ahi. O sea que los casos de
 * abajo se verifican **contra el arbol de verdad** y no contra un fixture, que es
 * lo unico que puede probar que una cita viva resuelve.
 *
 * El indice se arma una vez por proceso y se cachea por raiz. No hay hook para
 * resetearlo, a proposito: un backdoor de testing en un gate es la primera cosa que
 * alguien usa para saltearlo.
 */
const tester = new RuleTester();

tester.run('comment-anchor', regla, {
  valid: [
    // La cita que resuelve, que es el 98 % de las citas del repo.
    { name: 'cita viva', code: '// la geometria vive en src/pieces/transform.ts' },
    {
      // El indice empareja por BASENAME: la ruta esta mal —el archivo esta en
      // `src/domain/constants/`— y aun asi pasa. Es la decision de diseno de la
      // regla: lo que caza es el archivo borrado o renombrado, no el formato de
      // la ruta. Exigir la ruta exacta convertiria las 309 citas vivas en 309
      // problemas de formato.
      name: 'la ruta puede estar mal si el archivo existe',
      code: '// ver constants/pieces.ts',
    },
    { name: 'lib.*.d.ts es de TypeScript', code: '// el tipo lo trae lib.dom.d.ts, no este repo' },
    { name: 'node:* es un builtin', code: '// se lee con node:fs para no depender de nada' },

    // AC5: los cuatro archivos de un spec viven en una cache gitignoreada que en
    // la CI esta VACIA. Si la regla los resolviera contra el arbol de trabajo,
    // estos dos casos serian verdes aca y rojos en Actions.
    { name: 'research.md no depende de la cache', code: '// el numero sale de research.md §3' },
    { name: 'tasks.md tampoco', code: '// la tarea es tasks.md T003' },

    // AC6: los tres posicionales y el pasado descriptivo. `antes` es la palabra
    // mas ambigua del castellano tecnico y es la que rompia la regla de origen.
    { name: 'antes de es posicional', code: '// se normaliza antes de rotar' },
    { name: 'antes del es posicional', code: '// corre antes del scheduler' },
    { name: 'antes que es posicional', code: '// la tonica se resuelve antes que la escala' },
    { name: 'antes nada es posicional', code: '// antes nada de esto se calcula' },
    {
      name: 'el pasado descriptivo no es cronica',
      code: '// era una lista de cinco celdas y sigue siendolo',
    },

    // Un comentario que le habla a una herramienta no es prosa de nadie.
    { name: 'las directivas no se miran', code: '// ts-expect-error vive en inexistente-xyz.ts' },

    // Dos comentarios separados por una linea en blanco son DOS bloques, no una
    // corrida: el segundo no se pega al primero.
    {
      name: 'dos bloques sueltos, los dos limpios',
      code: '// la tonica sale de la pieza\n\n// el orden sale de la posicion',
    },
    {
      name: 'un bloque /* */ no arrastra al de linea que sigue',
      code: '/* la escala sale de la rotacion */\n// y el retrogrado de la reflexion',
    },
  ],

  invalid: [
    {
      // La corrida de `//` es UN comentario: la cita esta partida del texto que la
      // introduce y aun asi se encuentra, y el hallazgo es uno solo.
      name: 'cita muerta en una corrida de dos lineas',
      code: '// el helper que resolvia esto vivia en\n// src/domain/inexistente-xyz.ts',
      errors: [{ messageId: 'muerta', data: { cita: 'src/domain/inexistente-xyz.ts' } }],
    },
    {
      // Dos muertas en el mismo bloque son DOS hallazgos: arreglar una no arregla
      // la otra. Es el caso real de `symbols.test.ts`.
      name: 'dos citas muertas en un bloque son dos hallazgos',
      code: '/* usa src/audio/fake-xyz.ts y src/audio/otro-xyz.ts */',
      errors: [
        { messageId: 'muerta', data: { cita: 'src/audio/fake-xyz.ts' } },
        { messageId: 'muerta', data: { cita: 'src/audio/otro-xyz.ts' } },
      ],
    },
    {
      // AC5 del otro lado: un archivo que NO es uno de los cuatro canonicos y vive
      // adentro de la cache de specs no resuelve, exista o no en este checkout.
      // Contestar que si seria contestar distinto en Actions.
      name: 'un archivo de la cache de specs no resuelve ni hidratado',
      code: '// el detalle esta en specs/051-los-comentarios/notas.md',
      errors: [{ messageId: 'muerta', data: { cita: 'specs/051-los-comentarios/notas.md' } }],
    },

    // AC6: uno en rojo por cada uno de los tres patrones, con su `messageId`. Un
    // test que solo cuenta errores pasa en verde con la regla reportando el mensaje
    // equivocado.
    {
      name: 'historia: adverbio',
      code: '// anteriormente el tablero se recorria en zigzag',
      errors: [{ messageId: 'historia', data: { forma: 'anteriormente' } }],
    },
    {
      name: 'historia: ya no',
      code: '// el campo ya no se escribe en cada frame',
      errors: [{ messageId: 'historia', data: { forma: 'ya no' } }],
    },
    {
      name: 'historia: antes + verbo en pasado',
      code: '// antes usaba un Map y ahora es un Set',
      errors: [{ messageId: 'historia', data: { forma: 'antes usaba' } }],
    },
    {
      // Un bloque puede estar podrido de las dos maneras, y son dos hallazgos
      // distintos con dos arreglos distintos.
      name: 'una cita muerta y una cronica en el mismo bloque',
      code: '// ya no se usa src/domain/inexistente-xyz.ts',
      errors: [{ messageId: 'muerta' }, { messageId: 'historia' }],
    },
  ],
});
