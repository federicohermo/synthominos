import { realProveSystem } from './browser.ts';
import { prove } from './proofs.ts';

process.exitCode = await prove(process.argv.slice(2), realProveSystem());
