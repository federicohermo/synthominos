// Read-only: is the instance at <url> this app, and can it be driven? Exit 0 yes, 1 no.
import { open } from './app.mjs';

const url = process.argv[2];
if (url === undefined) {
  console.error('usage: node .agents/skills/verify-synthominos/scripts/doctor.mjs <url>');
  process.exit(2);
}

let app;
try {
  app = await open(url);
  const checks = {
    title: await app.page.title() === 'Synthominos',
    board: app.board.width > 0 && app.board.height > 0,
    twelvePieces: await app.page.getByRole('button', { name: /^[A-Z], rotación/ }).count() === 12,
    transport: await app.button('Reproducir').count() === 1,
    noConsoleError: app.errors.length === 0,
  };
  console.log(JSON.stringify({ url, board: app.board, checks, consoleErrors: app.errors }, null, 2));
  process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
} catch (error) {
  console.error(`not drivable: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  process.exitCode = 1;
} finally {
  await app?.close();
}
