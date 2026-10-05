import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { tools } from './tools/index.ts';
import { resources } from './resources/index.ts';

/**
 * MCP server de pentomino-games: **ejecuta el dominio** en vez de describirlo.
 *
 * No hay paso de build: node 22.18 corre este `.ts` quitando los tipos, y cada
 * tool importa las funciones puras reales de `src/`. La fuente de verdad es el
 * codigo de HEAD en el momento de la consulta, asi que no hay staleness ni
 * `generatedAt` que sellar.
 *
 * `find_symbol` es la excepcion parcial y conviene decirla: SI mira el codigo como
 * texto, porque "donde esta X y quien lo usa" no se contesta ejecutando nada. Pero
 * mantiene la propiedad que importa —construye el indice en la consulta y no lo
 * persiste—, asi que sigue sin haber artefacto que alguien tenga que regenerar.
 *
 * Los imports de `src/` llevan `.ts` explicito, y eso NO es cosmetico: node los
 * necesita para resolver. Un import sin extension dentro de `src/` rompe
 * este server y **no** rompe la app, porque Vite resuelve igual — un modo de
 * falla asimetrico que ataja `pnpm mcp:test`.
 */

serveStdio(() => {
  const server = new McpServer(
    { name: 'pentomino-domain', version: '1.0.0' },
    // `resources: {}` no es decorativo: las capabilities son lo que el server ANUNCIA en el
    // handshake, y sin declararlas contesta que no tiene resources — el registro de abajo
    // corre igual y no lo ve nadie. Falla en silencio y del lado del cliente.
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
