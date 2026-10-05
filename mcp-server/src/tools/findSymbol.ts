import { z } from 'zod';
import { join } from 'node:path';
import { defineTool, json } from './types.ts';
import { readIndex, findSymbol as buscar, outline } from '../symbols.ts';

/**
 * Where a symbol of `src/` is defined and who uses it.
 *
 * It is the only tool that reads the code and does not run it, and it is here for a
 * measured reason. The typical query, "where is `notesForRotation` and who depends on
 * it", costs 6207 bytes by `grep` plus a `Read` of the file (4544 over `src/` and
 * `mcp-server/src/`, plus 1663 of `music.ts`), against 415 here. The grep returns 40
 * hits, most of them repeated call sites of the same test, and it does not give the
 * signature, so the `Read` comes anyway.
 *
 * The signature and the first sentence of the doc travel in the answer, and that is
 * part of what pays: they are the bytes that avoid the `Read`.
 *
 * The paths resolve from this file and not from `process.cwd()`: an MCP client starts
 * the server, and it promises nothing about the working directory.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

/**
 * It adds edges to the graph but no symbols: the server imports 45 symbols of the
 * domain, so without it `usedBy` reports 2 users where there are 4.
 *
 * `pnpm verify` catches the break anyway, because the tsconfig of the server typechecks
 * across the package boundary. But by then the estimate was made with the wrong number.
 */
const GRAFO = [join(ROOT, 'mcp-server', 'src')];

/**
 * Limit of the substring search: the tool cuts and says that it cut. That is different
 * from a return of 20 that lets the reader believe there are no more.
 *
 * With no limit, `find_symbol("set")` returns tens of matches WITH signature, and the
 * signature of `SHAPES` or `BASE_MAP` is the whole value. The tool that is here because
 * it costs 415 bytes against 6207 would cost more than the `grep` it replaces.
 */
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
  // `readOnlyHint` says whether the tool CHANGES its environment, not whether it touches
  // the filesystem: this one reads `src/` from disk and builds the index in the query.
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
      // The counters come from the map that travels in the SAME answer, not from the raw
      // index. `index.exports` counts the tests and the outline omits them, so the raw
      // counters disagree with the list: measured, 84 symbols in 36 files above a list
      // of 78 in 26. The number is used to size a change, so it must be the number of
      // what is shown.
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
      // A miss is said. An empty list would make the agent guess whether the symbol does
      // not exist or the tool failed. A cut is said too.
      nota: todos.length === 0
        ? `No exported symbol of src/ matches "${name}". It can be local to its module (the index lists only exports), or it can belong to mcp-server/, whose symbols are not indexed: only its imports are read.`
        : todos.length > LIMITE
          ? `"${name}" matches ${todos.length} symbols by substring; these are the first ${LIMITE}. Search for the exact name to avoid the cut.`
          : undefined,
    });
  },
});
