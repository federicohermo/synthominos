import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { tools } from './tools/index.ts';
import { resources } from './resources/index.ts';

serveStdio(() => {
  const server = new McpServer(
    { name: 'pentomino-domain', version: '1.0.0' },
    // Without `resources: {}` the handshake announces no resources, and no client sees the ones below.
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
