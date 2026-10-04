import { z } from 'zod';
import { join } from 'node:path';
import { defineTool, json } from './types.ts';
import { readIndex, findSymbol as buscar, outline } from '../symbols.ts';

/**
 * Donde esta definido un simbolo de `src/` y quien lo usa.
 *
 * Es la unica tool que mira el codigo en vez de ejecutarlo, y entra por una razon
 * medida: la consulta tipica —"donde esta `notesForRotation` y quien depende de
 * el"— cuesta 6.207 bytes por el camino `grep` + `Read` del archivo (4.544 sobre
 * `src/` y `mcp-server/src/`, mas 1.663 de `music.ts`), contra 415 por aca. El grep
 * devuelve 40 hits, la mayoria call-sites repetidos del mismo test, y ademas no
 * trae la firma, asi que el `Read` viene igual.
 *
 * Que la firma y la primera frase del doc viajen en la respuesta es parte de lo
 * que paga: son los bytes que evitan el `Read`.
 *
 * Las rutas se resuelven desde este archivo y no desde `process.cwd()`: al server
 * lo arranca un cliente MCP, que no promete nada sobre el directorio de trabajo.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

/**
 * Aporta aristas al grafo pero no simbolos: las tools importan 31 cosas del
 * dominio, asi que sin esto `usedBy` contesta 2 usuarios donde hay 4.
 *
 * Lo atrapa `pnpm verify` igual —el tsconfig del server typechequea cruzando el
 * borde de paquete—, pero para entonces la estimacion ya se hizo con el numero mal.
 */
const GRAFO = [join(ROOT, 'mcp-server', 'src')];

/**
 * Tope de la busqueda por subcadena: se corta y se avisa que se corto, que es
 * distinto de devolver 20 y dejar creer que no hay mas.
 *
 * Sin tope, `find_symbol("set")` devuelve decenas de matches CON firma, y la firma
 * de `SHAPES` o `BASE_MAP` es el valor entero: la tool que entra por costar 415
 * bytes contra 6.207 terminaria costando mas que el `grep` que vino a reemplazar.
 */
const LIMITE = 20;

const inputSchema = z.object({
  name: z.string().optional()
    .describe('Símbolo a buscar. Exacto primero; si no hay, subcadena sin distinguir mayúsculas. Omitirlo devuelve el índice entero agrupado por archivo.'),
  includeTests: z.boolean().default(false)
    .describe('Incluir `__tests__/`. Por defecto no: un símbolo con cobertura aparece en su test decenas de veces y eso tapa a los usuarios reales.'),
});

export const findSymbol = defineTool({
  name: 'find_symbol',
  title: 'Ubicar un símbolo',
  // `readOnlyHint` habla de si la tool MODIFICA su entorno, no de si toca el
  // filesystem: ésta lee `src/` del disco y construye el índice en la consulta.
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    'Dónde está definido un símbolo de src/ y qué archivos lo importan. Usar EN LUGAR de grep para ' +
    'ubicar una función, una constante o un tipo: devuelve archivo y línea, la firma en una sola ' +
    'línea, la primera frase de su doc, y la lista de archivos que dependen de él — así que ' +
    'normalmente evita tener que abrir el archivo. Sin `name` devuelve el índice entero agrupado ' +
    'por archivo, que es el mapa de la superficie pública de src/ en ~2 KB.\n' +
    'Dos diferencias con grep que cambian la respuesta: (1) `usedBy` sale del grafo de imports ' +
    'resuelto a archivo, no de coincidencia de texto, así que no confunde dos símbolos homónimos ' +
    'de módulos distintos ni cuenta quince veces al archivo que lo llama quince veces; (2) los ' +
    'tests quedan afuera salvo que se pidan.\n' +
    '`usedBy` incluye los archivos de `mcp-server/` que dependen del dominio, con su prefijo de ' +
    'ruta: tocar una firma de `src/<capability>/domain/` puede romper una tool, y esa arista cuenta.\n' +
    'Se construye en la consulta y no se persiste: no hay archivo de índice que pueda quedar viejo. ' +
    'Para saber POR QUÉ algo está hecho así hay que leer el código igual — eso vive en los ' +
    'comentarios, no acá.',
  inputSchema,
  run: ({ name, includeTests }) => {
    const index = readIndex(ROOT, SRC, GRAFO);

    if (name === undefined) {
      // Los contadores se derivan del mapa que viaja en la MISMA respuesta y no
      // del indice crudo: `index.exports` cuenta los tests y el outline los
      // omite, asi que decia 84 símbolos sobre 36 archivos arriba de una lista de
      // 78 sobre 26. El numero se usa para dimensionar un cambio; tiene que ser
      // el de lo que se esta mostrando.
      const mapa = outline(index, includeTests);
      return json({
        archivos: Object.keys(mapa).length,
        simbolos: Object.values(mapa).reduce((n, xs) => n + xs.length, 0),
        outline: mapa,
      });
    }

    const todos = buscar(index, name, includeTests);
    const matches = todos.slice(0, LIMITE);
    return json({
      query: name,
      matches,
      // Un miss se dice, no se devuelve como lista vacia y que el agente adivine
      // si el simbolo no existe o si la tool fallo. Un corte tambien.
      nota: todos.length === 0
        ? `Ningún símbolo exportado de src/ coincide con "${name}". Puede ser local a su módulo (el índice solo lista exports) o ser propio de mcp-server/, cuyos símbolos no se indexan — de ahí solo se leen los imports.`
        : todos.length > LIMITE
          ? `"${name}" coincide por subcadena con ${todos.length} símbolos; van los primeros ${LIMITE}. Buscar el nombre exacto para no cortar.`
          : undefined,
    });
  },
});
