import path from 'node:path';
import { realDisk, sync } from './copies.ts';

// Writes the harness copies (`node .agents/scripts/sync.ts`) or checks them (`--check`).
process.exitCode = sync(process.argv.slice(2), realDisk(path.resolve(import.meta.dirname, '../..')));
