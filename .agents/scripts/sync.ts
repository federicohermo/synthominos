import path from 'node:path';
import { realDisk, sync } from './copies.ts';

process.exitCode = sync(process.argv.slice(2), realDisk(path.resolve(import.meta.dirname, '../..')));
