import { realProveSystem } from './browser.ts';
import { doctor } from './proofs.ts';

process.exitCode = await doctor(process.argv.slice(2), realProveSystem());
