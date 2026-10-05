import { clean, realMachine } from './worktrees.ts';

process.exitCode = clean(process.argv.slice(2), realMachine(process.platform));
