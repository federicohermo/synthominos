import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { tools } from './tools/index.ts';
import { resources } from './resources/index.ts';

/**
 * The MCP server of pentomino-games: it **runs the domain**, it does not describe it.
 *
 * There is no build step. Node 22.18 runs this `.ts` with the types stripped, and each
 * tool imports the real pure functions of `src/`. The source of truth is the code of
 * HEAD at the time of the query, so nothing goes stale and there is no `generatedAt` to
 * stamp.
 *
 * `find_symbol` is the partial exception: it DOES read the code as text, because "where
 * is X and who uses it" has no answer from a run. But it keeps the property that
 * matters: it builds the index in the query and does not persist it. So there is still
 * no artifact that someone must regenerate.
 *
 * The imports of `src/` have an explicit `.ts`, and that is NOT cosmetic: Node needs it
 * to resolve them. An import with no extension inside `src/` breaks this server and does
 * **not** break the app, because Vite resolves it anyway. `pnpm mcp:test` catches that
 * asymmetric failure.
 */

serveStdio(() => {
  const server = new McpServer(
    { name: 'pentomino-domain', version: '1.0.0' },
    // `resources: {}` is not decoration. The capabilities are what the server ANNOUNCES in
    // the handshake. Without the declaration it answers that it has no resources, the
    // registration below still runs, and no client sees it. It fails silently, on the
    // client side.
    { capabilities: { tools: {}, resources: {} } },
  );
  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        description: t.description,
        title: t.title,
        annotations: t.annotations,
        inputSchema: t.inputSchema,
      },
      t.run,
    );
  }
  for (const r of resources) {
    server.registerResource(r.name, r.uri, r.config, r.read);
  }
  return server;
});
