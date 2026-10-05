import { main, realIo } from './cli.ts';

// The kernel as a command: `node .spec-anchored/spec-anchored.ts <command> ...`.
// No branches on purpose: everything it decides lives in `cli.ts` and `kernel.ts`.
process.exitCode = main(process.argv.slice(2), realIo());
