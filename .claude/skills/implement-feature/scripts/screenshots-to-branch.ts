import { realScreenshotSystem, run } from './screenshots.ts';

process.exitCode = run(process.argv.slice(2), realScreenshotSystem());
