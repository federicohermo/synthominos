import { clean, realMachine } from './worktrees.ts';

// Removes worktrees under `.claude/worktrees/`, and only there:
//   node .agents/scripts/clean-worktrees.ts .claude/worktrees/a .claude/worktrees/b
process.exitCode = clean(process.argv.slice(2), realMachine(process.platform));
