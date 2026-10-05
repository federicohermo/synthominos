import { prDiff, realDiffSystem } from './diff.ts';

process.exitCode = prDiff(process.argv.slice(2), realDiffSystem());
