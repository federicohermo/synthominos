import { handle } from './protocol.ts';
import { readInput, realGit, realRunStore, respond } from './system.ts';

respond(handle(process.argv.slice(2), readInput(), realGit(import.meta.dirname), realRunStore()));
