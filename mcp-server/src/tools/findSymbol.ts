import { z } from 'zod';
import { join } from 'node:path';
import { defineTool, json } from './types.ts';
import { readIndex, findSymbol as buscar, outline } from '../symbols.ts';

/** From this file, not `process.cwd()`: an MCP client promises no working directory. */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

/** It adds edges to the graph and no symbols: without it `usedBy` omits the server. */
const GRAFO = [join(ROOT, 'mcp-server', 'src')];

const LIMITE = 20;

const inputSchema = z.object({
  name: z.string().optional()
    .describe('Symbol to find. Exact match first; if there is none, a case-insensitive substring. Without it, the tool returns the whole index grouped by file.'),
  includeTests: z.boolean().default(false)
    .describe('Include `__tests__/`. Off by default: a symbol with coverage appears tens of times in its test, and that hides the real users.'),
});

export const findSymbol = defineTool({
  name: 'find_symbol',
  title: 'Find a symbol',
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    'Where a symbol of src/ is defined and which files import it. Use it IN PLACE of grep to ' +
    'find a function, a constant or a type: it returns the file and the line, the signature on one ' +
    'line, the first sentence of its doc, and the list of files that depend on it. So it ' +
    'usually removes the need to open the file. Without `name` it returns the whole index grouped ' +
    'by file, which is the map of the public surface of src/ in ~2 KB.\n' +
    'Two differences from grep that change the answer: (1) `usedBy` comes from the import graph ' +
    'resolved to files, not from a text match, so it does not confuse two symbols of the same name ' +
    'from different modules, and it does not count fifteen times the file that calls it fifteen times; (2) the ' +
    'tests stay out unless you ask for them.\n' +
    '`usedBy` includes the files of `mcp-server/` that depend on the domain, with their path ' +
    'prefix: a change to a signature of `src/` can break a tool, and that edge counts.\n' +
    'The index is built in the query and is not persisted: no index file can go stale. ' +
    'To know WHY something is made the way it is, read the code anyway: that lives in the ' +
    'comments, not here.',
  inputSchema,
  run: ({ name, includeTests }) => {
    const index = readIndex(ROOT, SRC, GRAFO);

    if (name === undefined) {
      // Counted on the outline of this answer: the raw index also counts the tests.
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
      nota: todos.length === 0
        ? `No exported symbol of src/ matches "${name}". It can be local to its module (the index lists only exports), or it can belong to mcp-server/, whose symbols are not indexed: only its imports are read.`
        : todos.length > LIMITE
          ? `"${name}" matches ${todos.length} symbols by substring; these are the first ${LIMITE}. Search for the exact name to avoid the cut.`
          : undefined,
    });
  },
});
