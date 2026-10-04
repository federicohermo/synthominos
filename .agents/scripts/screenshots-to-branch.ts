import { realScreenshotSystem, run } from './screenshots.ts';

// Pushes a folder of screenshots to the orphan branch `screenshots/<N>`:
//   node .agents/scripts/screenshots-to-branch.ts <issue-number> <folder> [--no-push]
// No branches on purpose: everything it decides lives in `screenshots.ts`.
process.exitCode = run(process.argv.slice(2), realScreenshotSystem());
