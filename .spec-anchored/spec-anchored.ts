import { main, realIo } from './cli.ts';

process.exitCode = main(process.argv.slice(2), realIo());
