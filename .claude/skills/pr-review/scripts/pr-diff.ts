import { prDiff, realDiffSystem } from './diff.ts';

// Materializes the diff of one PR and measures its review axes:
//   node .agents/scripts/pr-diff.ts <base-branch> <out-dir> [<head>]
// No branches on purpose: everything it decides lives in `diff.ts`.
process.exitCode = prDiff(process.argv.slice(2), realDiffSystem());
