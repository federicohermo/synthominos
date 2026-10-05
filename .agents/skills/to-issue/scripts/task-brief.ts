import { realDraftSystem, run } from './brief.ts';

process.exitCode = run(process.argv.slice(2), import.meta.dirname, realDraftSystem());
